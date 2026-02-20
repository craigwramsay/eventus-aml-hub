'use server';

/**
 * Server Actions for Assessment Evidence
 *
 * Manages verification evidence (CH lookups, file uploads, manual records).
 * Evidence is append-only — no updates or deletes.
 * All operations respect RLS and require authentication.
 */

import { createClient } from '@/lib/supabase/server';
import type { AssessmentEvidence } from '@/lib/supabase/types';
import { lookupCompany, CompaniesHouseError } from '@/lib/companies-house';
import type { UserRole } from '@/lib/auth/roles';
import { canCreateAssessment } from '@/lib/auth/roles';

/** Result types */
export type EvidenceResult =
  | { success: true; evidence: AssessmentEvidence[] }
  | { success: false; error: string };

export type SingleEvidenceResult =
  | { success: true; evidence: AssessmentEvidence }
  | { success: false; error: string };

/**
 * Fetch authenticated user + profile (same pattern as assessments.ts)
 */
async function getUserAndProfile() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { supabase, user: null, profile: null, error: 'Not authenticated' };
  }

  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('user_id, firm_id, role')
    .eq('user_id', user.id)
    .single();

  if (profileErr || !profile) {
    return { supabase, user, profile: null, error: 'User profile not found' };
  }

  return { supabase, user, profile, error: null };
}

/**
 * Validate that the user's firm owns the assessment.
 * Returns the assessment's firm_id or an error.
 */
async function validateAssessmentAccess(
  assessmentId: string,
  firmId: string
) {
  const supabase = await createClient();

  const { data: assessment, error } = await supabase
    .from('assessments')
    .select('id, firm_id')
    .eq('id', assessmentId)
    .single();

  if (error || !assessment) {
    return { valid: false as const, error: 'Assessment not found or access denied' };
  }

  if (assessment.firm_id !== firmId) {
    return { valid: false as const, error: 'Assessment does not belong to your firm' };
  }

  return { valid: true as const, firmId: assessment.firm_id };
}

/**
 * Get all evidence records for an assessment, ordered by created_at desc.
 */
