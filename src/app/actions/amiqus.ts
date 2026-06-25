'use server';

/**
 * Server Actions for Amiqus Integration
 *
 * Initiates Amiqus identity verification and queries verification status.
 * Reports stay in Amiqus — hub stores only record ID, status, date, and link.
 */

import { createClient } from '@/lib/supabase/server';
import type { AmiqusVerification } from '@/lib/supabase/types';
import type { UserRole } from '@/lib/auth/roles';
import { canCreateAssessment } from '@/lib/auth/roles';
import { getCddStalenessConfig } from '@/lib/rules-engine/config-loader';
import { toggleItemCompletion } from './progress';
import {
  getAmiqusApiKey,
  createAmiqusClient,
  createAmiqusRecord,
  getAmiqusRecordOrCase,
  getAmiqusClient,
  formatAmiqusClientName,
  AmiqusError,
} from '@/lib/amiqus';

export type InitiateVerificationResult =
  | { success: true; verification: AmiqusVerification }
  | { success: false; error: string };

export type GetVerificationsResult =
  | { success: true; verifications: AmiqusVerification[] }
  | { success: false; error: string };

export type LinkAmiqusResult =
  | { success: true; verification: AmiqusVerification }
  | { success: false; error: string };

/**
 * Fetch authenticated user + profile
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
 * Initiate an Amiqus identity verification for an assessment action.
 *
 * Creates a client + record in Amiqus, stores tracking info in amiqus_verifications.
 * Returns the verification record including perform_url for the client.
 */
