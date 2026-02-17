'use server';

/**
 * Server Actions for Assessment Operations
 *
 * These actions run on the server and respect RLS policies.
 * No service role key is used - all operations are authenticated via user session.
 */

import { createClient } from '@/lib/supabase/server';
import { runAssessment, type ClientType, type FormAnswers } from '@/lib/rules-engine';
import type { AssessmentOutput } from '@/lib/rules-engine/types';
import type { Assessment, Matter, Client } from '@/lib/supabase/types';

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


/** Input for submitting an assessment */
export interface SubmitAssessmentInput {
  client_id: string;
  matter_id: string;
  clientType: ClientType;
  formAnswers: FormAnswers;
  formVersion?: string;
}

/** Result of submitting an assessment */
export type SubmitAssessmentResult =
  | {
      success: true;
      assessment: Assessment;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Submit a new assessment
 *
 * - Runs the deterministic rules engine
 * - Inserts into assessments table
 * - Inserts into audit_events table
 * - Respects RLS (user must have access to the matter)
 *
 * @param input - Assessment input data
 * @returns The created assessment record or an error
 */
export async function submitAssessment(
  input: SubmitAssessmentInput
): Promise<SubmitAssessmentResult> {
  try {
    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    // Get user profile to get firm_id
    const profile = await getUserProfile();
    if (!profile) {
      return {
        success: false,
        error: 'User profile not found',
      };
    }

    const { client_id, matter_id, clientType, formAnswers, formVersion } = input;

    // Validate input
    if (!client_id || !matter_id || !clientType || !formAnswers) {
      return {
        success: false,
        error: 'Missing required fields: client_id, matter_id, clientType, formAnswers',
      };
    }

    if (clientType !== 'individual' && clientType !== 'corporate') {
      return {
        success: false,
        error: 'clientType must be "individual" or "corporate"',
      };
    }

    // Run the deterministic rules engine
    const assessmentResult = runAssessment({
      clientType,
      formAnswers,
    });

    // Prepare input snapshot
    const inputSnapshot = {
      clientType,
      formAnswers,
      formVersion: formVersion ?? null,
      assessedAt: assessmentResult.timestamp,
    };

    // Create Supabase client (respects RLS)
    const supabase = await createClient();

    // Verify user has access to the matter (RLS will enforce this, but we check explicitly for better error message)
    const { data: matterData, error: matterError } = await supabase
      .from('matters')
      .select('id, firm_id, client_id')
      .eq('id', matter_id)
      .single();

    if (matterError || !matterData) {
      return {
        success: false,
        error: 'Matter not found or access denied',
      };
    }

    const matter = matterData as Matter;

    // Verify the client_id matches the matter's client
    if (matter.client_id !== client_id) {
      return {
        success: false,
        error: 'Client ID does not match the matter',
      };
    }

    // Verify firm_id matches user's firm
    if (matter.firm_id !== profile.firm_id) {
      return {
        success: false,
        error: 'Access denied: matter belongs to a different firm',
      };
    }

    // Insert assessment
    const { data: assessmentData, error: assessmentError } = await supabase
      .from('assessments')
      .insert({
        firm_id: profile.firm_id,
        matter_id,
        input_snapshot: inputSnapshot,
        output_snapshot: assessmentResult,
        risk_level: assessmentResult.riskLevel,
        score: assessmentResult.score,
        created_by: user.id,
      })
      .select()
      .single();

    if (assessmentError || !assessmentData) {
      console.error('Failed to insert assessment:', assessmentError);
      return {
        success: false,
        error: 'Failed to save assessment',
      };
    }

    const assessment = assessmentData as Assessment;

    // Insert audit event
    const { error: auditError } = await supabase
      .from('audit_events')
      .insert({
        firm_id: profile.firm_id,
        entity_type: 'assessment',
        entity_id: assessment.id,
        action: 'assessment_created',
        metadata: {
          matter_id,
          client_id,
          risk_level: assessmentResult.riskLevel,
          score: assessmentResult.score,
        },
        created_by: user.id,
      });

    if (auditError) {
      // Log but don't fail - audit is secondary
      console.error('Failed to insert audit event:', auditError);
    }

    return {
      success: true,
      assessment,
    };
  } catch (error) {
    console.error('Error in submitAssessment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Get assessment by ID
 *
 * @param assessmentId - The assessment ID
 * @returns The assessment or null if not found/not authorized
 */
export async function getAssessment(
  assessmentId: string
): Promise<Assessment | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('assessments')
    .select('*')
    .eq('id', assessmentId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Assessment;
}

/**
 * Get all assessments for a matter
 *
 * @param matterId - The matter ID
 * @returns Array of assessments
 */
export async function getAssessmentsForMatter(
  matterId: string
): Promise<Assessment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('assessments')
    .select('*')
    .eq('matter_id', matterId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as Assessment[];
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
 *
 * @param assessmentId - The assessment ID
 * @returns Assessment with client and matter details, or error
 */
export async function getAssessmentWithDetails(
  assessmentId: string
): Promise<GetAssessmentWithDetailsResult> {
  try {
    if (!assessmentId) {
      return {
        success: false,
        error: 'Missing required field: assessmentId',
      };
    }

    const supabase = await createClient();

    // Fetch assessment (RLS enforces access)
    const { data: assessmentData, error: assessmentError } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessmentData) {
      return {
        success: false,
        error: 'Assessment not found or access denied',
      };
    }

    const assessment = assessmentData as Assessment;

    // Fetch matter
    const { data: matterData, error: matterError } = await supabase
      .from('matters')
      .select('*')
      .eq('id', assessment.matter_id)
      .single();

    if (matterError || !matterData) {
      return {
        success: false,
        error: 'Matter not found',
      };
    }

    const matter = matterData as Matter;

    // Fetch client
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', matter.client_id)
      .single();

    if (clientError || !clientData) {
      return {
        success: false,
        error: 'Client not found',
      };
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
  | {
      success: true;
      assessment: Assessment;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Check if an assessment is finalised (internal helper)
 */
function isAssessmentFinalised(assessment: Assessment): boolean {
  return assessment.finalised_at !== null;
}

/**
 * Finalise an assessment
 *
 * Once finalised, an assessment cannot be modified.
 * - Sets finalised_at timestamp
 * - Sets finalised_by to current user
 * - Inserts audit_event with action 'assessment_finalised'
 *
 * @param assessmentId - The assessment ID to finalise
 * @returns The finalised assessment record or an error
 */
export async function finaliseAssessment(
  assessmentId: string
): Promise<FinaliseAssessmentResult> {
  try {
    // Get authenticated user
   const { supabase, user, profile, error } = await getUserAndProfile();

if (error || !user || !profile) {
  return { success: false, error: error || 'User profile not found' };
}


    // Fetch the assessment (RLS will enforce access)
    const { data: existingData, error: fetchError } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', assessmentId)
      .single();

    if (fetchError || !existingData) {
      return {
        success: false,
        error: 'Assessment not found or access denied',
      };
    }

    const existing = existingData as Assessment;

    // Verify firm_id matches user's firm
    if (existing.firm_id !== profile.firm_id) {
      return {
        success: false,
        error: 'Access denied: assessment belongs to a different firm',
      };
    }

    // Check if already finalised
    if (isAssessmentFinalised(existing)) {
      return {
        success: false,
        error: 'Assessment is already finalised and cannot be modified',
      };
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
      return {
        success: false,
        error: 'Failed to finalise assessment',
      };
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
      // Log but don't fail - audit is secondary
      console.error('Failed to insert audit event:', auditError);
    }

    return {
      success: true,
      assessment,
    };
  } catch (error) {
    console.error('Error in finaliseAssessment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Guard function to check if an assessment can be modified
 *
 * Returns an error result if the assessment is finalised.
 * Use this before any operation that would modify an assessment.
 *
 * @param assessmentId - The assessment ID to check
 * @returns null if modifiable, or an error result if finalised
 */
export async function checkAssessmentModifiable(
  assessmentId: string
): Promise<{ success: false; error: string } | null> {
  const assessment = await getAssessment(assessmentId);

  if (!assessment) {
    return {
      success: false,
      error: 'Assessment not found or access denied',
    };
  }

  if (isAssessmentFinalised(assessment)) {
    return {
      success: false,
      error: 'Assessment is finalised and cannot be modified',
    };
  }

  return null;
}
