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
import {
  getAmiqusApiKey,
  createAmiqusClient,
  createAmiqusRecord,
  getAmiqusRecordOrCase,
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
    const { data: verification, error: insertErr } = await supabase
      .from('amiqus_verifications')
      .insert({
        firm_id: profile.firm_id,
        assessment_id: assessmentId,
        action_id: actionId,
        amiqus_record_id: amiqusRecord.id,
        amiqus_client_id: amiqusClient.id,
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
 * Link an existing Amiqus record to an assessment action.
 *
 * Fetches the record from Amiqus to validate it exists and is complete,
 * then creates the same evidence trail as a webhook-completed verification:
 * amiqus_verifications row, assessment_evidence row, and client CDD date update.
 */
export async function linkExistingAmiqusRecord(
  assessmentId: string,
  actionId: string,
  amiqusRecordId: number
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

    // Check for existing verification for this assessment+action (any status)
    const { data: existing } = await supabase
      .from('amiqus_verifications')
      .select('id, status')
      .eq('assessment_id', assessmentId)
      .eq('action_id', actionId)
      .in('status', ['pending', 'in_progress', 'complete'])
      .maybeSingle();

    if (existing) {
      return { success: false, error: 'A verification already exists for this action' };
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

    // Record/case must be complete
    if (amiqusData.status !== 'complete') {
      return {
        success: false,
        error: `Amiqus ${amiqusResult.type} is not complete (current status: ${amiqusData.status}). Only completed verifications can be linked.`,
      };
    }

    // Extract verified_at date from completed_at
    const verifiedAt = amiqusData.completed_at
      ? amiqusData.completed_at.split('T')[0]
      : new Date().toISOString().split('T')[0];

    // Insert amiqus_verifications row
    const { data: verification, error: insertErr } = await supabase
      .from('amiqus_verifications')
      .insert({
        firm_id: profile.firm_id,
        assessment_id: assessmentId,
        action_id: actionId,
        amiqus_record_id: amiqusRecordId,
        amiqus_client_id: amiqusData.client_id,
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
        assessment_id: assessmentId,
        action_id: actionId,
        evidence_type: 'amiqus',
        label: 'Amiqus Identity Verification',
        source: 'Amiqus',
        data: { amiqus_record_id: amiqusRecordId, verified_at: verifiedAt },
        verified_at: verifiedAt,
        created_by: user.id,
      });

    if (evidenceErr) {
      console.error('Failed to create evidence for linked Amiqus record:', evidenceErr);
      // Non-fatal — verification row already exists
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
