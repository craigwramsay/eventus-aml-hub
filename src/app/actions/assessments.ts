'use server';

/**
 * Server Actions for Assessment Operations
 *
 * Canonical file for all assessment server actions.
 * All operations run on the server and respect RLS policies.
 * No service role key is used — all operations are authenticated via user session.
 */

import { createClient } from '@/lib/supabase/server';
import { runAssessment } from '@/lib/rules-engine';
import type { FormAnswers, ClientType, AssessmentOutput } from '@/lib/rules-engine/types';
import type { Assessment, Client, Matter } from '@/lib/supabase/types';
import { canCreateAssessment, canFinaliseAssessment, canDeleteEntities } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';

/** Matter with joined client data */
export interface MatterWithClient extends Matter {
  client: Client;
}

/**
 * Generate a unique assessment reference (pattern: A-XXXXX-YYYY)
 * Mirrors generateMatterRef() in matters.ts
 */
function generateAssessmentRef(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `A-${timestamp}-${random}`;
}

/** Input for submitting an assessment */
export interface SubmitAssessmentInput {
  matter_id: string;
  form_answers: FormAnswers;
}


/** Result of submitting an assessment */
export type SubmitAssessmentResult =
  | { success: true; assessment: Assessment }
  | { success: false; error: string };

/**
 * Fetch the authenticated user + their user_profiles row (firm scoped)
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
    return {
      supabase,
      user,
      profile: null,
      error: 'User profile not found',
    };
  }

  if (!profile.firm_id) {
    return {
      supabase,
      user,
      profile: null,
      error: 'User profile missing firm_id',
    };
  }

  return { supabase, user, profile, error: null };
}

/**
 * Get a matter with its client for assessment
 */
export async function getMatterForAssessment(matterId: string): Promise<MatterWithClient | null> {
  try {
    if (!matterId) return null;

    const { supabase, error } = await getUserAndProfile();
    if (error) return null;

    const { data, error: fetchErr } = await supabase
      .from('matters')
      .select('*, client:clients(*)')
      .eq('id', matterId)
      .single();

    if (fetchErr || !data) {
      return null;
    }

    return data as MatterWithClient;
  } catch (error) {
    console.error('Error in getMatterForAssessment:', error);
    return null;
  }
}

/**
 * Submit an assessment using the deterministic rules engine
 */
