/**
 * Clio Drive Sync Engine
 *
 * Orchestrates syncing evidence files and finalisation PDF from the Hub to Clio Drive.
 * All operations are non-blocking — errors are caught and tracked in clio_drive_sync.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssessmentEvidence } from '@/lib/supabase/types';
import {
  ensureComplianceFolder,
  uploadDocumentToClio,
  deleteClioDocument,
  getClioDocumentUrl,
  getClioBaseUrl,
  ClioError,
} from './client';
import { getClioAccessTokenForFirm } from './token';
import { generateAssessmentPdf } from './drive-pdf';
import type { CddItemSummary, CddEvidenceItem, DeclarationData, RiskFactorSummary } from './drive-pdf';
import { generateSowHtml, generateSofHtml } from './sow-sof-html';
import { parseCHReport, getDirectorNames, generateCompaniesHouseHtml } from './ch-report';
import { isBeneficialOwnerListRow } from '@/lib/evidence/beneficial-owners';

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
export async function syncFinalisationPdfToClio(
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
    .select('id, reference, risk_level, score, finalised_at, matter_id, output_snapshot, input_snapshot, created_by, finalised_by')
    .eq('id', assessmentId)
    .single();

  if (!assessment) return;

  const { data: matter } = await supabase
    .from('matters')
    .select('reference, description, client_id')
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

  // Fetch evidence, Amiqus verifications, and completion progress for PDF content
  const outputSnapshot = assessment.output_snapshot as {
    mandatoryActions?: Array<{ actionId: string; description: string; displayText?: string; category: string }>;
    eddTriggers?: Array<{ description: string }>;
    warnings?: Array<{ message: string }>;
    riskFactors?: Array<{ factorLabel: string; selectedAnswer: string | string[]; score: number; rationale: string }>;
    rationale?: string[];
  };

  const [evidenceResult, amiqusResult, progressResult] = await Promise.all([
    supabase
      .from('assessment_evidence')
      .select('action_id, evidence_type, source, label, verified_at, data, notes')
      .eq('assessment_id', assessmentId),
    supabase
      .from('amiqus_verifications')
      .select('action_id, amiqus_record_id, amiqus_client_id, amiqus_client_name, status, verified_at')
      .eq('assessment_id', assessmentId)
      .eq('status', 'complete'),
    supabase
      .from('cdd_item_progress')
      .select('action_id, completed_at, completed_by')
      .eq('assessment_id', assessmentId),
  ]);

  // Build lookup maps
  const completedActions = new Set<string>();
  const progressByAction = new Map<string, { completed_at: string | null; completed_by: string | null }>();
  for (const p of progressResult.data || []) {
    if (p.completed_at) completedActions.add(p.action_id);
    progressByAction.set(p.action_id, p);
  }

  // Look up user names for completion attribution
  const completedByIds = [...new Set(
    (progressResult.data || []).filter(p => p.completed_by).map(p => p.completed_by!)
  )];
  const progressUserNames: Record<string, string> = {};
  if (completedByIds.length > 0) {
    const { data: profiles } = await supabase.from('user_profiles').select('user_id, full_name').in('user_id', completedByIds);
    if (profiles) {
      for (const p of profiles) {
        if (p.full_name) progressUserNames[p.user_id] = p.full_name;
      }
    }
  }

  const evidenceByAction = new Map<string, Array<{ evidence_type: string; source: string; label: string; verified_at: string | null; notes: string | null; data?: unknown; action_id: string | null }>>();
  const declarations: DeclarationData[] = [];
  // Track most recent CH evidence (for inline rendering on item 3 + director names on item 5)
  let latestChData: unknown = null;
  // Collect manually-entered beneficial owner names for item 6
  let beneficialOwnerNames: string[] = [];
  for (const e of evidenceResult.data || []) {
    if (e.action_id) {
      const list = evidenceByAction.get(e.action_id) || [];
      list.push(e);
      evidenceByAction.set(e.action_id, list);
    }
    if (e.evidence_type === 'companies_house' && e.data) {
      latestChData = e.data; // last write wins (rows ordered by created_at ASC by default)
    }
    if (isBeneficialOwnerListRow(e) && e.data && typeof e.data === 'object') {
      const namesField = (e.data as { names?: unknown }).names;
      if (Array.isArray(namesField)) {
        beneficialOwnerNames = namesField.filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
      }
    }
    // Collect SoW/SoF declarations for expanded display in PDF
    if ((e.evidence_type === 'sow_declaration' || e.evidence_type === 'sof_declaration') && e.data) {
      declarations.push({
        type: e.evidence_type as 'sow_declaration' | 'sof_declaration',
        actionId: e.action_id,
        data: e.data as Record<string, string | string[]>,
      });
    }
  }
  const parsedChReport = parseCHReport(latestChData);
  const directorNames = getDirectorNames(parsedChReport);

  // Group all Amiqus verifications per action — corporate matters often have
  // multiple verifications (one per director / beneficial owner) on the same item.
  const amiqusByAction = new Map<string, Array<{ amiqus_record_id: number | null; amiqus_client_id: number | null; amiqus_client_name: string | null; verified_at: string | null }>>();
  for (const v of amiqusResult.data || []) {
    if (!v.action_id) continue;
    const list = amiqusByAction.get(v.action_id) || [];
    list.push(v);
    amiqusByAction.set(v.action_id, list);
  }

  const fmtDate = (d: string) => new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // Build CDD item summaries for PDF
  const cddItems: CddItemSummary[] = (outputSnapshot.mandatoryActions || []).map((action) => {
    const completed = completedActions.has(action.actionId);
    const actionEvidence = evidenceByAction.get(action.actionId) || [];
    const amiqusList = amiqusByAction.get(action.actionId) || [];
    const progress = progressByAction.get(action.actionId);

    const evidenceItems: CddEvidenceItem[] = [];
    let amiqusUrl: string | null = null;

    // Amiqus verifications — one line per verification (corporate matters
    // commonly have multiple, one per director / beneficial owner).
    const hasCarryForward = actionEvidence.some(ev => ev.label === 'Prior identity verification confirmed still valid');
    const carryForwardEvidence = actionEvidence.find(ev => ev.label === 'Prior identity verification confirmed still valid');
    for (const amiqus of amiqusList) {
      if (!amiqus.amiqus_record_id) continue;
      const url = amiqus.amiqus_client_id ? `https://id.amiqus.co/clients/${amiqus.amiqus_client_id}` : 'https://id.amiqus.co/';
      if (!amiqusUrl) amiqusUrl = url; // remember first for the row-level link

      const namePrefix = amiqus.amiqus_client_name ? `${amiqus.amiqus_client_name} — ` : '';
      // Carry-forward wording only applies when there's exactly one verification
      const showCarryForwardWording = hasCarryForward && amiqusList.length === 1;
      let label: string;
      if (showCarryForwardWording) {
        const verifiedDate = amiqus.verified_at ? fmtDate(amiqus.verified_at) : 'unknown';
        const confirmedDate = carryForwardEvidence?.verified_at ? fmtDate(carryForwardEvidence.verified_at) : null;
        label = `${namePrefix}Identity verified electronically — existing Amiqus verification dated ${verifiedDate} was confirmed as still valid for this assessment${confirmedDate ? ` on ${confirmedDate}` : ''}`;
      } else {
        label = `${namePrefix}Identity verified electronically${amiqus.amiqus_record_id ? ` (case ${amiqus.amiqus_record_id})` : ''}`;
      }
      evidenceItems.push({
        type: 'amiqus',
        label,
        date: !showCarryForwardWording && amiqus.verified_at ? `Verified ${fmtDate(amiqus.verified_at)}` : undefined,
        url,
      });
    }

    // Other evidence (excluding carry-forward when any Amiqus row exists)
    const hasAmiqus = amiqusList.length > 0;
    for (const ev of actionEvidence) {
      if (hasAmiqus && ev.label === 'Prior identity verification confirmed still valid') continue;
      if (isBeneficialOwnerListRow(ev)) continue; // BO list is rendered under requirement, not as evidence
      if (ev.evidence_type === 'amiqus') continue; // already represented above
      const evType = ev.evidence_type === 'file_upload' ? 'file' as const
        : ev.evidence_type === 'companies_house' ? 'ch' as const
        : (ev.evidence_type === 'sow_declaration' || ev.evidence_type === 'sof_declaration') ? 'declaration' as const
        : 'note' as const;
      evidenceItems.push({
        type: evType,
        label: ev.label || ev.source || ev.evidence_type,
        date: ev.verified_at ? `Verified ${fmtDate(ev.verified_at)}` : undefined,
        notes: ev.notes || undefined,
        // Attach structured CH report so the PDF can render it inline
        chReport: ev.evidence_type === 'companies_house' && ev.data
          ? parseCHReport(ev.data) ?? undefined
          : undefined,
      });
    }

    // Persons-list for items that need explicit director / beneficial owner enumeration.
    // Directors come from Companies House; beneficial owners are entered manually.
    let personList: { names: string[] } | null = null;
    if (action.actionId === 'identify_and_verify_directors' && directorNames.length > 0) {
      personList = { names: directorNames };
    } else if (action.actionId === 'identify_and_verify_beneficial_owners' && beneficialOwnerNames.length > 0) {
      personList = { names: beneficialOwnerNames };
    }

    const completedDate = progress?.completed_at ? fmtDate(progress.completed_at) : null;
    const completedBy = progress?.completed_by ? progressUserNames[progress.completed_by] || null : null;

    return {
      description: action.displayText || action.description,
      category: action.category,
      completed,
      completedDate,
      completedBy,
      evidenceItems,
      evidenceSummary: evidenceItems.length === 0 && completed ? 'Confirmed by user' : null,
      amiqusUrl,
      personList,
    };
  });

  const completedCount = cddItems.filter(i => i.completed).length;

  // Build form questions from input snapshot
  const inputSnapshot = assessment.output_snapshot ? (assessment as Record<string, unknown>).input_snapshot as {
    clientType?: string;
    formAnswers?: Record<string, string | string[]>;
  } : null;
  let formQuestions: Array<{ type: 'section' | 'question'; label: string; answer?: string; score?: number; eddTrigger?: boolean }> = [];
  if (inputSnapshot?.formAnswers) {
    const isIndividual = inputSnapshot.clientType === 'individual';
    const formConfig = isIndividual
      ? (await import('@/config/eventus/forms/CMLRA_individual.json')).default
      : (await import('@/config/eventus/forms/CMLRA_corporate.json')).default;
    const scoringConfig = (await import('@/config/eventus/risk_scoring_v3_8.json')).default;

    const riskFactorByField = new Map<string, { score: number }>();
    for (const rf of (outputSnapshot.riskFactors || []) as unknown as Array<{ formFieldId: string; score: number }>) {
      if (rf.formFieldId) riskFactorByField.set(rf.formFieldId, rf);
    }

    // Build EDD trigger field lookup
    const clientTypeKey = isIndividual ? 'individual' : 'corporate';
    const eddTriggerFields = new Set<string>();
    const eddTriggersRaw = (outputSnapshot as unknown as { eddTriggers?: Array<{ triggerId?: string; id?: string }> }).eddTriggers || [];
    const firedTriggerIds = new Set<string>(eddTriggersRaw.map(t => t.triggerId || t.id || '').filter(Boolean));
    for (const trigger of (scoringConfig.eddTriggers || [])) {
      const fieldId = (trigger.fieldMapping as Record<string, string>)?.[clientTypeKey];
      if (fieldId && firedTriggerIds.has(trigger.id)) {
        eddTriggerFields.add(fieldId);
      }
    }

    const fieldMap = new Map<string, Record<string, unknown>>();
    for (const f of formConfig.fields) {
      fieldMap.set(f.id, f);
    }

    // Check conditional field visibility
    function isFieldVisible(field: Record<string, unknown>): boolean {
      const showIf = field.show_if as Record<string, string | string[]> | undefined;
      if (!showIf) return true;
      for (const [depId, requiredValue] of Object.entries(showIf)) {
        const actual = inputSnapshot?.formAnswers?.[depId];
        if (!actual) return false;
        if (Array.isArray(requiredValue)) {
          const actualStr = Array.isArray(actual) ? actual[0] : actual;
          if (!requiredValue.includes(actualStr)) return false;
        } else {
          const actualStr = Array.isArray(actual) ? actual[0] : actual;
          if (actualStr !== requiredValue) return false;
        }
      }
      return true;
    }

    function walkFields(fieldIds: string[]) {
      for (const fid of fieldIds) {
        const field = fieldMap.get(fid);
        if (!field) continue;
        if (field.type === 'section') {
          if (field.label) formQuestions.push({ type: 'section', label: field.label as string });
          if (field.fields) walkFields(field.fields as string[]);
        } else if (field.type !== 'rich_text') {
          if (!isFieldVisible(field)) continue;
          const label = typeof field.label === 'object' && field.label !== null
            ? (field.label as { value: string }).value
            : field.label as string;
          if (!label) continue;
          const answer = inputSnapshot?.formAnswers?.[fid];
          const rf = riskFactorByField.get(fid);
          formQuestions.push({
            type: 'question',
            label,
            answer: answer ? (Array.isArray(answer) ? answer.join(', ') : answer) : undefined,
            score: rf?.score,
            eddTrigger: eddTriggerFields.has(fid),
          });
        }
      }
    }

    const rootSection = formConfig.fields.find((f: Record<string, unknown>) => f.type === 'section' && f.id === '1');
    if (rootSection?.fields) walkFields(rootSection.fields as string[]);
  }

  // Look up user names for created_by / finalised_by
  let createdByName: string | null = null;
  let finalisedByName: string | null = null;
  const assessmentRecord = assessment as Record<string, unknown>;
  const userIds = [assessmentRecord.created_by, assessmentRecord.finalised_by].filter(Boolean) as string[];
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from('user_profiles').select('user_id, full_name').in('user_id', userIds);
    if (profiles) {
      for (const p of profiles) {
        if (p.full_name && p.user_id === assessmentRecord.created_by) createdByName = p.full_name;
        if (p.full_name && p.user_id === assessmentRecord.finalised_by) finalisedByName = p.full_name;
      }
    }
  }

  // Generate PDF
  const hubBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://eventus-aml-hub.vercel.app';
  const fileBuffer = await generateAssessmentPdf({
    assessmentId: assessment.id,
    assessmentReference: assessment.reference,
    clientName: client.name,
    matterReference: matter.reference,
    matterDescription: matter.description ?? null,
    riskLevel: assessment.risk_level,
    score: assessment.score,
    finalisedAt: assessment.finalised_at || new Date().toISOString(),
    hubBaseUrl,
    cddItems,
    completedCount,
    totalCount: cddItems.length,
    eddTriggers: outputSnapshot.eddTriggers,
    warnings: outputSnapshot.warnings?.map(w => w.message),
    declarations,
    riskFactors: (outputSnapshot.riskFactors || []) as RiskFactorSummary[],
    rationale: outputSnapshot.rationale || [],
    formQuestions,
    createdByName,
    finalisedByName,
    clioComplianceFolderUrl: `${getClioBaseUrl()}/nc/#/matters/${clioMatterId}/documents`,
  });

  const fileName = `AML-Assessment-${assessment.reference}.pdf`;

  await executeDirectUpload(
    supabase,
    syncRecord.id,
    fileName,
    fileBuffer,
    'application/pdf',
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
    await syncFinalisationPdfToClio(
      supabase,
      syncRecord.assessment_id,
      syncRecord.firm_id,
      syncRecord.clio_matter_id,
      syncRecord.created_by || ''
    );
  }
}

/**
 * Force-resync an already-synced evidence record:
 * deletes the previously uploaded Clio document and re-runs the upload on the
 * same sync row. Used when the renderer changes (e.g. switching the Companies
 * House evidence from JSON to HTML) and we want the file in Clio Drive to
 * reflect the new format.
 *
 * If the Clio delete fails (e.g. user removed the file manually, token issues),
 * we log it but continue — the new upload will land alongside.
 */
