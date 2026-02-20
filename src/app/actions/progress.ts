'use server';

/**
 * Server Actions for CDD Item Progress Tracking
 *
 * Tracks completion state of individual CDD checklist items.
 * All operations respect RLS and require authentication.
 */

import { createClient } from '@/lib/supabase/server';
import type { CddItemProgress } from '@/lib/supabase/types';
import { canCreateAssessment } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';

export type ProgressResult =
  | { success: true; progress: CddItemProgress[] }
  | { success: false; error: string };

export type ToggleResult =
  | { success: true; progress: CddItemProgress }
  | { success: false; error: string };

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
 * Fetch all progress rows for an assessment.
 */
export async function getProgressForAssessment(
  assessmentId: string
): Promise<ProgressResult> {
  try {
    if (!assessmentId) {
      return { success: false, error: 'Assessment ID is required' };
    }

    const { supabase, error } = await getUserAndProfile();
    if (error) {
      return { success: false, error };
    }

    const { data, error: fetchErr } = await supabase
      .from('cdd_item_progress')
      .select('*')
      .eq('assessment_id', assessmentId);

    if (fetchErr) {
      console.error('Failed to fetch progress:', fetchErr);
      return { success: false, error: 'Failed to fetch progress records' };
    }

    return { success: true, progress: (data || []) as CddItemProgress[] };
  } catch (err) {
    console.error('Error in getProgressForAssessment:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Toggle completion state of a CDD item.
 * Upserts the row: if completed=true sets completed_at+completed_by,
 * if completed=false clears them.
 */
export async function toggleItemCompletion(
  assessmentId: string,
  actionId: string,
  completed: boolean
): Promise<ToggleResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canCreateAssessment(profile.role as UserRole)) {
      return { success: false, error: 'Your role does not permit updating progress' };
    }

    // Check assessment is not finalised
    const { data: assessment, error: aErr } = await supabase
      .from('assessments')
      .select('id, firm_id, finalised_at')
      .eq('id', assessmentId)
      .single();

    if (aErr || !assessment) {
      return { success: false, error: 'Assessment not found or access denied' };
    }

    if (assessment.firm_id !== profile.firm_id) {
      return { success: false, error: 'Assessment does not belong to your firm' };
    }

    if (assessment.finalised_at) {
      return { success: false, error: 'Assessment is finalised and cannot be modified' };
    }

    // Check if row exists
    const { data: existing } = await supabase
      .from('cdd_item_progress')
      .select('id')
      .eq('assessment_id', assessmentId)
      .eq('action_id', actionId)
      .maybeSingle();

    let result;

    if (existing) {
      // Update existing row
      const { data, error: updateErr } = await supabase
        .from('cdd_item_progress')
        .update({
          completed_at: completed ? new Date().toISOString() : null,
          completed_by: completed ? user.id : null,
        })
        .eq('assessment_id', assessmentId)
        .eq('action_id', actionId)
        .select()
        .single();

      if (updateErr || !data) {
        console.error('Failed to update progress:', updateErr);
        return { success: false, error: 'Failed to update progress' };
      }
      result = data;
    } else {
      // Insert new row
      const { data, error: insertErr } = await supabase
        .from('cdd_item_progress')
        .insert({
          firm_id: profile.firm_id,
          assessment_id: assessmentId,
          action_id: actionId,
          completed_at: completed ? new Date().toISOString() : null,
          completed_by: completed ? user.id : null,
        })
        .select()
        .single();

      if (insertErr || !data) {
        console.error('Failed to insert progress:', insertErr);
        return { success: false, error: 'Failed to create progress record' };
      }
      result = data;
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'cdd_item_progress',
      entity_id: result.id,
      action: completed ? 'cdd_item_completed' : 'cdd_item_uncompleted',
      metadata: {
        assessment_id: assessmentId,
        action_id: actionId,
      },
      created_by: user.id,
    });

    return { success: true, progress: result as CddItemProgress };
  } catch (err) {
    console.error('Error in toggleItemCompletion:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