export async function submitAssessment(
  input: SubmitAssessmentInput
): Promise<SubmitAssessmentResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !profile || !user) {
      return { success: false, error: error || 'User profile not found' };
    }

    if (!canCreateAssessment(profile.role as UserRole)) {
      return { success: false, error: 'Your role does not permit creating assessments' };
    }

    const { matter_id, form_answers } = input;

    if (!matter_id) {
      return { success: false, error: 'Matter ID is required' };
    }

    if (!form_answers || Object.keys(form_answers).length === 0) {
      return { success: false, error: 'Form answers are required' };
    }

    // Fetch matter + client
    const { data: matterWithClient, error: matterErr } = await supabase
      .from('matters')
      .select('*, client:clients(*)')
      .eq('id', matter_id)
      .single();

    if (matterErr || !matterWithClient) {
      return { success: false, error: 'Matter not found' };
    }

    if (matterWithClient.firm_id !== profile.firm_id) {
      return { success: false, error: 'Matter does not belong to your firm' };
    }

    const client = matterWithClient.client as Client;

    // ---- DERIVE CLIENT TYPE FROM ENTITY TYPE ----
    const entityType = client.entity_type;

    if (!entityType) {
      return { success: false, error: 'Client entity type not set' };
    }

    const derivedClientType: ClientType =
      entityType === 'Individual' ? 'individual' : 'corporate';

    // ---- DERIVE SECTOR RISK FROM CONFIG ----
    const { getSectorMappingConfig } = await import('@/lib/rules-engine/config-loader');
    const sectorMapping = getSectorMappingConfig();

    const clientSector = client.sector;

    if (!clientSector) {
      return { success: false, error: 'Client sector not set' };
    }

    let derivedSectorRisk: 'Standard' | 'Higher-risk' | 'Prohibited' | null = null;

    for (const [category, sectors] of Object.entries(sectorMapping.categories)) {
      if (sectors.includes(clientSector)) {
        derivedSectorRisk = category as 'Standard' | 'Higher-risk' | 'Prohibited';
        break;
      }
    }

    if (!derivedSectorRisk) {
      return {
        success: false,
        error: `Client sector "${clientSector}" not mapped in sector_mapping.json`,
      };
    }

    const enrichedFormAnswers: FormAnswers = {
      ...form_answers,
      '49': derivedSectorRisk,
    };

    const assessmentOutput = runAssessment({
      clientType: derivedClientType,
      formAnswers: enrichedFormAnswers,
    });

    // Fetch firm jurisdiction for input snapshot
    const { data: firmData } = await supabase
      .from('firms')
      .select('jurisdiction')
      .eq('id', profile.firm_id)
      .single();

    const inputSnapshot = {
      clientType: derivedClientType,
      formAnswers: enrichedFormAnswers,
      ...(firmData?.jurisdiction ? { jurisdiction: firmData.jurisdiction } : {}),
    };

    const { data, error: insertErr } = await supabase
      .from('assessments')
      .insert({
        firm_id: profile.firm_id,
        matter_id,
        reference: generateAssessmentRef(),
        input_snapshot: inputSnapshot,
        output_snapshot: assessmentOutput,
        risk_level: assessmentOutput.riskLevel,
        score: assessmentOutput.score,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertErr || !data) {
      console.error('Failed to create assessment:', insertErr);
      return { success: false, error: 'Failed to create assessment' };
    }

    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'assessment',
      entity_id: data.id,
      action: 'assessment_created',
      metadata: {
        matter_id,
        risk_level: assessmentOutput.riskLevel,
        score: assessmentOutput.score,
      },
      created_by: user.id,
    });

    return { success: true, assessment: data as Assessment };
  } catch (error) {
    console.error('Error in submitAssessment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}




/**
 * Get a single assessment by ID
 */
export async function getAssessment(assessmentId: string): Promise<Assessment | null> {
  try {
    if (!assessmentId) return null;

    const { supabase, error } = await getUserAndProfile();
    if (error) return null;

    const { data, error: fetchErr } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', assessmentId)
      .single();

    if (fetchErr || !data) {
      return null;
    }

    return data as Assessment;
  } catch (error) {
    console.error('Error in getAssessment:', error);
    return null;
  }
}

/**
 * Get all assessments for a matter
 */
export async function getAssessmentsForMatter(
  matterId: string
): Promise<Assessment[]> {
  try {
    if (!matterId) return [];

    const { supabase, error } = await getUserAndProfile();
    if (error) return [];

    const { data, error: fetchErr } = await supabase
      .from('assessments')
      .select('*')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false });

    if (fetchErr || !data) {
      return [];
    }

    return data as Assessment[];
  } catch (error) {
    console.error('Error in getAssessmentsForMatter:', error);
    return [];
  }
}

/** Assessment list item with client and matter names */
export interface AssessmentListItem {
  id: string;
  reference: string;
  risk_level: string;
  score: number;
  created_at: string;
  finalised_at: string | null;
  client_name: string;
  matter_id: string;
  matter_description: string | null;
  matter_reference: string;
}

/**
 * Get all assessments for the current user's firm, with client and matter info.
 * Returns newest first.
 */
