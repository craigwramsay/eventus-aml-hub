'use server';

/**
 * Server Actions for Assessment Operations
 */

import { createClient } from '@/lib/supabase/server';
import { runAssessment } from '@/lib/rules-engine';
import type { FormAnswers, ClientType } from '@/lib/rules-engine/types';
import type { Assessment, Client, Matter } from '@/lib/supabase/types';

/** Matter with joined client data */
export interface MatterWithClient extends Matter {
  client: Client;
}

/** Input for submitting an assessment */
export interface SubmitAssessmentInput {
  matter_id: string;
  client_type: ClientType;
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

    const { matter_id, client_type, form_answers } = input;

    if (!matter_id) {
      return { success: false, error: 'Matter ID is required' };
    }

    if (!client_type || (client_type !== 'individual' && client_type !== 'corporate')) {
      return { success: false, error: 'Valid client type is required' };
    }

    if (!form_answers || Object.keys(form_answers).length === 0) {
      return { success: false, error: 'Form answers are required' };
    }

    // Verify matter exists and belongs to the same firm
    const { data: matter, error: matterErr } = await supabase
      .from('matters')
      .select('id, firm_id')
      .eq('id', matter_id)
      .single();

    if (matterErr || !matter) {
      return { success: false, error: 'Matter not found' };
    }

    if (matter.firm_id !== profile.firm_id) {
      return { success: false, error: 'Matter does not belong to your firm' };
    }

    // Run deterministic assessment engine
    const assessmentOutput = runAssessment({
      clientType: client_type,
      formAnswers: form_answers,
    });

    // Build input snapshot
    const inputSnapshot = {
      clientType: client_type,
      formAnswers: form_answers,
    };

    // Insert assessment
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

    // Create audit event
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