export async function getEvidenceForAssessment(
  assessmentId: string
): Promise<EvidenceResult> {
  try {
    if (!assessmentId) {
      return { success: false, error: 'Assessment ID is required' };
    }

    const { supabase, error } = await getUserAndProfile();
    if (error) {
      return { success: false, error };
    }

    const { data, error: fetchErr } = await supabase
      .from('assessment_evidence')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('created_at', { ascending: false });

    if (fetchErr) {
      console.error('Failed to fetch evidence:', fetchErr);
      return { success: false, error: 'Failed to fetch evidence records' };
    }

    return { success: true, evidence: (data || []) as AssessmentEvidence[] };
  } catch (err) {
    console.error('Error in getEvidenceForAssessment:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Upload a file as evidence.
 * Stores the file in Supabase Storage and creates an evidence record.
 */
export async function uploadEvidence(
  assessmentId: string,
  formData: FormData,
  actionId?: string
): Promise<SingleEvidenceResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canCreateAssessment(profile.role as UserRole)) {
      return { success: false, error: 'Your role does not permit adding evidence' };
    }

    const access = await validateAssessmentAccess(assessmentId, profile.firm_id);
    if (!access.valid) {
      return { success: false, error: access.error };
    }

    const file = formData.get('file') as File | null;
    const notes = formData.get('notes') as string | null;

    if (!file || file.size === 0) {
      return { success: false, error: 'No file provided' };
    }

    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop() || 'bin';
    const storagePath = `${profile.firm_id}/${assessmentId}/${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadErr } = await supabase.storage
      .from('evidence')
      .upload(storagePath, file);

    if (uploadErr) {
      console.error('Storage upload failed:', uploadErr);
      return { success: false, error: 'Failed to upload file' };
    }

    // Create evidence record
    const { data, error: insertErr } = await supabase
      .from('assessment_evidence')
      .insert({
        firm_id: profile.firm_id,
        assessment_id: assessmentId,
        action_id: actionId || null,
        evidence_type: 'file_upload',
        label: file.name,
        source: 'Manual',
        file_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        notes: notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertErr || !data) {
      console.error('Failed to create evidence record:', insertErr);
      return { success: false, error: 'Failed to create evidence record' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'assessment_evidence',
      entity_id: data.id,
      action: 'evidence_uploaded',
      metadata: {
        assessment_id: assessmentId,
        file_name: file.name,
        file_size: file.size,
      },
      created_by: user.id,
    });

    return { success: true, evidence: data as AssessmentEvidence };
  } catch (err) {
    console.error('Error in uploadEvidence:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Add a manual evidence record (no file, just metadata).
 */
export async function addManualRecord(
  assessmentId: string,
  label: string,
  notes: string,
  actionId?: string
): Promise<SingleEvidenceResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canCreateAssessment(profile.role as UserRole)) {
      return { success: false, error: 'Your role does not permit adding evidence' };
    }

    if (!label.trim()) {
      return { success: false, error: 'Label is required' };
    }

    const access = await validateAssessmentAccess(assessmentId, profile.firm_id);
    if (!access.valid) {
      return { success: false, error: access.error };
    }

    const { data, error: insertErr } = await supabase
      .from('assessment_evidence')
      .insert({
        firm_id: profile.firm_id,
        assessment_id: assessmentId,
        action_id: actionId || null,
        evidence_type: 'manual_record',
        label: label.trim(),
        source: 'Manual',
        notes: notes.trim() || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertErr || !data) {
      console.error('Failed to create manual record:', insertErr);
      return { success: false, error: 'Failed to create evidence record' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'assessment_evidence',
      entity_id: data.id,
      action: 'manual_record_added',
      metadata: {
        assessment_id: assessmentId,
        label: label.trim(),
      },
      created_by: user.id,
    });

    return { success: true, evidence: data as AssessmentEvidence };
  } catch (err) {
    console.error('Error in addManualRecord:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Look up a company at Companies House and store the result as evidence.
 * Each call creates a new evidence record (previous lookups are preserved).
 */
export async function lookupCompaniesHouse(
  assessmentId: string,
  companyNumber: string,
  actionId?: string
): Promise<SingleEvidenceResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canCreateAssessment(profile.role as UserRole)) {
      return { success: false, error: 'Your role does not permit adding evidence' };
    }

    if (!companyNumber.trim()) {
      return { success: false, error: 'Company number is required' };
    }

    const access = await validateAssessmentAccess(assessmentId, profile.firm_id);
    if (!access.valid) {
      return { success: false, error: access.error };
    }

    // Call Companies House API
    let chResult;
    try {
      chResult = await lookupCompany(companyNumber.trim());
    } catch (err) {
      if (err instanceof CompaniesHouseError) {
        return { success: false, error: err.message };
      }
      throw err;
    }

    // Store as evidence
    const label = `Companies House Report - ${chResult.profile.company_number} (${chResult.profile.company_name})`;

    const { data, error: insertErr } = await supabase
      .from('assessment_evidence')
      .insert({
        firm_id: profile.firm_id,
        assessment_id: assessmentId,
        action_id: actionId || null,
        evidence_type: 'companies_house',
        label,
        source: 'Companies House',
        data: chResult as unknown as Record<string, unknown>,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertErr || !data) {
      console.error('Failed to store CH evidence:', insertErr);
      return { success: false, error: 'Failed to store Companies House result' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'assessment_evidence',
      entity_id: data.id,
      action: 'companies_house_lookup',
      metadata: {
        assessment_id: assessmentId,
        company_number: chResult.profile.company_number,
        company_name: chResult.profile.company_name,
        company_status: chResult.profile.company_status,
      },
      created_by: user.id,
    });

    return { success: true, evidence: data as AssessmentEvidence };
  } catch (err) {
    console.error('Error in lookupCompaniesHouse:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