export async function initiateAmiqusVerification(
  assessmentId: string,
  actionId: string,
  clientName: string,
  clientEmail: string
): Promise<InitiateVerificationResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canCreateAssessment(profile.role as UserRole)) {
      return { success: false, error: 'Your role does not permit initiating verification' };
    }

    // Check Amiqus is configured
    const apiKey = getAmiqusApiKey();
    if (!apiKey) {
      return { success: false, error: 'Amiqus integration is not configured' };
    }

    // Validate assessment access
    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, firm_id')
      .eq('id', assessmentId)
      .single();

    if (!assessment || assessment.firm_id !== profile.firm_id) {
      return { success: false, error: 'Assessment not found or access denied' };
    }

    // Check for existing pending/in_progress verification for this assessment+action
    const { data: existing } = await supabase
      .from('amiqus_verifications')
      .select('id, status')
      .eq('assessment_id', assessmentId)
      .eq('action_id', actionId)
      .in('status', ['pending', 'in_progress'])
      .maybeSingle();

    if (existing) {
      return { success: false, error: 'A verification is already in progress for this action' };
    }

    // Split client name for Amiqus
    const nameParts = clientName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Client';
    const lastName = nameParts.slice(1).join(' ') || 'Unknown';

    // Create client in Amiqus
    let amiqusClient;
    try {
      amiqusClient = await createAmiqusClient(firstName, lastName, clientEmail, apiKey);
    } catch (err) {
      if (err instanceof AmiqusError) {
        return { success: false, error: `Amiqus API error: ${err.message}` };
      }
      throw err;
    }

    // Create record with identity verification step
    let amiqusRecord;
    try {
      amiqusRecord = await createAmiqusRecord(
        amiqusClient.id,
        [{ type: 'identity_document' }],
        apiKey
      );
    } catch (err) {
      if (err instanceof AmiqusError) {
        return { success: false, error: `Amiqus API error: ${err.message}` };
      }
      throw err;
    }

    // Store verification record in our DB
    const formattedName = clientName.trim() || `${firstName} ${lastName}`.trim();
    const { data: verification, error: insertErr } = await supabase
      .from('amiqus_verifications')
      .insert({
        firm_id: profile.firm_id,
        assessment_id: assessmentId,
        action_id: actionId,
        amiqus_record_id: amiqusRecord.id,
        amiqus_client_id: amiqusClient.id,
        amiqus_client_name: formattedName || null,
        status: 'pending',
        perform_url: amiqusRecord.perform_url,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertErr || !verification) {
      console.error('Failed to store Amiqus verification:', insertErr);
      return { success: false, error: 'Failed to store verification record' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'amiqus_verification',
      entity_id: verification.id,
      action: 'amiqus_verification_initiated',
      metadata: {
        assessment_id: assessmentId,
        action_id: actionId,
        amiqus_record_id: amiqusRecord.id,
      },
      created_by: user.id,
    });

    return { success: true, verification: verification as AmiqusVerification };
  } catch (err) {
    console.error('Error in initiateAmiqusVerification:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get all Amiqus verifications for an assessment.
 */
export async function getAmiqusVerifications(
  assessmentId: string
): Promise<GetVerificationsResult> {
  try {
    if (!assessmentId) {
      return { success: false, error: 'Assessment ID is required' };
    }

    const { supabase, error } = await getUserAndProfile();
    if (error) {
      return { success: false, error };
    }

    const { data, error: fetchErr } = await supabase
      .from('amiqus_verifications')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('created_at', { ascending: false });

    if (fetchErr) {
      console.error('Failed to fetch Amiqus verifications:', fetchErr);
      return { success: false, error: 'Failed to fetch verifications' };
    }

    return { success: true, verifications: (data || []) as AmiqusVerification[] };
  } catch (err) {
    console.error('Error in getAmiqusVerifications:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get the most recent completed Amiqus verification for a client across all assessments.
 * Used to show the original Amiqus record link when identity was carried forward.
 */
export async function getClientLatestAmiqusVerification(
  clientId: string
): Promise<{ amiqusRecordId: number; amiqusClientId: number | null; verifiedAt: string | null } | null> {
  try {
    const { supabase, error } = await getUserAndProfile();
    if (error) return null;

    // Find the client's matters → assessments → amiqus_verifications
    const { data: matters } = await supabase
      .from('matters')
      .select('id')
      .eq('client_id', clientId);

    if (!matters || matters.length === 0) return null;

    const matterIds = matters.map(m => m.id);

    const { data: assessments } = await supabase
      .from('assessments')
      .select('id')
      .in('matter_id', matterIds);

    if (!assessments || assessments.length === 0) return null;

    const assessmentIds = assessments.map(a => a.id);

    const { data: verification } = await supabase
      .from('amiqus_verifications')
      .select('amiqus_record_id, amiqus_client_id, verified_at')
      .in('assessment_id', assessmentIds)
      .eq('status', 'complete')
      .not('amiqus_record_id', 'is', null)
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!verification?.amiqus_record_id) return null;

    return {
      amiqusRecordId: verification.amiqus_record_id,
      amiqusClientId: verification.amiqus_client_id ?? null,
      verifiedAt: verification.verified_at,
    };
  } catch {
    return null;
  }
}

/** Check if an action is identity verification */
function isIdentityActionId(actionId: string): boolean {
  return (
    actionId.includes('identity_verification') ||
    actionId.includes('verify_identity') ||
    actionId.includes('identify_and_verify')
  );
}

/**
 * Link an existing Amiqus record to an assessment action.
 *
 * Fetches the record from Amiqus to validate it exists and is complete,
 * then creates the same evidence trail as a webhook-completed verification:
 * amiqus_verifications row, assessment_evidence row, and client CDD date update.
 *
 * For identity actions: also validates the verification date against the firm's
 * risk-based CDD thresholds, creates a carry-forward confirmation record, and
 * auto-completes the checklist item.
 */
export async function linkExistingAmiqusRecord(
  assessmentId: string,
  actionId: string,
  amiqusRecordId: number,
  overrideVerifiedAt?: string | null
): Promise<LinkAmiqusResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canCreateAssessment(profile.role as UserRole)) {
      return { success: false, error: 'Your role does not permit linking verification records' };
    }

    // Check Amiqus is configured
    const apiKey = getAmiqusApiKey();
    if (!apiKey) {
      return { success: false, error: 'Amiqus integration is not configured' };
    }

    // Validate assessment access
    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, firm_id')
      .eq('id', assessmentId)
      .single();

    if (!assessment || assessment.firm_id !== profile.firm_id) {
      return { success: false, error: 'Assessment not found or access denied' };
    }

    // Check for duplicate Amiqus record on this action (same record_id already linked)
    const { data: duplicates } = await supabase
      .from('amiqus_verifications')
      .select('id')
      .eq('assessment_id', assessmentId)
      .eq('action_id', actionId)
      .eq('amiqus_record_id', amiqusRecordId);

    if (duplicates && duplicates.length > 0) {
      return { success: false, error: 'This Amiqus record is already linked to this checklist item' };
    }

    // Fetch the record or case from Amiqus to validate it exists and is complete.
    // Amiqus has both /records/{id} and /cases/{id} — try records first, then cases.
    let amiqusResult;
    try {
      amiqusResult = await getAmiqusRecordOrCase(amiqusRecordId, apiKey);
    } catch (err) {
      if (err instanceof AmiqusError) {
        if (err.statusCode === 404) {
          return { success: false, error: 'Amiqus record/case not found. Check the ID and try again.' };
        }
        return { success: false, error: `Amiqus API error: ${err.message}` };
      }
      throw err;
    }

    const amiqusData = amiqusResult.data;

    // Record/case must be complete — records use 'complete', cases use 'approved'
    const completedStatuses = ['complete', 'approved'];
    if (!completedStatuses.includes(amiqusData.status)) {
      return {
        success: false,
        error: `Amiqus ${amiqusResult.type} is not complete (current status: ${amiqusData.status}). Only completed verifications can be linked.`,
      };
    }

    // Resolve verified_at in priority order:
    //   1. explicit user override (from the link UI)
    //   2. Amiqus completed_at (set on records when status=complete)
    //   3. Amiqus updated_at (always set; on cases this is the approval time)
    // We deliberately do NOT default to "today" — for an existing verification
    // that's never a correct guess and would set a wrong CDD review window.
    const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
    let verifiedAt: string | null = null;
    if (overrideVerifiedAt) {
      if (!isoDateRe.test(overrideVerifiedAt)) {
        return { success: false, error: 'Verification date must be in YYYY-MM-DD format' };
      }
      const overrideDate = new Date(overrideVerifiedAt + 'T00:00:00');
      if (Number.isNaN(overrideDate.getTime()) || overrideDate > new Date()) {
        return { success: false, error: 'Verification date cannot be in the future' };
      }
      verifiedAt = overrideVerifiedAt;
    } else if (amiqusData.completed_at) {
      verifiedAt = amiqusData.completed_at.split('T')[0];
    } else if (amiqusData.updated_at) {
      verifiedAt = amiqusData.updated_at.split('T')[0];
    }
    if (!verifiedAt) {
      return {
        success: false,
        error: 'Amiqus did not return a completion date for this record. Enter the original verification date manually and try again.',
      };
    }

    // For identity actions: validate the verification date against firm's CDD thresholds
    const isIdentityAction = isIdentityActionId(actionId);
    if (isIdentityAction) {
      const cddConfig = getCddStalenessConfig();
      const longstopMonths = cddConfig.universalLongstopMonths ?? 24;
      const verifiedDate = new Date(verifiedAt);
      const now = new Date();

      // Check universal longstop
      const longstopDate = new Date(verifiedDate);
      longstopDate.setMonth(longstopDate.getMonth() + longstopMonths);
      if (now >= longstopDate) {
        return { success: false, error: 'This verification is beyond the universal longstop period — a new verification is required' };
      }

      // Get the assessment's risk level for threshold check
      const { data: assessmentWithRisk } = await supabase
        .from('assessments')
        .select('risk_level')
        .eq('id', assessmentId)
        .single();

      const riskLevel = (assessmentWithRisk?.risk_level || 'MEDIUM').toUpperCase();
      const threshold = cddConfig.thresholds[riskLevel];
      if (threshold) {
        const thresholdDate = new Date(verifiedDate);
        thresholdDate.setMonth(thresholdDate.getMonth() + threshold.months);
        if (now >= thresholdDate) {
          return { success: false, error: `This verification exceeds the ${threshold.label} review period for ${riskLevel} risk — a new verification is required` };
        }
      }
    }

    // Fetch the client name from Amiqus so the Hub UI / PDF can identify
    // which person each verification relates to. Non-fatal if it fails.
    let amiqusClientName: string | null = null;
    if (amiqusData.client_id && amiqusData.client_id > 0) {
      try {
        const client = await getAmiqusClient(amiqusData.client_id, apiKey);
        const formatted = formatAmiqusClientName(client);
        if (formatted) amiqusClientName = formatted;
      } catch (err) {
        console.error('Failed to fetch Amiqus client name (non-fatal):', err);
      }
    }

    // Insert amiqus_verifications row
    const { data: verification, error: insertErr } = await supabase
      .from('amiqus_verifications')
      .insert({
        firm_id: profile.firm_id,
        assessment_id: assessmentId,
        action_id: actionId,
        amiqus_record_id: amiqusRecordId,
        amiqus_client_id: amiqusData.client_id || null,
        amiqus_client_name: amiqusClientName,
        status: 'complete',
        verified_at: verifiedAt,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertErr || !verification) {
      console.error('Failed to store linked Amiqus verification:', insertErr);
      return { success: false, error: 'Failed to store verification record' };
    }

    // Insert assessment_evidence row (matching webhook RPC format)
    const { error: evidenceErr } = await supabase
      .from('assessment_evidence')
      .insert({
        firm_id: profile.firm_id,
        assessment_id: assessmentId,
        action_id: actionId,
        evidence_type: 'amiqus',
        label: 'Amiqus Identity Verification',
        source: 'Amiqus',
        data: { amiqus_record_id: amiqusRecordId, amiqus_type: amiqusResult.type, verified_at: verifiedAt },
        verified_at: verifiedAt,
        created_by: user.id,
      });

    if (evidenceErr) {
      console.error('Failed to create evidence for linked Amiqus record:', evidenceErr);
      // Non-fatal — verification row already exists
    }

    // For identity actions: create carry-forward confirmation record and auto-complete
    if (isIdentityAction) {
      const cddConfig = getCddStalenessConfig();
      const verifiedDate = new Date(verifiedAt);
      const { data: assessmentWithRisk } = await supabase
        .from('assessments')
        .select('risk_level')
        .eq('id', assessmentId)
        .single();
      const riskLevel = (assessmentWithRisk?.risk_level || 'MEDIUM').toUpperCase();
      const threshold = cddConfig.thresholds[riskLevel];
      const thresholdLabel = threshold?.label ?? `${cddConfig.universalLongstopMonths ?? 24} months`;

      await supabase
        .from('assessment_evidence')
        .insert({
          firm_id: profile.firm_id,
          assessment_id: assessmentId,
          action_id: actionId,
          evidence_type: 'manual_record',
          label: 'Prior identity verification confirmed still valid',
          source: 'Manual',
          notes: `Identity last verified on ${verifiedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Confirmed still within ${thresholdLabel} review period for ${riskLevel} risk.`,
          verified_at: verifiedAt,
          created_by: user.id,
        });

      // Auto-complete the checklist item
      await toggleItemCompletion(assessmentId, actionId, true);
    }

    // Update clients.last_cdd_verified_at (assessment -> matter -> client)
    try {
      const { data: assessmentForMatter } = await supabase
        .from('assessments')
        .select('matter_id')
        .eq('id', assessmentId)
        .single();

      if (assessmentForMatter) {
        const { data: matter } = await supabase
          .from('matters')
          .select('client_id')
          .eq('id', assessmentForMatter.matter_id)
          .single();

        if (matter) {
          const { data: client } = await supabase
            .from('clients')
            .select('last_cdd_verified_at')
            .eq('id', matter.client_id)
            .single();

          if (client && (!client.last_cdd_verified_at || verifiedAt > client.last_cdd_verified_at)) {
            await supabase
              .from('clients')
              .update({ last_cdd_verified_at: verifiedAt })
              .eq('id', matter.client_id);
          }
        }
      }
    } catch (err) {
      // Non-fatal — log but don't fail
      console.error('Failed to update client CDD date:', err);
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'amiqus_verification',
      entity_id: verification.id,
      action: 'amiqus_record_linked',
      metadata: {
        assessment_id: assessmentId,
        action_id: actionId,
        amiqus_record_id: amiqusRecordId,
        verified_at: verifiedAt,
      },
      created_by: user.id,
    });

    return { success: true, verification: verification as AmiqusVerification };
  } catch (err) {
    console.error('Error in linkExistingAmiqusRecord:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export type CorrectVerificationDateResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Correct the verified_at date on an existing Amiqus verification.
 *
 * Used when an existing record was linked but the date was wrong (e.g. Amiqus
 * returned no completed_at and we fell back to today, or the user picked the
 * wrong value). Updates:
 *   - amiqus_verifications.verified_at
 *   - the matching assessment_evidence (Amiqus row) verified_at + data.verified_at
 *   - the carry-forward "Prior identity verification confirmed still valid"
 *     evidence row's verified_at + notes wording
 *   - clients.last_cdd_verified_at — only if it currently matches the OLD date
 *     (otherwise a newer verification dominates and we should not touch it)
 *
 * Refuses to edit verifications attached to a finalised assessment.
 */
export async function correctAmiqusVerificationDate(
  verificationId: string,
  newVerifiedAt: string
): Promise<CorrectVerificationDateResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canCreateAssessment(profile.role as UserRole)) {
      return { success: false, error: 'Your role does not permit editing verification records' };
    }

    const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoDateRe.test(newVerifiedAt)) {
      return { success: false, error: 'Date must be in YYYY-MM-DD format' };
    }
    const newDate = new Date(newVerifiedAt + 'T00:00:00');
    if (Number.isNaN(newDate.getTime()) || newDate > new Date()) {
      return { success: false, error: 'Date cannot be in the future' };
    }

    // Load the verification + assessment
    const { data: verification } = await supabase
      .from('amiqus_verifications')
      .select('id, firm_id, assessment_id, action_id, amiqus_record_id, verified_at')
      .eq('id', verificationId)
      .single();

    if (!verification || verification.firm_id !== profile.firm_id) {
      return { success: false, error: 'Verification not found or access denied' };
    }

    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, finalised_at, matter_id, risk_level')
      .eq('id', verification.assessment_id)
      .single();

    if (!assessment) {
      return { success: false, error: 'Assessment not found' };
    }
    if (assessment.finalised_at) {
      return { success: false, error: 'Assessment is finalised — verification dates cannot be edited' };
    }

    const oldVerifiedAt: string | null = verification.verified_at;

    // 1. Update the verification row
    const { error: vUpdErr } = await supabase
      .from('amiqus_verifications')
      .update({ verified_at: newVerifiedAt })
      .eq('id', verificationId);
    if (vUpdErr) {
      console.error('Failed to update amiqus_verifications.verified_at:', vUpdErr);
      return { success: false, error: 'Failed to update verification' };
    }

    // 2. Update the Amiqus assessment_evidence row (linked by amiqus_record_id in `data`)
    const { data: amiqusEvidenceRows } = await supabase
      .from('assessment_evidence')
      .select('id, data')
      .eq('assessment_id', verification.assessment_id)
      .eq('action_id', verification.action_id)
      .eq('evidence_type', 'amiqus');

    for (const ev of amiqusEvidenceRows || []) {
      const data = (ev.data ?? {}) as Record<string, unknown>;
      if (data.amiqus_record_id === verification.amiqus_record_id) {
        await supabase
          .from('assessment_evidence')
          .update({
            verified_at: newVerifiedAt,
            data: { ...data, verified_at: newVerifiedAt },
          })
          .eq('id', ev.id);
      }
    }

    // 3. Update the carry-forward manual_record evidence row if present
    const { data: carryRows } = await supabase
      .from('assessment_evidence')
      .select('id, notes')
      .eq('assessment_id', verification.assessment_id)
      .eq('action_id', verification.action_id)
      .eq('evidence_type', 'manual_record')
      .eq('label', 'Prior identity verification confirmed still valid');

    if (carryRows && carryRows.length > 0) {
      const cddConfig = getCddStalenessConfig();
      const riskLevel = (assessment.risk_level || 'MEDIUM').toUpperCase();
      const threshold = cddConfig.thresholds[riskLevel];
      const thresholdLabel = threshold?.label ?? `${cddConfig.universalLongstopMonths ?? 24} months`;
      const formattedNewDate = newDate.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const refreshedNotes = `Identity last verified on ${formattedNewDate}. Confirmed still within ${thresholdLabel} review period for ${riskLevel} risk.`;
      for (const row of carryRows) {
        await supabase
          .from('assessment_evidence')
          .update({ verified_at: newVerifiedAt, notes: refreshedNotes })
          .eq('id', row.id);
      }
    }

    // 4. clients.last_cdd_verified_at — only touch if it currently equals the old date
    //    (a later verification may have pushed it forward, in which case leave alone).
    try {
      const { data: matter } = await supabase
        .from('matters')
        .select('client_id')
        .eq('id', assessment.matter_id)
        .single();

      if (matter) {
        const { data: client } = await supabase
          .from('clients')
          .select('last_cdd_verified_at')
          .eq('id', matter.client_id)
          .single();

        if (client && oldVerifiedAt && client.last_cdd_verified_at === oldVerifiedAt) {
          await supabase
            .from('clients')
            .update({ last_cdd_verified_at: newVerifiedAt })
            .eq('id', matter.client_id);
        }
      }
    } catch (err) {
      console.error('Failed to recheck client CDD date (non-fatal):', err);
    }

    // 5. Audit
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'amiqus_verification',
      entity_id: verificationId,
      action: 'amiqus_verified_at_corrected',
      metadata: {
        assessment_id: verification.assessment_id,
        action_id: verification.action_id,
        amiqus_record_id: verification.amiqus_record_id,
        old_verified_at: oldVerifiedAt,
        new_verified_at: newVerifiedAt,
      },
      created_by: user.id,
    });

    return { success: true };
  } catch (err) {
    console.error('Error in correctAmiqusVerificationDate:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Backfill missing `amiqus_client_id` AND `amiqus_client_name` values on
 * existing amiqus_verifications rows.
 *
 * Older records may have null client_id (causing "View in Amiqus" links to
 * fall back to the homepage) or null client_name (preventing the UI from
 * identifying which director/BO each verification relates to). This action
 * looks each row up via the Amiqus API and updates whichever fields are
 * missing.
 *
 * Scoped to a single assessment to keep the work bounded.
 */
export type BackfillResult =
  | { success: true; updated: number; total: number; failures: string[] }
  | { success: false; error: string };

export async function backfillAmiqusClientIds(assessmentId: string): Promise<BackfillResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    const apiKey = getAmiqusApiKey();
    if (!apiKey) {
      return { success: false, error: 'Amiqus integration is not configured' };
    }

    // Find verifications missing either client_id or client_name
    const { data: rows, error: queryErr } = await supabase
      .from('amiqus_verifications')
      .select('id, amiqus_record_id, amiqus_client_id, amiqus_client_name')
      .eq('assessment_id', assessmentId)
      .or('amiqus_client_id.is.null,amiqus_client_name.is.null');

    if (queryErr) {
      return { success: false, error: queryErr.message };
    }

    const total = rows?.length || 0;
    if (total === 0) {
      return { success: true, updated: 0, total: 0, failures: [] };
    }

    let updated = 0;
    const failures: string[] = [];

    for (const row of rows || []) {
      try {
        // Resolve client_id (use existing if present, otherwise look it up)
        let clientId: number | null = row.amiqus_client_id;
        if (!clientId && row.amiqus_record_id) {
          const result = await getAmiqusRecordOrCase(row.amiqus_record_id, apiKey);
          if (result.data.client_id && result.data.client_id > 0) {
            clientId = result.data.client_id;
          }
        }

        // Fetch client name when we have a client_id and it's missing
        let clientName: string | null = row.amiqus_client_name;
        if (clientId && !clientName) {
          try {
            const client = await getAmiqusClient(clientId, apiKey);
            const formatted = formatAmiqusClientName(client);
            if (formatted) clientName = formatted;
          } catch (err) {
            // Don't fail the whole row — client_id is more important than name
            if (!(err instanceof AmiqusError) || err.statusCode !== 404) {
              console.error(`Failed to fetch Amiqus client ${clientId}:`, err);
            }
          }
        }

        // Build update payload — only include fields that changed
        const update: { amiqus_client_id?: number; amiqus_client_name?: string } = {};
        if (clientId && clientId !== row.amiqus_client_id) update.amiqus_client_id = clientId;
        if (clientName && clientName !== row.amiqus_client_name) update.amiqus_client_name = clientName;

        if (Object.keys(update).length === 0) {
          // Nothing fetched — count as a failure for visibility
          failures.push(`Record ${row.amiqus_record_id}: no client info returned by Amiqus`);
          continue;
        }

        const { error: updateErr } = await supabase
          .from('amiqus_verifications')
          .update(update)
          .eq('id', row.id);
        if (updateErr) {
          failures.push(`Record ${row.amiqus_record_id}: ${updateErr.message}`);
        } else {
          updated++;
        }
      } catch (err) {
        const msg = err instanceof AmiqusError ? err.message : err instanceof Error ? err.message : 'Unknown error';
        failures.push(`Record ${row.amiqus_record_id}: ${msg}`);
      }
    }

    return { success: true, updated, total, failures };
  } catch (err) {
    console.error('Error in backfillAmiqusClientIds:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