export async function getAllAssessments(): Promise<AssessmentListItem[]> {
  try {
    const { supabase, error } = await getUserAndProfile();
    if (error) return [];

    const { data, error: fetchErr } = await supabase
      .from('assessments')
      .select('id, reference, risk_level, score, created_at, finalised_at, matter_id')
      .order('created_at', { ascending: false });

    if (fetchErr || !data) {
      console.error('Failed to get assessments:', fetchErr);
      return [];
    }

    if (data.length === 0) return [];

    // Fetch related matters and clients in bulk
    const matterIds = [...new Set(data.map((a) => a.matter_id))];

    const { data: matters } = await supabase
      .from('matters')
      .select('id, reference, description, client_id')
      .in('id', matterIds);

    if (!matters) return [];

    const clientIds = [...new Set(matters.map((m) => m.client_id))];

    const { data: clients } = await supabase
      .from('clients')
      .select('id, name')
      .in('id', clientIds);

    if (!clients) return [];

    // Build lookup maps
    const clientMap = new Map(clients.map((c) => [c.id, c]));
    const matterMap = new Map(
      matters.map((m) => [m.id, { ...m, client: clientMap.get(m.client_id) }])
    );

    return data.map((assessment) => {
      const matter = matterMap.get(assessment.matter_id);
      return {
        id: assessment.id,
        reference: assessment.reference,
        risk_level: assessment.risk_level,
        score: assessment.score,
        created_at: assessment.created_at,
        finalised_at: assessment.finalised_at,
        client_name: matter?.client?.name || 'Unknown',
        matter_id: assessment.matter_id,
        matter_description: matter?.description || null,
        matter_reference: matter?.reference || 'Unknown',
      };
    });
  } catch (error) {
    console.error('Error in getAllAssessments:', error);
    return [];
  }
}

/** Assessment with related client and matter data */
export interface AssessmentWithDetails {
  assessment: Assessment;
  client: Client;
  matter: Matter;
  outputSnapshot: AssessmentOutput;
  registeredNumber: string | null;
}

