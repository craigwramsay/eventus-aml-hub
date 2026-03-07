'use server';

/**
 * Clio Drive Server Actions
 *
 * Non-blocking sync of evidence and finalisation documents to Clio Drive.
 * All sync operations are fire-and-forget — they never block local operations.
 */

import { createClient } from '@/lib/supabase/server';
import type { ClioDriveSync } from '@/lib/supabase/types';
import { syncEvidenceToClio, syncFinalisationHtmlToClio, retryFailedSync } from '@/lib/clio/drive-sync';

/**
 * Trigger Clio Drive sync for a newly created evidence record.
 * Non-blocking: swallows all errors to never interrupt evidence flow.
 *
 * Only syncs if the assessment's matter has a clio_matter_id.
 */
export async function triggerClioSync(
  assessmentId: string,
  evidenceId: string,
  firmId: string,
  userId: string
): Promise<void> {
  try {
    const supabase = await createClient();

    // Check if the assessment's matter is Clio-linked
    const { data: assessment } = await supabase
      .from('assessments')
      .select('matter_id')
      .eq('id', assessmentId)
      .single();

    if (!assessment) return;

    const { data: matter } = await supabase
      .from('matters')
      .select('clio_matter_id')
      .eq('id', assessment.matter_id)
      .single();

    if (!matter?.clio_matter_id) return; // Not Clio-linked

    await syncEvidenceToClio(supabase, evidenceId, assessmentId, firmId, matter.clio_matter_id, userId);
  } catch (err) {
    console.error('Non-blocking Clio Drive sync error:', err);
  }
}

/**
 * Trigger Clio Drive sync for a finalised assessment.
 * Non-blocking: swallows all errors to never interrupt finalisation.
 */
export async function triggerClioFinalisationSync(
  assessmentId: string,
  firmId: string,
  userId: string
): Promise<void> {
  try {
    const supabase = await createClient();

    const { data: assessment } = await supabase
      .from('assessments')
      .select('matter_id')
      .eq('id', assessmentId)
      .single();

    if (!assessment) return;

    const { data: matter } = await supabase
      .from('matters')
      .select('clio_matter_id')
      .eq('id', assessment.matter_id)
      .single();

    if (!matter?.clio_matter_id) return;

    await syncFinalisationHtmlToClio(supabase, assessmentId, firmId, matter.clio_matter_id, userId);
  } catch (err) {
    console.error('Non-blocking Clio finalisation sync error:', err);
  }
}

/**
 * Retry a failed Clio Drive sync.
 * Called from the UI when user clicks "Retry" on a failed sync badge.
 */
export async function retryClioDriveSync(
  syncId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    // Verify the user has access to this sync record (RLS handles firm isolation)
    const { data: syncRecord } = await supabase
      .from('clio_drive_sync')
      .select('id, status, firm_id')
      .eq('id', syncId)
      .single();

    if (!syncRecord) {
      return { success: false, error: 'Sync record not found' };
    }

    if (syncRecord.status !== 'failed') {
      return { success: false, error: 'Sync is not in failed state' };
    }

    await retryFailedSync(supabase, syncId);
    return { success: true };
  } catch (err) {
    console.error('Clio Drive retry error:', err);
    return { success: false, error: 'Retry failed' };
  }
}

/**
 * Get all Clio Drive sync records for an assessment.
 * Used by the assessment page to show sync status badges.
 */
export async function getClioDriveSyncForAssessment(
  assessmentId: string
): Promise<ClioDriveSync[]> {
  try {
    const supabase = await createClient();

    const { data } = await supabase
      .from('clio_drive_sync')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('created_at', { ascending: true });

    return data || [];
  } catch {
    return [];
  }
}
