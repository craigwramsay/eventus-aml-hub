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
  AmiqusError,
} from '@/lib/amiqus';

export type InitiateVerificationResult =
  | { success: true; verification: AmiqusVerification }
  | { success: false; error: string };

export type GetVerificationsResult =
  | { success: true; verifications: AmiqusVerification[] }
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