export async function resyncEvidenceUpload(
  supabase: SupabaseClient,
  syncId: string
): Promise<void> {
  const { data: syncRecord } = await supabase
    .from('clio_drive_sync')
    .select('*')
    .eq('id', syncId)
    .single();

  if (!syncRecord) return;
  if (syncRecord.sync_type !== 'evidence' || !syncRecord.evidence_id) return;

  const { data: evidence } = await supabase
    .from('assessment_evidence')
    .select('*')
    .eq('id', syncRecord.evidence_id)
    .single();

  if (!evidence) {
    await updateSyncStatus(supabase, syncId, 'failed', 'Evidence record not found');
    return;
  }

  // Best-effort delete of the existing Clio document before re-upload.
  if (syncRecord.clio_document_id) {
    try {
      const tokenResult = await getClioAccessTokenForFirm(supabase, syncRecord.firm_id);
      if (tokenResult) {
        await deleteClioDocument(syncRecord.clio_document_id, tokenResult.accessToken);
      }
    } catch (err) {
      console.warn(
        `[clio-drive-sync] Failed to delete old document ${syncRecord.clio_document_id} during resync; continuing.`,
        err
      );
    }
  }

  // Reset the row to pending so executeSyncUpload can run cleanly. Null out
  // the old document refs so a partial failure doesn't leave a stale "synced"
  // url pointing at a file we just deleted.
  await supabase
    .from('clio_drive_sync')
    .update({
      status: 'pending',
      clio_document_id: null,
      clio_document_url: null,
      error_message: null,
      synced_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', syncId);

  await executeSyncUpload(
    supabase,
    syncId,
    evidence,
    syncRecord.firm_id,
    syncRecord.clio_matter_id
  );
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
      // Render Companies House lookup as a self-contained HTML document so
      // it's actually readable from Clio Drive (the JSON dump that used to
      // live here was only useful to developers).
      const parsed = parseCHReport(evidence.data);
      const chData = evidence.data as Record<string, unknown>;
      const profile = (chData?.profile ?? {}) as Record<string, unknown>;
      const companyName = (profile.company_name as string | undefined)
        || evidence.label
        || 'lookup';
      const companyNumber = profile.company_number as string | undefined;

      if (parsed) {
        const context = await fetchAssessmentContext(supabase, evidence.assessment_id);
        if (!context) {
          await updateSyncStatus(supabase, syncId, 'failed', 'Assessment context not found');
          return;
        }
        const html = generateCompaniesHouseHtml({
          companyName,
          companyNumber,
          clientName: context.clientName,
          matterReference: context.matterReference,
          assessmentReference: context.assessmentReference,
          report: parsed,
        });
        fileName = `CompaniesHouse-${companyName}.html`;
        fileContent = Buffer.from(html, 'utf-8');
        contentType = 'text/html';
      } else {
        // Malformed payload — fall back to raw JSON so the evidence isn't lost.
        console.warn(`[clio-drive-sync] CH evidence ${evidence.id} parse failed; uploading raw JSON`);
        fileName = `CompaniesHouse-${companyName}.json`;
        fileContent = Buffer.from(JSON.stringify(evidence.data, null, 2), 'utf-8');
        contentType = 'application/json';
      }
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
    const docUrl = getClioDocumentUrl(doc.id, clioMatterIdNum, folder.id);

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
      ? `${err.message} (${err.statusCode || 'unknown'})`
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
    const docUrl = getClioDocumentUrl(doc.id, clioMatterIdNum, folder.id);

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
      ? `${err.message} (${err.statusCode || 'unknown'})`
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
