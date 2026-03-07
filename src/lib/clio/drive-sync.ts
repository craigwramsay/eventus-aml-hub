/**
 * Clio Drive Sync Engine
 *
 * Orchestrates syncing evidence files and finalisation HTML from the Hub to Clio Drive.
 * All operations are non-blocking — errors are caught and tracked in clio_drive_sync.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssessmentEvidence } from '@/lib/supabase/types';
import {
  ensureComplianceFolder,
  uploadDocumentToClio,
  getClioDocumentUrl,
  ClioError,
} from './client';
import { getClioAccessTokenForFirm } from './token';
import { generateAssessmentHtml } from './drive-html';
import { generateSowHtml, generateSofHtml } from './sow-sof-html';

/** Evidence types that produce files worth syncing to Clio Drive */
const SYNCABLE_EVIDENCE_TYPES = ['file_upload', 'companies_house', 'sow_declaration', 'sof_declaration'];

/**
 * Sync a single evidence record to Clio Drive.
 *
 * Only processes syncable evidence types (file_upload, companies_house).
 * Creates a tracking record in clio_drive_sync and updates it through the process.
 */
export async function syncEvidenceToClio(
  supabase: SupabaseClient,
  evidenceId: string,
  assessmentId: string,
  firmId: string,
  clioMatterId: string,
  userId: string
): Promise<void> {
  // Fetch the evidence record
  const { data: evidence } = await supabase
    .from('assessment_evidence')
    .select('*')
    .eq('id', evidenceId)
    .single();

  if (!evidence) return;

  // Only sync syncable types
  if (!SYNCABLE_EVIDENCE_TYPES.includes(evidence.evidence_type)) return;

  // Check for existing synced record (prevent duplicates)
  const { data: existing } = await supabase
    .from('clio_drive_sync')
    .select('id, status')
    .eq('evidence_id', evidenceId)
    .eq('status', 'synced')
    .maybeSingle();

  if (existing) return; // Already synced

  // Create tracking record
  const { data: syncRecord, error: insertErr } = await supabase
    .from('clio_drive_sync')
    .insert({
      firm_id: firmId,
      assessment_id: assessmentId,
      evidence_id: evidenceId,
      sync_type: 'evidence' as const,
      status: 'pending' as const,
      clio_matter_id: clioMatterId,
      created_by: userId,
    })
    .select('id')
    .single();

  if (insertErr || !syncRecord) {
    console.error('Failed to create clio_drive_sync record:', insertErr);
    return;
  }

  await executeSyncUpload(supabase, syncRecord.id, evidence, firmId, clioMatterId);
}

/**
 * Generate and upload an HTML summary file to Clio Drive on assessment finalisation.
 */
