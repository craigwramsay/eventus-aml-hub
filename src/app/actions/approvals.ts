'use server';

/**
 * Server Actions for MLRO Approval Workflow
 *
 * Manages approval requests for HIGH risk / EDD assessments.
 * Only MLROs can approve/reject. Any user can request or withdraw their own.
 */

import { createClient } from '@/lib/supabase/server';
import type { MlroApprovalRequest, ApprovalStatus } from '@/lib/supabase/types';
import type { UserRole } from '@/lib/auth/roles';
import { canCreateAssessment, canDecideApproval } from '@/lib/auth/roles';

export type ApprovalResult =
  | { success: true; approval: MlroApprovalRequest }
  | { success: false; error: string };

export type ApprovalQueryResult =
  | { success: true; approval: (MlroApprovalRequest & { requested_by_name?: string; decision_by_name?: string }) | null }
  | { success: false; error: string };

export type PendingApprovalsResult =
  | { success: true; approvals: Array<MlroApprovalRequest & { client_name: string; risk_level: string; reference: string }> }
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
    .select('user_id, firm_id, role, full_name')
    .eq('user_id', user.id)
    .single();

  if (profileErr || !profile) {
    return { supabase, user, profile: null, error: 'User profile not found' };
  }

  return { supabase, user, profile, error: null };
}

/**
 * Request MLRO approval for an assessment.
 */
