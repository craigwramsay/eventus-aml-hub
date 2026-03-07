'use server';

/**
 * Server Actions for Assessment Evidence
 *
 * Manages verification evidence (CH lookups, file uploads, manual records).
 * Evidence is append-only — no updates or deletes.
 * All operations respect RLS and require authentication.
 */

import { createClient } from '@/lib/supabase/server';
import type { AssessmentEvidence, EvidenceType } from '@/lib/supabase/types';
import { triggerClioSync } from '@/app/actions/clio-drive';
import { lookupCompany, CompaniesHouseError } from '@/lib/companies-house';
import type { UserRole } from '@/lib/auth/roles';
import { canCreateAssessment } from '@/lib/auth/roles';
import { toggleItemCompletion } from '@/app/actions/progress';
import { getCddStalenessConfig } from '@/lib/rules-engine/config-loader';

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
    const verifiedAtRaw = formData.get('verified_at') as string | null;
    const verifiedAt = verifiedAtRaw || null;

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
        verified_at: verifiedAt,
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

    // Update client CDD date if this is an identity verification action
    if (actionId && isIdentityActionId(actionId) && verifiedAt) {
      await updateClientCddDate(supabase, assessmentId, verifiedAt);
    }

    // Clio Drive sync (non-blocking)
    triggerClioSync(assessmentId, data.id, profile.firm_id, user.id).catch(() => {});

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
  actionId?: string,
  verifiedAt?: string | null
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
        verified_at: verifiedAt || null,
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

    // Update client CDD date if this is an identity verification action
    if (actionId && isIdentityActionId(actionId) && verifiedAt) {
      await updateClientCddDate(supabase, assessmentId, verifiedAt);
    }

    return { success: true, evidence: data as AssessmentEvidence };
  } catch (err) {
    console.error('Error in addManualRecord:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Save a SoW or SoF form declaration.
 * Upserts: if a declaration of the same type already exists for this assessment, replaces it.
 */
export async function saveSowSofForm(
  assessmentId: string,
  formType: 'sow' | 'sof',
  formData: Record<string, string | string[]>
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

    const evidenceType = formType === 'sow' ? 'sow_declaration' : 'sof_declaration';
    const actionId = formType === 'sow' ? 'sow_form' : 'sof_form';
    const label = formType === 'sow' ? 'Source of Wealth Declaration' : 'Source of Funds Declaration';

    // Check for existing declaration to replace
    const { data: existing } = await supabase
      .from('assessment_evidence')
      .select('id')
      .eq('assessment_id', assessmentId)
      .eq('evidence_type', evidenceType)
      .maybeSingle();

    if (existing) {
      // Delete the old one (replace pattern for declarations)
      await supabase
        .from('assessment_evidence')
        .delete()
        .eq('id', existing.id);
    }

    const { data, error: insertErr } = await supabase
      .from('assessment_evidence')
      .insert({
        firm_id: profile.firm_id,
        assessment_id: assessmentId,
        action_id: actionId,
        evidence_type: evidenceType as EvidenceType,
        label,
        source: 'Declaration form',
        data: formData as unknown as Record<string, unknown>,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertErr || !data) {
      console.error('Failed to save SoW/SoF declaration:', insertErr);
      return { success: false, error: 'Failed to save declaration' };
    }

    // Mark the CDD item as complete
    await toggleItemCompletion(assessmentId, actionId, true);

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'assessment_evidence',
      entity_id: data.id,
      action: `${formType}_declaration_saved`,
      metadata: {
        assessment_id: assessmentId,
        form_type: formType,
      },
      created_by: user.id,
    });

    // Non-blocking Clio Drive sync
    triggerClioSync(assessmentId, data.id, profile.firm_id, user.id).catch(() => {});

    return { success: true, evidence: data as AssessmentEvidence };
  } catch (err) {
    console.error('Error in saveSowSofForm:', err);
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

    // Mark the CDD item as complete (the next item asks user to confirm consistency)
    if (actionId) {
      await toggleItemCompletion(assessmentId, actionId, true);
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

    // Clio Drive sync (non-blocking)
    triggerClioSync(assessmentId, data.id, profile.firm_id, user.id).catch(() => {});

    return { success: true, evidence: data as AssessmentEvidence };
  } catch (err) {
    console.error('Error in lookupCompaniesHouse:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Carry forward a Companies House lookup from a prior assessment for the same client.
 * Copies the CH evidence record to the new assessment with 'Carried forward' source.
 * Only carries forward if the prior lookup is within the 24-month longstop.
 * Returns the copied evidence record, or null if nothing to carry forward.
 */
export async function carryForwardCompaniesHouse(
  newAssessmentId: string,
  clientId: string,
  firmId: string,
  userId: string
): Promise<AssessmentEvidence | null> {
  try {
    const supabase = await createClient();

    // Get all matters for this client
    const { data: matters } = await supabase
      .from('matters')
      .select('id')
      .eq('client_id', clientId);

    if (!matters || matters.length === 0) return null;

    const matterIds = matters.map((m) => m.id);

    // Get all assessments for these matters (excluding the new one)
    const { data: assessments } = await supabase
      .from('assessments')
      .select('id')
      .in('matter_id', matterIds)
      .neq('id', newAssessmentId)
      .order('created_at', { ascending: false });

    if (!assessments || assessments.length === 0) return null;

    const assessmentIds = assessments.map((a) => a.id);

    // Find the most recent CH evidence from any prior assessment
    const { data: chEvidence } = await supabase
      .from('assessment_evidence')
      .select('*')
      .in('assessment_id', assessmentIds)
      .eq('evidence_type', 'companies_house')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!chEvidence) return null;

    // Check 24-month longstop
    const cddConfig = getCddStalenessConfig();
    const longstopMonths = cddConfig.universalLongstopMonths ?? 24;
    const createdAt = new Date(chEvidence.created_at);
    const longstopDate = new Date(createdAt);
    longstopDate.setMonth(longstopDate.getMonth() + longstopMonths);
    if (new Date() >= longstopDate) return null;

    // Copy the evidence record to the new assessment
    const { data: copied, error: insertErr } = await supabase
      .from('assessment_evidence')
      .insert({
        firm_id: firmId,
        assessment_id: newAssessmentId,
        action_id: chEvidence.action_id,
        evidence_type: 'companies_house',
        label: chEvidence.label,
        source: 'Carried forward',
        data: chEvidence.data,
        notes: `Carried forward from assessment created on ${createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        created_by: userId,
      })
      .select()
      .single();

    if (insertErr || !copied) {
      console.error('Failed to carry forward CH evidence:', insertErr);
      return null;
    }

    // Mark the CDD item as complete
    if (chEvidence.action_id) {
      await toggleItemCompletion(newAssessmentId, chEvidence.action_id, true);
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: firmId,
      entity_type: 'assessment_evidence',
      entity_id: copied.id,
      action: 'ch_evidence_carried_forward',
      metadata: {
        new_assessment_id: newAssessmentId,
        source_assessment_id: chEvidence.assessment_id,
        source_evidence_id: chEvidence.id,
        original_lookup_date: chEvidence.created_at,
      },
      created_by: userId,
    });

    // Clio Drive sync (non-blocking)
    triggerClioSync(newAssessmentId, copied.id, firmId, userId).catch(() => {});

    return copied as AssessmentEvidence;
  } catch (err) {
    // Non-fatal — log but don't fail the assessment creation
    console.error('Error in carryForwardCompaniesHouse:', err);
    return null;
  }
}

/**
 * Get the latest SoW declaration evidence for a client across all their assessments.
 * Used for pre-populating the SoW form on new assessments.
 */
export async function getLatestSowForClient(
  clientId: string
): Promise<Record<string, string | string[]> | null> {
  try {
    if (!clientId) return null;

    const { supabase, error } = await getUserAndProfile();
    if (error) return null;

    // Get all matters for this client
    const { data: matters } = await supabase
      .from('matters')
      .select('id')
      .eq('client_id', clientId);

    if (!matters || matters.length === 0) return null;

    const matterIds = matters.map((m) => m.id);

    // Get all assessments for these matters
    const { data: assessments } = await supabase
      .from('assessments')
      .select('id')
      .in('matter_id', matterIds)
      .order('created_at', { ascending: false });

    if (!assessments || assessments.length === 0) return null;

    const assessmentIds = assessments.map((a) => a.id);

    // Find the most recent SoW declaration
    const { data: sowEvidence } = await supabase
      .from('assessment_evidence')
      .select('data')
      .in('assessment_id', assessmentIds)
      .eq('evidence_type', 'sow_declaration')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sowEvidence?.data) return null;

    return sowEvidence.data as Record<string, string | string[]>;
  } catch (err) {
    console.error('Error in getLatestSowForClient:', err);
    return null;
  }
}

/**
 * Check if an action ID corresponds to an identity verification action.
 * Mirrors the client-side isIdentityAction() logic.
 */
function isIdentityActionId(actionId: string): boolean {
  return (
    actionId.includes('identity_verification') ||
    actionId.includes('verify_identity') ||
    actionId.includes('identify_and_verify')
  );
}

/**
 * Confirm that a prior identity verification is still valid for this assessment.
 * Creates a manual evidence record, marks the checklist item complete, and audit logs.
 *
 * Only allowed when the prior verification is within the risk-based threshold
 * and the universal longstop has not been breached.
 */
export async function confirmIdentityStillValid(
  assessmentId: string,
  actionId: string,
  lastCddVerifiedAt: string,
  riskLevel: string
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

    // Check assessment is not finalised
    const checkSupabase = await createClient();
    const { data: assessment } = await checkSupabase
      .from('assessments')
      .select('finalised_at')
      .eq('id', assessmentId)
      .single();

    if (assessment?.finalised_at) {
      return { success: false, error: 'Assessment is finalised and cannot be modified' };
    }

    if (!isIdentityActionId(actionId)) {
      return { success: false, error: 'Action is not an identity verification action' };
    }

    // Server-side threshold re-check
    const cddConfig = getCddStalenessConfig();
    const longstopMonths = cddConfig.universalLongstopMonths ?? 24;
    const verifiedDate = new Date(lastCddVerifiedAt);
    const now = new Date();

    // Check longstop first
    const longstopDate = new Date(verifiedDate);
    longstopDate.setMonth(longstopDate.getMonth() + longstopMonths);
    if (now >= longstopDate) {
      return { success: false, error: 'Universal longstop breached — re-verification required' };
    }

    // Check risk-based threshold
    const normalisedRisk = riskLevel.toUpperCase();
    const threshold = cddConfig.thresholds[normalisedRisk];
    if (threshold) {
      const thresholdDate = new Date(verifiedDate);
      thresholdDate.setMonth(thresholdDate.getMonth() + threshold.months);
      if (now >= thresholdDate) {
        return { success: false, error: `Prior verification exceeds ${threshold.label} threshold for ${normalisedRisk} risk` };
      }
    }

    // Calculate months since verification for the notes
    const monthsSince = Math.floor(
      (now.getTime() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    );
    const thresholdLabel = threshold?.label ?? `${longstopMonths} months`;

    // Create evidence record
    const { data, error: insertErr } = await supabase
      .from('assessment_evidence')
      .insert({
        firm_id: profile.firm_id,
        assessment_id: assessmentId,
        action_id: actionId,
        evidence_type: 'manual_record',
        label: 'Prior identity verification confirmed still valid',
        source: 'Manual',
        notes: `Identity last verified on ${verifiedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Confirmed still within ${thresholdLabel} review period for ${normalisedRisk} risk.`,
        verified_at: lastCddVerifiedAt,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertErr || !data) {
      console.error('Failed to create confirmation record:', insertErr);
      return { success: false, error: 'Failed to create evidence record' };
    }

    // Mark the checklist item as complete
    await toggleItemCompletion(assessmentId, actionId, true);

    // Update client CDD date (preserves the original verification date)
    await updateClientCddDate(supabase, assessmentId, lastCddVerifiedAt);

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'assessment_evidence',
      entity_id: data.id,
      action: 'identity_confirmed_still_valid',
      metadata: {
        assessment_id: assessmentId,
        action_id: actionId,
        last_cdd_verified_at: lastCddVerifiedAt,
        months_since_verification: monthsSince,
        risk_level: normalisedRisk,
      },
      created_by: user.id,
    });

    return { success: true, evidence: data as AssessmentEvidence };
  } catch (err) {
    console.error('Error in confirmIdentityStillValid:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Confirm that corporate documents (e.g. certificate of incorporation, articles)
 * have been saved to the matter compliance folder.
 * Creates a manual evidence record, marks the checklist item complete, and audit logs.
 */
export async function confirmDocumentSaved(
  assessmentId: string,
  actionId: string
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

    // Check assessment is not finalised
    const checkSupabase = await createClient();
    const { data: assessment } = await checkSupabase
      .from('assessments')
      .select('finalised_at')
      .eq('id', assessmentId)
      .single();

    if (assessment?.finalised_at) {
      return { success: false, error: 'Assessment is finalised and cannot be modified' };
    }

    // Create evidence record
    const { data, error: insertErr } = await supabase
      .from('assessment_evidence')
      .insert({
        firm_id: profile.firm_id,
        assessment_id: assessmentId,
        action_id: actionId,
        evidence_type: 'manual_record',
        label: 'Documents saved to matter compliance folder',
        source: 'Manual',
        notes: 'Certificate of incorporation and articles of association saved to matter compliance folder.',
        created_by: user.id,
      })
      .select()
      .single();

    if (insertErr || !data) {
      console.error('Failed to create document confirmation record:', insertErr);
      return { success: false, error: 'Failed to create evidence record' };
    }

    // Mark the checklist item as complete
    await toggleItemCompletion(assessmentId, actionId, true);

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'assessment_evidence',
      entity_id: data.id,
      action: 'document_saved_confirmed',
      metadata: {
        assessment_id: assessmentId,
        action_id: actionId,
      },
      created_by: user.id,
    });

    return { success: true, evidence: data as AssessmentEvidence };
  } catch (err) {
    console.error('Error in confirmDocumentSaved:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Update the client's last_cdd_verified_at date when identity verification
 * evidence is recorded. Only updates if the new date is more recent.
 */
async function updateClientCddDate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assessmentId: string,
  verifiedAt: string
): Promise<void> {
  try {
    // assessment -> matter -> client
    const { data: assessment } = await supabase
      .from('assessments')
      .select('matter_id')
      .eq('id', assessmentId)
      .single();

    if (!assessment) return;

    const { data: matter } = await supabase
      .from('matters')
      .select('client_id')
      .eq('id', assessment.matter_id)
      .single();

    if (!matter) return;

    const { data: client } = await supabase
      .from('clients')
      .select('last_cdd_verified_at')
      .eq('id', matter.client_id)
      .single();

    if (!client) return;

    // Only update if the new date is more recent (or no previous date)
    if (!client.last_cdd_verified_at || verifiedAt > client.last_cdd_verified_at) {
      await supabase
        .from('clients')
        .update({ last_cdd_verified_at: verifiedAt })
        .eq('id', matter.client_id);
    }
  } catch (err) {
    // Non-fatal — log but don't fail the evidence operation
    console.error('Failed to update client CDD date:', err);
  }
}