export async function syncFinalisationHtmlToClio(
  supabase: SupabaseClient,
  assessmentId: string,
  firmId: string,
  clioMatterId: string,
  userId: string
): Promise<void> {
  // Check for existing synced finalisation record
  const { data: existing } = await supabase
    .from('clio_drive_sync')
    .select('id, status')
    .eq('assessment_id', assessmentId)
    .eq('sync_type', 'finalisation_html')
    .eq('status', 'synced')
    .maybeSingle();

  if (existing) return; // Already synced

  // Fetch assessment with related data
  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, reference, risk_level, score, finalised_at, input_snapshot, output_snapshot, matter_id')
    .eq('id', assessmentId)
    .single();

  if (!assessment) return;

  const { data: matter } = await supabase
    .from('matters')
    .select('reference, client_id')
    .eq('id', assessment.matter_id)
    .single();

  if (!matter) return;

  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('id', matter.client_id)
    .single();

  if (!client) return;

  // Create tracking record
  const { data: syncRecord, error: insertErr } = await supabase
    .from('clio_drive_sync')
    .insert({
      firm_id: firmId,
      assessment_id: assessmentId,
      sync_type: 'finalisation_html' as const,
      status: 'pending' as const,
      clio_matter_id: clioMatterId,
      created_by: userId,
    })
    .select('id')
    .single();

  if (insertErr || !syncRecord) {
    console.error('Failed to create clio_drive_sync record:', insertErr);
    return;
  }

  // Generate HTML
  const outputSnapshot = assessment.output_snapshot as {
    mandatoryActions?: Array<{ description: string; category: string }>;
    eddTriggers?: Array<{ description: string }>;
  };

  // Fetch all synced document links for inclusion in the HTML
  const clioDocuments = await fetchSyncedDocumentLinks(supabase, assessmentId);

  const hubBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://eventus-aml-hub.vercel.app';
  const htmlContent = generateAssessmentHtml({
    assessmentId: assessment.id,
    assessmentReference: assessment.reference,
    clientName: client.name,
    matterReference: matter.reference,
    riskLevel: assessment.risk_level,
    score: assessment.score,
    finalisedAt: assessment.finalised_at || new Date().toISOString(),
    mandatoryActions: outputSnapshot.mandatoryActions || [],
    eddTriggers: outputSnapshot.eddTriggers,
    hubBaseUrl,
    clioDocuments: clioDocuments.length > 0 ? clioDocuments : undefined,
  });

  const fileName = `AML-Assessment-${assessment.reference}.html`;
  const fileBuffer = Buffer.from(htmlContent, 'utf-8');

  await executeDirectUpload(
    supabase,
    syncRecord.id,
    fileName,
    fileBuffer,
    'text/html',
    firmId,
    clioMatterId
  );
}

/**
 * Retry a failed sync record.
 */
export async function retryFailedSync(
  supabase: SupabaseClient,
  syncId: string
): Promise<void> {
  const { data: syncRecord } = await supabase
    .from('clio_drive_sync')
    .select('*')
    .eq('id', syncId)
    .single();

  if (!syncRecord || syncRecord.status !== 'failed') return;

  if (syncRecord.sync_type === 'evidence' && syncRecord.evidence_id) {
    // Re-fetch evidence and retry
    const { data: evidence } = await supabase
      .from('assessment_evidence')
      .select('*')
      .eq('id', syncRecord.evidence_id)
      .single();

    if (!evidence) {
      await updateSyncStatus(supabase, syncId, 'failed', 'Evidence record not found');
      return;
    }

    await executeSyncUpload(
      supabase,
      syncId,
      evidence,
      syncRecord.firm_id,
      syncRecord.clio_matter_id
    );
  } else if (syncRecord.sync_type === 'finalisation_html') {
    // Delete the failed record and re-run the full flow
    await supabase.from('clio_drive_sync').delete().eq('id', syncId);
    await syncFinalisationHtmlToClio(
      supabase,
      syncRecord.assessment_id,
      syncRecord.firm_id,
      syncRecord.clio_matter_id,
      syncRecord.created_by || ''
    );
  }
}

// ── Internal helpers ──────────────────────────────────────────────────

/**
 * Execute the actual upload of an evidence file to Clio Drive.
 */