export async function requestMLROApproval(
  assessmentId: string
): Promise<ApprovalResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canCreateAssessment(profile.role as UserRole)) {
      return { success: false, error: 'Your role does not permit requesting approvals' };
    }

    // Check no pending request already exists
    const { data: existing } = await supabase
      .from('mlro_approval_requests')
      .select('id, status')
      .eq('assessment_id', assessmentId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      return { success: false, error: 'An approval request is already pending for this assessment' };
    }

    const { data, error: insertErr } = await supabase
      .from('mlro_approval_requests')
      .insert({
        firm_id: profile.firm_id,
        assessment_id: assessmentId,
        requested_by: user.id,
      })
      .select()
      .single();

    if (insertErr || !data) {
      console.error('Failed to create approval request:', insertErr);
      return { success: false, error: 'Failed to create approval request' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'mlro_approval',
      entity_id: data.id,
      action: 'approval_requested',
      metadata: { assessment_id: assessmentId },
      created_by: user.id,
    });

    return { success: true, approval: data as MlroApprovalRequest };
  } catch (err) {
    console.error('Error in requestMLROApproval:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Approve or reject an approval request. MLRO only.
 */
export async function decideApproval(
  requestId: string,
  decision: 'approved' | 'rejected',
  notes?: string
): Promise<ApprovalResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canDecideApproval(profile.role as UserRole)) {
      return { success: false, error: 'Only MLROs can approve or reject requests' };
    }

    // Verify request exists and is pending
    const { data: request } = await supabase
      .from('mlro_approval_requests')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single();

    if (!request) {
      return { success: false, error: 'Approval request not found or already decided' };
    }

    const { data, error: updateErr } = await supabase
      .from('mlro_approval_requests')
      .update({
        status: decision,
        decision_by: user.id,
        decision_at: new Date().toISOString(),
        decision_notes: notes?.trim() || null,
      })
      .eq('id', requestId)
      .select()
      .single();

    if (updateErr || !data) {
      console.error('Failed to update approval request:', updateErr);
      return { success: false, error: 'Failed to update approval request' };
    }

    // If approved, auto-complete the CDD item
    if (decision === 'approved') {
      // Find the matching action ID (senior_management_approval or mlro_approval)
      for (const actionId of ['senior_management_approval', 'mlro_approval']) {
        const { data: existing } = await supabase
          .from('cdd_item_progress')
          .select('id')
          .eq('assessment_id', request.assessment_id)
          .eq('action_id', actionId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('cdd_item_progress')
            .update({ completed_at: new Date().toISOString(), completed_by: user.id })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('cdd_item_progress')
            .insert({
              firm_id: profile.firm_id,
              assessment_id: request.assessment_id,
              action_id: actionId,
              completed_at: new Date().toISOString(),
              completed_by: user.id,
            });
        }
      }
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'mlro_approval',
      entity_id: data.id,
      action: decision === 'approved' ? 'approval_granted' : 'approval_rejected',
      metadata: {
        assessment_id: request.assessment_id,
        notes: notes?.trim() || null,
      },
      created_by: user.id,
    });

    return { success: true, approval: data as MlroApprovalRequest };
  } catch (err) {
    console.error('Error in decideApproval:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Withdraw a pending approval request. Only the requester can withdraw.
 */
export async function withdrawApproval(
  requestId: string
): Promise<ApprovalResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    const { data: request } = await supabase
      .from('mlro_approval_requests')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'pending')
      .eq('requested_by', user.id)
      .single();

    if (!request) {
      return { success: false, error: 'Approval request not found, already decided, or not yours to withdraw' };
    }

    const { data, error: updateErr } = await supabase
      .from('mlro_approval_requests')
      .update({
        status: 'withdrawn' as ApprovalStatus,
        decision_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (updateErr || !data) {
      console.error('Failed to withdraw approval:', updateErr);
      return { success: false, error: 'Failed to withdraw approval request' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'mlro_approval',
      entity_id: data.id,
      action: 'approval_withdrawn',
      metadata: { assessment_id: request.assessment_id },
      created_by: user.id,
    });

    return { success: true, approval: data as MlroApprovalRequest };
  } catch (err) {
    console.error('Error in withdrawApproval:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get the current approval status for an assessment.
 * Returns the most recent non-withdrawn request.
 */
export async function getApprovalForAssessment(
  assessmentId: string
): Promise<ApprovalQueryResult> {
  try {
    const { supabase, error } = await getUserAndProfile();
    if (error) {
      return { success: false, error };
    }

    const { data, error: fetchErr } = await supabase
      .from('mlro_approval_requests')
      .select('*')
      .eq('assessment_id', assessmentId)
      .neq('status', 'withdrawn')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) {
      console.error('Failed to fetch approval:', fetchErr);
      return { success: false, error: 'Failed to fetch approval status' };
    }

    if (!data) {
      return { success: true, approval: null };
    }

    // Fetch names for display
    const approval = data as MlroApprovalRequest & { requested_by_name?: string; decision_by_name?: string };

    const { data: requester } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('user_id', data.requested_by)
      .single();
    if (requester) approval.requested_by_name = requester.full_name;

    if (data.decision_by) {
      const { data: decider } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('user_id', data.decision_by)
        .single();
      if (decider) approval.decision_by_name = decider.full_name;
    }

    return { success: true, approval };
  } catch (err) {
    console.error('Error in getApprovalForAssessment:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get all pending approval requests for the current user's firm. MLRO dashboard use.
 */
export async function getPendingApprovals(): Promise<PendingApprovalsResult> {
  try {
    const { supabase, profile, error } = await getUserAndProfile();
    if (error || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canDecideApproval(profile.role as UserRole)) {
      return { success: true, approvals: [] };
    }

    const { data, error: fetchErr } = await supabase
      .from('mlro_approval_requests')
      .select('*')
      .eq('firm_id', profile.firm_id)
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });

    if (fetchErr) {
      console.error('Failed to fetch pending approvals:', fetchErr);
      return { success: false, error: 'Failed to fetch pending approvals' };
    }

    if (!data || data.length === 0) {
      return { success: true, approvals: [] };
    }

    // Enrich with assessment details
    const assessmentIds = data.map((d) => d.assessment_id);
    const { data: assessments } = await supabase
      .from('assessments')
      .select('id, risk_level, reference, matter_id')
      .in('id', assessmentIds);

    const matterIds = assessments?.map((a) => a.matter_id) || [];
    const { data: matters } = await supabase
      .from('matters')
      .select('id, client_id')
      .in('id', matterIds);

    const clientIds = matters?.map((m) => m.client_id) || [];
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name')
      .in('id', clientIds);

    // Build lookup maps
    const assessmentMap = new Map(assessments?.map((a) => [a.id, a]) || []);
    const matterMap = new Map(matters?.map((m) => [m.id, m]) || []);
    const clientMap = new Map(clients?.map((c) => [c.id, c]) || []);

    const enriched = data.map((request) => {
      const assessment = assessmentMap.get(request.assessment_id);
      const matter = assessment ? matterMap.get(assessment.matter_id) : null;
      const client = matter ? clientMap.get(matter.client_id) : null;

      return {
        ...request,
        client_name: client?.name || 'Unknown',
        risk_level: assessment?.risk_level || 'Unknown',
        reference: assessment?.reference || 'Unknown',
      } as MlroApprovalRequest & { client_name: string; risk_level: string; reference: string };
    });

    return { success: true, approvals: enriched };
  } catch (err) {
    console.error('Error in getPendingApprovals:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
