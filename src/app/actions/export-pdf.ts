'use server';

/**
 * Server action to generate an assessment PDF for download.
 * Uses the same generateAssessmentPdf() as Clio Drive, ensuring identical output.
 */

import { createClient } from '@/lib/supabase/server';
import { generateAssessmentPdf } from '@/lib/clio/drive-pdf';
import type { CddItemSummary, CddEvidenceItem, DeclarationData, RiskFactorSummary } from '@/lib/clio/drive-pdf';
import { getClioBaseUrl } from '@/lib/clio/client';
import { parseCHReport, getDirectorNames } from '@/lib/clio/ch-report';
import { isBeneficialOwnerListRow } from '@/lib/evidence/beneficial-owners';
import { getAmiqusApiKey, getAmiqusRecordOrCase, AmiqusError } from '@/lib/amiqus';

export async function exportAssessmentPdf(
  assessmentId: string
): Promise<{ success: true; pdfBase64: string; fileName: string } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    // Fetch assessment
    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, reference, risk_level, score, finalised_at, matter_id, output_snapshot, input_snapshot, created_by, finalised_by')
      .eq('id', assessmentId)
      .single();

    if (!assessment) return { success: false, error: 'Assessment not found' };

    const { data: matter } = await supabase
      .from('matters')
      .select('reference, description, client_id, clio_matter_id')
      .eq('id', assessment.matter_id)
      .single();

    if (!matter) return { success: false, error: 'Matter not found' };

    const { data: client } = await supabase
      .from('clients')
      .select('name')
      .eq('id', matter.client_id)
      .single();

    if (!client) return { success: false, error: 'Client not found' };

    const outputSnapshot = assessment.output_snapshot as {
      mandatoryActions?: Array<{ actionId: string; description: string; displayText?: string; category: string }>;
      eddTriggers?: Array<{ description: string }>;
      warnings?: Array<{ message: string }>;
      riskFactors?: Array<{ factorId: string; factorLabel: string; formFieldId: string; selectedAnswer: string | string[]; score: number; rationale: string }>;
      rationale?: string[];
    };

    // Fetch evidence, Amiqus, and progress
    const [evidenceResult, amiqusResult, progressResult] = await Promise.all([
      supabase.from('assessment_evidence').select('action_id, evidence_type, source, label, verified_at, data, notes').eq('assessment_id', assessmentId),
      supabase.from('amiqus_verifications').select('id, action_id, amiqus_record_id, amiqus_client_id, status, verified_at').eq('assessment_id', assessmentId).eq('status', 'complete'),
      supabase.from('cdd_item_progress').select('action_id, completed_at, completed_by').eq('assessment_id', assessmentId),
    ]);

    // Auto-backfill missing amiqus_client_id values so "View in Amiqus" links
    // resolve to the correct client page rather than the homepage. Older records
    // (created before the client_id extraction fix) often have null client_id.
    const apiKey = getAmiqusApiKey();
    if (apiKey && amiqusResult.data) {
      const missingClientId = amiqusResult.data.filter(v => !v.amiqus_client_id && v.amiqus_record_id);
      for (const row of missingClientId) {
        try {
          const result = await getAmiqusRecordOrCase(row.amiqus_record_id, apiKey);
          if (result.data.client_id && result.data.client_id > 0) {
            await supabase
              .from('amiqus_verifications')
              .update({ amiqus_client_id: result.data.client_id })
              .eq('id', row.id);
            // Mutate in-memory so the rendered PDF uses the right URL
            row.amiqus_client_id = result.data.client_id;
          }
        } catch (err) {
          // Non-fatal — link will fall back to homepage for this row
          if (!(err instanceof AmiqusError)) console.error('Backfill error:', err);
        }
      }
    }

    const fmtDate = (d: string) => new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const completedActions = new Set<string>();
    const progressByAction = new Map<string, { completed_at: string | null; completed_by: string | null }>();
    for (const p of progressResult.data || []) {
      if (p.completed_at) completedActions.add(p.action_id);
      progressByAction.set(p.action_id, p);
    }

    // Look up user names for completion attribution
    const completedByIds = [...new Set((progressResult.data || []).filter(p => p.completed_by).map(p => p.completed_by!))];
    const progressUserNames: Record<string, string> = {};
    if (completedByIds.length > 0) {
      const { data: profiles } = await supabase.from('user_profiles').select('user_id, full_name').in('user_id', completedByIds);
      if (profiles) {
        for (const p of profiles) {
          if (p.full_name) progressUserNames[p.user_id] = p.full_name;
        }
      }
    }

    type EvidenceRow = { evidence_type: string; source: string; label: string; verified_at: string | null; data: unknown; notes: string | null; action_id: string | null };
    const evidenceByAction = new Map<string, EvidenceRow[]>();
    const declarations: DeclarationData[] = [];
    let latestChData: unknown = null;
    let beneficialOwnerNames: string[] = [];
    for (const e of evidenceResult.data || []) {
      if (e.action_id) {
        const list = evidenceByAction.get(e.action_id) || [];
        list.push(e);
        evidenceByAction.set(e.action_id, list);
      }
      if (e.evidence_type === 'companies_house' && e.data) {
        latestChData = e.data;
      }
      if (isBeneficialOwnerListRow(e) && e.data && typeof e.data === 'object') {
        const namesField = (e.data as { names?: unknown }).names;
        if (Array.isArray(namesField)) {
          beneficialOwnerNames = namesField.filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
        }
      }
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

    const amiqusByAction = new Map<string, { amiqus_record_id: number | null; amiqus_client_id: number | null; verified_at: string | null }>();
    for (const v of amiqusResult.data || []) {
      if (v.action_id) amiqusByAction.set(v.action_id, v);
    }

    // Build CDD items with structured evidence
    const cddItems: CddItemSummary[] = (outputSnapshot.mandatoryActions || []).map((action) => {
      const completed = completedActions.has(action.actionId);
      const actionEvidence = evidenceByAction.get(action.actionId) || [];
      const amiqus = amiqusByAction.get(action.actionId);
      const progress = progressByAction.get(action.actionId);

      const evidenceItems: CddEvidenceItem[] = [];
      let amiqusUrl: string | null = null;

      if (amiqus?.amiqus_record_id) {
        const hasCarryForward = actionEvidence.some(ev => ev.label === 'Prior identity verification confirmed still valid');
        const carryForwardEvidence = actionEvidence.find(ev => ev.label === 'Prior identity verification confirmed still valid');
        amiqusUrl = amiqus.amiqus_client_id ? `https://id.amiqus.co/clients/${amiqus.amiqus_client_id}` : 'https://id.amiqus.co/';
        let label = 'Identity verified electronically';
        if (hasCarryForward) {
          const verifiedDate = amiqus.verified_at ? fmtDate(amiqus.verified_at) : 'unknown';
          const confirmedDate = carryForwardEvidence?.verified_at ? fmtDate(carryForwardEvidence.verified_at) : null;
          label = `Identity verified electronically — existing Amiqus verification dated ${verifiedDate} was confirmed as still valid for this assessment${confirmedDate ? ` on ${confirmedDate}` : ''}`;
        }
        evidenceItems.push({
          type: 'amiqus', label,
          date: !hasCarryForward && amiqus.verified_at ? `Verified ${fmtDate(amiqus.verified_at)}` : undefined,
          url: amiqusUrl,
        });
      }

      for (const ev of actionEvidence) {
        if (amiqus && ev.label === 'Prior identity verification confirmed still valid') continue;
        if (isBeneficialOwnerListRow(ev)) continue; // BO list is rendered under requirement, not as evidence
        const evType = ev.evidence_type === 'file_upload' ? 'file' as const
          : ev.evidence_type === 'companies_house' ? 'ch' as const
          : (ev.evidence_type === 'sow_declaration' || ev.evidence_type === 'sof_declaration') ? 'declaration' as const
          : 'note' as const;
        evidenceItems.push({
          type: evType,
          label: ev.label || ev.source || ev.evidence_type,
          date: ev.verified_at ? `Verified ${fmtDate(ev.verified_at)}` : undefined,
          notes: ev.notes || undefined,
          chReport: ev.evidence_type === 'companies_house' && ev.data
            ? parseCHReport(ev.data) ?? undefined
            : undefined,
        });
      }

      let personList: { names: string[] } | null = null;
      if (action.actionId === 'identify_and_verify_directors' && directorNames.length > 0) {
        personList = { names: directorNames };
      } else if (action.actionId === 'identify_and_verify_beneficial_owners' && beneficialOwnerNames.length > 0) {
        personList = { names: beneficialOwnerNames };
      }

      const completedDate = progress?.completed_at ? fmtDate(progress.completed_at) : null;
      const completedBy = progress?.completed_by ? progressUserNames[progress.completed_by] || null : null;

      return {
        description: action.displayText || action.description, category: action.category, completed,
        completedDate, completedBy, evidenceItems,
        evidenceSummary: evidenceItems.length === 0 && completed ? 'Confirmed by user' : null,
        amiqusUrl,
        personList,
      };
    });

    // Build form questions
    const inputSnapshot = assessment.input_snapshot as unknown as {
      clientType?: string;
      formAnswers?: Record<string, string | string[]>;
    };
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

      const clientTypeKey = isIndividual ? 'individual' : 'corporate';
      const eddTriggerFields = new Set<string>();
      const eddTriggersArr = ((outputSnapshot as unknown as { eddTriggers?: Array<{ triggerId?: string }> }).eddTriggers || []);
      const firedTriggerIds = new Set<string>(eddTriggersArr.map(t => t.triggerId || '').filter(Boolean));
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

      function isFieldVisible(field: Record<string, unknown>): boolean {
        const showIf = field.show_if as Record<string, string | string[]> | undefined;
        if (!showIf) return true;
        for (const [depId, requiredValue] of Object.entries(showIf)) {
          const actual = inputSnapshot.formAnswers?.[depId];
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
            const answer = inputSnapshot.formAnswers?.[fid];
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

    // Look up user names
    let createdByName: string | null = null;
    let finalisedByName: string | null = null;
    const userIds = [assessment.created_by, assessment.finalised_by].filter(Boolean) as string[];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('user_profiles').select('user_id, full_name').in('user_id', userIds);
      if (profiles) {
        for (const p of profiles) {
          if (p.full_name && p.user_id === assessment.created_by) createdByName = p.full_name;
          if (p.full_name && p.user_id === assessment.finalised_by) finalisedByName = p.full_name;
        }
      }
    }

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
      completedCount: cddItems.filter(i => i.completed).length,
      totalCount: cddItems.length,
      eddTriggers: outputSnapshot.eddTriggers,
      warnings: outputSnapshot.warnings?.map(w => w.message),
      declarations,
      riskFactors: (outputSnapshot.riskFactors || []) as RiskFactorSummary[],
      rationale: outputSnapshot.rationale || [],
      formQuestions,
      createdByName,
      finalisedByName,
      clioComplianceFolderUrl: matter.clio_matter_id
        ? `${getClioBaseUrl()}/nc/#/matters/${matter.clio_matter_id}/documents`
        : null,
    });

    return {
      success: true,
      pdfBase64: fileBuffer.toString('base64'),
      fileName: `AML-Assessment-${assessment.reference}.pdf`,
    };
  } catch (err) {
    console.error('Error in exportAssessmentPdf:', err);
    return { success: false, error: 'Failed to generate PDF' };
  }
}