async function executeSyncUpload(
  supabase: SupabaseClient,
  syncId: string,
  evidence: AssessmentEvidence,
  firmId: string,
  clioMatterId: string
): Promise<void> {
  try {
    // Get valid Clio token
    const tokenResult = await getClioAccessTokenForFirm(supabase, firmId);
    if (!tokenResult) {
      await updateSyncStatus(supabase, syncId, 'failed', 'Clio not connected');
      return;
    }

    const { accessToken } = tokenResult;
    const clioMatterIdNum = parseInt(clioMatterId, 10);

    // Ensure Compliance folder exists
    const folder = await ensureComplianceFolder(clioMatterIdNum, accessToken);
    await supabase
      .from('clio_drive_sync')
      .update({ clio_folder_id: folder.id, updated_at: new Date().toISOString() })
      .eq('id', syncId);

    // Get file content based on evidence type
    let fileName: string;
    let fileContent: Buffer;
    let contentType: string;

    if (evidence.evidence_type === 'file_upload' && evidence.file_path) {
      // Download from Supabase Storage
      const { data: fileData, error: downloadErr } = await supabase.storage
        .from('evidence')
        .download(evidence.file_path);

      if (downloadErr || !fileData) {
        await updateSyncStatus(supabase, syncId, 'failed', `Storage download failed: ${downloadErr?.message || 'no data'}`);
        return;
      }

      fileName = evidence.file_name || evidence.file_path.split('/').pop() || 'document';
      fileContent = Buffer.from(await fileData.arrayBuffer());
      contentType = fileData.type || 'application/octet-stream';
    } else if (evidence.evidence_type === 'companies_house' && evidence.data) {
      // Serialize Companies House data as JSON
      fileName = `CompaniesHouse-${evidence.label || 'lookup'}.json`;
      fileContent = Buffer.from(JSON.stringify(evidence.data, null, 2), 'utf-8');
      contentType = 'application/json';
    } else if ((evidence.evidence_type === 'sow_declaration' || evidence.evidence_type === 'sof_declaration') && evidence.data) {
      // Render SoW/SoF declaration as HTML
      const context = await fetchAssessmentContext(supabase, evidence.assessment_id);
      if (!context) {
        await updateSyncStatus(supabase, syncId, 'failed', 'Assessment context not found');
        return;
      }

      const formData = evidence.data as Record<string, string | string[]>;

      if (evidence.evidence_type === 'sow_declaration') {
        const formType = Object.keys(formData).some(k => k.startsWith('sow_corp_')) ? 'corporate' : 'individual';
        const html = generateSowHtml({
          clientName: context.clientName,
          matterReference: context.matterReference,
          assessmentReference: context.assessmentReference,
          formType,
          formData,
          submittedAt: evidence.created_at,
        });
        fileName = `SoW-Declaration-${context.assessmentReference}.html`;
        fileContent = Buffer.from(html, 'utf-8');
      } else {
        const html = generateSofHtml({
          clientName: context.clientName,
          matterReference: context.matterReference,
          assessmentReference: context.assessmentReference,
          formData,
          submittedAt: evidence.created_at,
        });
        fileName = `SoF-Declaration-${context.assessmentReference}.html`;
        fileContent = Buffer.from(html, 'utf-8');
      }
      contentType = 'text/html';
    } else {
      await updateSyncStatus(supabase, syncId, 'failed', 'No file content available');
      return;
    }

    // Update status to uploading
    await supabase
      .from('clio_drive_sync')
      .update({ status: 'uploading', last_attempted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', syncId);

    // Upload to Clio Drive
    const doc = await uploadDocumentToClio(folder.id, fileName, fileContent, contentType, accessToken);
    const docUrl = getClioDocumentUrl(doc.id);

    // Mark as synced
    await supabase
      .from('clio_drive_sync')
      .update({
        status: 'synced',
        clio_document_id: doc.id,
        clio_document_url: docUrl,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', syncId);
  } catch (err) {
    const message = err instanceof ClioError
      ? `Clio API error: ${err.message} (${err.statusCode || 'unknown'})`
      : err instanceof Error
        ? err.message
        : 'Unknown error';

    await updateSyncStatus(supabase, syncId, 'failed', message);
  }
}

/**
 * Execute a direct upload (for generated content like HTML) to Clio Drive.
 */
async function executeDirectUpload(
  supabase: SupabaseClient,
  syncId: string,
  fileName: string,
  fileContent: Buffer,
  contentType: string,
  firmId: string,
  clioMatterId: string
): Promise<void> {
  try {
    const tokenResult = await getClioAccessTokenForFirm(supabase, firmId);
    if (!tokenResult) {
      await updateSyncStatus(supabase, syncId, 'failed', 'Clio not connected');
      return;
    }

    const { accessToken } = tokenResult;
    const clioMatterIdNum = parseInt(clioMatterId, 10);

    const folder = await ensureComplianceFolder(clioMatterIdNum, accessToken);
    await supabase
      .from('clio_drive_sync')
      .update({
        clio_folder_id: folder.id,
        status: 'uploading',
        last_attempted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', syncId);

    const doc = await uploadDocumentToClio(folder.id, fileName, fileContent, contentType, accessToken);
    const docUrl = getClioDocumentUrl(doc.id);

    await supabase
      .from('clio_drive_sync')
      .update({
        status: 'synced',
        clio_document_id: doc.id,
        clio_document_url: docUrl,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', syncId);
  } catch (err) {
    const message = err instanceof ClioError
      ? `Clio API error: ${err.message} (${err.statusCode || 'unknown'})`
      : err instanceof Error
        ? err.message
        : 'Unknown error';

    await updateSyncStatus(supabase, syncId, 'failed', message);
  }
}

/**
 * Fetch assessment → matter → client context for SoW/SoF HTML generation.
 */
async function fetchAssessmentContext(
  supabase: SupabaseClient,
  assessmentId: string
): Promise<{ clientName: string; matterReference: string; assessmentReference: string } | null> {
  const { data: assessment } = await supabase
    .from('assessments')
    .select('reference, matter_id')
    .eq('id', assessmentId)
    .single();

  if (!assessment) return null;

  const { data: matter } = await supabase
    .from('matters')
    .select('reference, client_id')
    .eq('id', assessment.matter_id)
    .single();

  if (!matter) return null;

  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('id', matter.client_id)
    .single();

  if (!client) return null;

  return {
    clientName: client.name,
    matterReference: matter.reference,
    assessmentReference: assessment.reference,
  };
}

/**
 * Fetch all synced Clio Drive document URLs for an assessment's evidence.
 */
async function fetchSyncedDocumentLinks(
  supabase: SupabaseClient,
  assessmentId: string
): Promise<Array<{ label: string; url: string }>> {
  const { data: syncedDocs } = await supabase
    .from('clio_drive_sync')
    .select('evidence_id, clio_document_url')
    .eq('assessment_id', assessmentId)
    .eq('sync_type', 'evidence')
    .eq('status', 'synced');

  if (!syncedDocs || syncedDocs.length === 0) return [];

  const evidenceIds = syncedDocs
    .map((d: { evidence_id: string | null }) => d.evidence_id)
    .filter((id: string | null): id is string => !!id);

  if (evidenceIds.length === 0) return [];

  const { data: evidenceRecords } = await supabase
    .from('assessment_evidence')
    .select('id, label, file_name, evidence_type')
    .in('id', evidenceIds);

  if (!evidenceRecords) return [];

  const evidenceMap = new Map(
    evidenceRecords.map((e: { id: string; label: string; file_name: string | null; evidence_type: string }) => [e.id, e])
  );

  return syncedDocs
    .filter((d: { clio_document_url: string | null }) => d.clio_document_url)
    .map((d: { evidence_id: string | null; clio_document_url: string | null }) => {
      const evidence = d.evidence_id ? evidenceMap.get(d.evidence_id) : null;
      const label = evidence?.label || evidence?.file_name || 'Document';
      return { label, url: d.clio_document_url! };
    });
}

/**
 * Update sync record status with error handling.
 */
async function updateSyncStatus(
  supabase: SupabaseClient,
  syncId: string,
  status: 'failed',
  errorMessage: string
): Promise<void> {
  await supabase
    .from('clio_drive_sync')
    .update({
      status,
      error_message: errorMessage,
      // retry_count incremented separately below
      last_attempted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', syncId);

  // Increment retry_count separately (no rpc needed, just read-modify-write)
  const { data: current } = await supabase
    .from('clio_drive_sync')
    .select('retry_count')
    .eq('id', syncId)
    .single();

  if (current) {
    await supabase
      .from('clio_drive_sync')
      .update({ retry_count: (current.retry_count || 0) + 1 })
      .eq('id', syncId);
  }
}