/** Result of getting assessment with details */
export type GetAssessmentWithDetailsResult =
  | {
      success: true;
      data: AssessmentWithDetails;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Get assessment with full details including client and matter
 */
export async function getAssessmentWithDetails(
  assessmentId: string
): Promise<GetAssessmentWithDetailsResult> {
  try {
    if (!assessmentId) {
      return { success: false, error: 'Missing required field: assessmentId' };
    }

    const { supabase, error } = await getUserAndProfile();
    if (error) {
      return { success: false, error: error || 'Not authenticated' };
    }

    // Fetch assessment (RLS enforces access)
    const { data: assessmentData, error: assessmentError } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessmentData) {
      return { success: false, error: 'Assessment not found or access denied' };
    }

    const assessment = assessmentData as Assessment;

    // Fetch matter
    const { data: matterData, error: matterError } = await supabase
      .from('matters')
      .select('*')
      .eq('id', assessment.matter_id)
      .single();

    if (matterError || !matterData) {
      return { success: false, error: 'Matter not found' };
    }

    const matter = matterData as Matter;

    // Fetch client
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', matter.client_id)
      .single();

    if (clientError || !clientData) {
      return { success: false, error: 'Client not found' };
    }

    const client = clientData as Client;

    // Parse output_snapshot as AssessmentOutput
    const outputSnapshot = assessment.output_snapshot as unknown as AssessmentOutput;

    return {
      success: true,
      data: {
        assessment,
        client,
        matter,
        outputSnapshot,
        registeredNumber: client.registered_number || null,
      },
    };
  } catch (error) {
    console.error('Error in getAssessmentWithDetails:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/** Result of finalising an assessment */
export type FinaliseAssessmentResult =
  | { success: true; assessment: Assessment }
  | { success: false; error: string };

/**
 * Check if an assessment is finalised
 */
function isAssessmentFinalised(assessment: Assessment): boolean {
  return assessment.finalised_at !== null;
}

/**
 * Finalise an assessment
 *
 * Once finalised, an assessment cannot be modified.
 * Sets finalised_at timestamp, finalised_by to current user,
 * and inserts an audit_event.
 */
export async function finaliseAssessment(
  assessmentId: string
): Promise<FinaliseAssessmentResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'User profile not found' };
    }

    if (!canFinaliseAssessment(profile.role as UserRole)) {
      return { success: false, error: 'Your role does not permit finalising assessments' };
    }

    // Fetch the assessment (RLS will enforce access)
    const { data: existingData, error: fetchError } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', assessmentId)
      .single();

    if (fetchError || !existingData) {
      return { success: false, error: 'Assessment not found or access denied' };
    }

    const existing = existingData as Assessment;

    // Verify firm_id matches user's firm
    if (existing.firm_id !== profile.firm_id) {
      return { success: false, error: 'Access denied: assessment belongs to a different firm' };
    }

    // Check if already finalised
    if (isAssessmentFinalised(existing)) {
      return { success: false, error: 'Assessment is already finalised and cannot be modified' };
    }

    const finalisedAt = new Date().toISOString();

    // Update assessment with finalised timestamp
    const { data: updatedData, error: updateError } = await supabase
      .from('assessments')
      .update({
        finalised_at: finalisedAt,
        finalised_by: user.id,
      })
      .eq('id', assessmentId)
      .select()
      .single();

    if (updateError || !updatedData) {
      console.error('Failed to finalise assessment:', updateError);
      return { success: false, error: 'Failed to finalise assessment' };
    }

    const assessment = updatedData as Assessment;

    // Insert audit event
    const { error: auditError } = await supabase
      .from('audit_events')
      .insert({
        firm_id: profile.firm_id,
        entity_type: 'assessment',
        entity_id: assessment.id,
        action: 'assessment_finalised',
        metadata: {
          matter_id: assessment.matter_id,
          risk_level: assessment.risk_level,
          score: assessment.score,
          finalised_at: finalisedAt,
        },
        created_by: user.id,
      });

    if (auditError) {
      console.error('Failed to insert audit event:', auditError);
    }

    return { success: true, assessment };
  } catch (error) {
    console.error('Error in finaliseAssessment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Guard function to check if an assessment can be modified.
 * Returns null if modifiable, or an error result if finalised.
 */
export async function checkAssessmentModifiable(
  assessmentId: string
): Promise<{ success: false; error: string } | null> {
  const assessment = await getAssessment(assessmentId);

  if (!assessment) {
    return { success: false, error: 'Assessment not found or access denied' };
  }

  if (isAssessmentFinalised(assessment)) {
    return { success: false, error: 'Assessment is finalised and cannot be modified' };
  }

  return null;
}

/** Result of deleting an assessment */
export type DeleteAssessmentResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Delete an assessment and all related data (MLRO only).
 * MLRO authority overrides finalised-assessment immutability for deletion.
 */
export async function deleteAssessment(
  assessmentId: string
): Promise<DeleteAssessmentResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'User profile not found' };
    }

    if (!canDeleteEntities(profile.role as UserRole)) {
      return { success: false, error: 'Only the MLRO can delete assessments' };
    }

    // Fetch assessment, verify firm ownership
    const { data: assessment, error: fetchErr } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', assessmentId)
      .single();

    if (fetchErr || !assessment) {
      return { success: false, error: 'Assessment not found or access denied' };
    }

    if (assessment.firm_id !== profile.firm_id) {
      return { success: false, error: 'Assessment does not belong to your firm' };
    }

    // Fetch evidence records for storage cleanup
    const { data: evidenceRows } = await supabase
      .from('assessment_evidence')
      .select('id, file_path')
      .eq('assessment_id', assessmentId);

    // Delete CDD progress
    const { error: progressErr } = await supabase
      .from('cdd_item_progress')
      .delete()
      .eq('assessment_id', assessmentId);

    const progressDeleted = !progressErr;

    // Delete evidence rows
    const { error: evidenceErr } = await supabase
      .from('assessment_evidence')
      .delete()
      .eq('assessment_id', assessmentId);

    const evidenceDeleted = !evidenceErr;

    // Remove storage files (best-effort)
    const filePaths = (evidenceRows || [])
      .map((e) => e.file_path)
      .filter((p): p is string => !!p);

    if (filePaths.length > 0) {
      await supabase.storage.from('evidence').remove(filePaths);
    }

    // Delete assessment row
    const { error: deleteErr } = await supabase
      .from('assessments')
      .delete()
      .eq('id', assessmentId);

    if (deleteErr) {
      console.error('Failed to delete assessment:', deleteErr);
      return { success: false, error: 'Failed to delete assessment' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'assessment',
      entity_id: assessmentId,
      action: 'assessment_deleted',
      metadata: {
        matter_id: assessment.matter_id,
        risk_level: assessment.risk_level,
        was_finalised: assessment.finalised_at !== null,
        evidence_deleted: evidenceDeleted ? (evidenceRows?.length ?? 0) : 0,
        progress_deleted: progressDeleted,
      },
      created_by: user.id,
    });

    return { success: true };
  } catch (error) {
    console.error('Error in deleteAssessment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
