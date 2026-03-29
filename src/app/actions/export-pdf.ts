'use server';

/**
 * Server action to generate an assessment PDF for download.
 * Uses the same generateAssessmentPdf() as Clio Drive, ensuring identical output.
 */

import { createClient } from '@/lib/supabase/server';
import { generateAssessmentPdf } from '@/lib/clio/drive-pdf';
import type { CddItemSummary, DeclarationData, RiskFactorSummary } from '@/lib/clio/drive-pdf';

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
      .select('reference, client_id')
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
      mandatoryActions?: Array<{ actionId: string; description: string; category: string }>;
      eddTriggers?: Array<{ description: string }>;
      warnings?: Array<{ message: string }>;
      riskFactors?: Array<{ factorId: string; factorLabel: string; formFieldId: string; selectedAnswer: string | string[]; score: number; rationale: string }>;
      rationale?: string[];
    };

    // Fetch evidence, Amiqus, and progress
    const [evidenceResult, amiqusResult, progressResult] = await Promise.all([
      supabase.from('assessment_evidence').select('action_id, evidence_type, source, label, verified_at, data').eq('assessment_id', assessmentId),
      supabase.from('amiqus_verifications').select('action_id, amiqus_record_id, amiqus_client_id, status, verified_at').eq('assessment_id', assessmentId).eq('status', 'complete'),
      supabase.from('cdd_item_progress').select('action_id, completed_at').eq('assessment_id', assessmentId),
    ]);

    const completedActions = new Set<string>();
    for (const p of progressResult.data || []) {
      if (p.completed_at) completedActions.add(p.action_id);
    }

    type EvidenceRow = { evidence_type: string; source: string; label: string; verified_at: string | null; data: unknown };
    const evidenceByAction = new Map<string, EvidenceRow[]>();
    const declarations: DeclarationData[] = [];
    for (const e of evidenceResult.data || []) {
      if (e.action_id) {
        const list = evidenceByAction.get(e.action_id) || [];
        list.push(e);
        evidenceByAction.set(e.action_id, list);
      }
      if ((e.evidence_type === 'sow_declaration' || e.evidence_type === 'sof_declaration') && e.data) {
        declarations.push({
          type: e.evidence_type as 'sow_declaration' | 'sof_declaration',
          actionId: e.action_id,
          data: e.data as Record<string, string | string[]>,
        });
      }
    }

    const amiqusByAction = new Map<string, { amiqus_record_id: number | null; amiqus_client_id: number | null; verified_at: string | null }>();
    for (const v of amiqusResult.data || []) {
      if (v.action_id) amiqusByAction.set(v.action_id, v);
    }

    // Build CDD items
    const cddItems: CddItemSummary[] = (outputSnapshot.mandatoryActions || []).map((action) => {
      const completed = completedActions.has(action.actionId);
      const actionEvidence = evidenceByAction.get(action.actionId) || [];
      const amiqus = amiqusByAction.get(action.actionId);

      let evidenceSummary: string | null = null;
      let amiqusUrl: string | null = null;

      if (amiqus?.amiqus_record_id) {
        const dateStr = amiqus.verified_at
          ? new Date(amiqus.verified_at + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
          : '';
        evidenceSummary = `Identity verified electronically${dateStr ? ` on ${dateStr}` : ''}`;
        amiqusUrl = amiqus.amiqus_client_id
          ? `https://id.amiqus.co/clients/${amiqus.amiqus_client_id}`
          : 'https://id.amiqus.co/';
      } else if (actionEvidence.length > 0) {
        const summaries = actionEvidence.map((ev) => {
          const datePart = ev.verified_at
            ? ` (${new Date(ev.verified_at + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})`
            : '';
          return `${ev.source || ev.evidence_type}${datePart}`;
        });
        evidenceSummary = summaries.join('; ');
      }

      return { description: action.description, category: action.category, completed, evidenceSummary, amiqusUrl };
    });

    // Build form questions
    const inputSnapshot = assessment.input_snapshot as unknown as {
      clientType?: string;
      formAnswers?: Record<string, string | string[]>;
    };
    let formQuestions: Array<{ type: 'section' | 'question'; label: string; answer?: string; score?: number }> = [];
    if (inputSnapshot?.formAnswers) {
      const isIndividual = inputSnapshot.clientType === 'individual';
      const formConfig = isIndividual
        ? (await import('@/config/eventus/forms/CMLRA_individual.json')).default
        : (await import('@/config/eventus/forms/CMLRA_corporate.json')).default;

      const riskFactorByField = new Map<string, { score: number }>();
      for (const rf of (outputSnapshot.riskFactors || []) as unknown as Array<{ formFieldId: string; score: number }>) {
        if (rf.formFieldId) riskFactorByField.set(rf.formFieldId, rf);
      }

      const fieldMap = new Map<string, Record<string, unknown>>();
      for (const f of formConfig.fields) {
        fieldMap.set(f.id, f);
      }

      function walkFields(fieldIds: string[]) {
        for (const fid of fieldIds) {
          const field = fieldMap.get(fid);
          if (!field) continue;
          if (field.type === 'section') {
            if (field.label) formQuestions.push({ type: 'section', label: field.label as string });
            if (field.fields) walkFields(field.fields as string[]);
          } else if (field.type !== 'rich_text') {
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
