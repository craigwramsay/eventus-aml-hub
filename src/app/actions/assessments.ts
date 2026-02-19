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
import { canCreateAssessment, canFinaliseAssessment } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';

/** Matter with joined client data */
export interface MatterWithClient extends Matter {
  client: Client;
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

    const inputSnapshot = {
      clientType: derivedClientType,
      formAnswers: enrichedFormAnswers,
    };

    const { data, error: insertErr } = await supabase
      .from('assessments')
      .insert({
        firm_id: profile.firm_id,
        matter_id,
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

/** Assessment with related client and matter data */
export interface AssessmentWithDetails {
  assessment: Assessment;
  client: Client;
  matter: Matter;
  outputSnapshot: AssessmentOutput;
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
      data: { assessment, client, matter, outputSnapshot },
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
