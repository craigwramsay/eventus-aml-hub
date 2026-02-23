/**
 * Deterministic Risk Determination Renderer
 *
 * Renders a formal determination document from stored assessment snapshots.
 * - Does NOT recompute scoring
 * - Does NOT call any LLM
 * - Same input ALWAYS produces same output
 * - No conditional language (no "if", "consider", "where required", "may")
 */

import type {
  AssessmentRecord,
  DeterminationOutput,
  DeterminationSection,
  RiskFactorSnapshot,
  MandatoryActionSnapshot,
  EDDTriggerSnapshot,
  AssessmentWarningSnapshot,
  EvidenceForDetermination,
} from './types';
import {
  collectPolicyReferences,
  SCORING_MODEL_AUTHORITY,
} from './policy-references';
import { getJurisdictionConfig } from './jurisdiction';
import { getRiskScoringConfig } from '@/lib/rules-engine/config-loader';
import type { Jurisdiction } from '@/lib/supabase/types';

/** Category display labels */
const CATEGORY_LABELS: Record<string, string> = {
  cdd: 'Customer Due Diligence (CDD)',
  edd: 'Enhanced Due Diligence (EDD)',
  sow: 'Source of Wealth (SoW)',
  sof: 'Source of Funds (SoF)',
  monitoring: 'Ongoing Monitoring',
  escalation: 'Escalation',
};

/** Category sort order */
const CATEGORY_ORDER: string[] = ['cdd', 'sow', 'sof', 'monitoring', 'escalation'];

/** Risk level display text — title case for determination */
const RISK_LEVEL_TEXT: Record<string, string> = {
  LOW: 'Low Risk',
  MEDIUM: 'Medium Risk',
  HIGH: 'High Risk',
};

/**
 * Format threshold text from scoring config.
 * e.g. { min: 0, max: 4 } → "0-4", { min: 9, max: null } → "9+"
 */
function getThresholdText(riskLevel: string): string {
  const config = getRiskScoringConfig();
  const threshold = config.thresholds[riskLevel as keyof typeof config.thresholds];
  if (!threshold) return '';
  if (threshold.max === null) return `${threshold.min}+`;
  return `${threshold.min}-${threshold.max}`;
}

/**
 * Format a timestamp to a fixed format: YYYY-MM-DD HH:MM UTC
 * Uses UTC to ensure determinism across timezones
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

/**
 * Format client type for display
 */
function formatClientType(clientType: 'individual' | 'corporate'): string {
  return clientType === 'individual' ? 'Individual' : 'Non-individual';
}

/**
 * Format an answer value for display
 */
function formatAnswer(answer: string | string[]): string {
  if (Array.isArray(answer)) {
    return answer.join(', ');
  }
  return answer;
}

/**
 * Render the heading section
 */
function renderHeading(): DeterminationSection {
  return {
    title: 'HEADING',
    body: 'CLIENT & MATTER LEVEL RISK ASSESSMENT DETERMINATION',
  };
}

/**
 * Render the assessment details section
 */
function renderDetails(assessment: AssessmentRecord, jurisdiction?: Jurisdiction): DeterminationSection {
  const lines: string[] = [];

  lines.push(`Matter Reference: ${assessment.matter_id}`);
  lines.push(`Assessment Date: ${formatTimestamp(assessment.created_at)}`);

  if (assessment.finalised_at) {
    lines.push(`Finalised Date: ${formatTimestamp(assessment.finalised_at)}`);
    lines.push('Status: FINALISED');
  } else {
    lines.push('Status: DRAFT');
  }

  lines.push(`Client Type: ${formatClientType(assessment.input_snapshot.clientType)}`);

  if (jurisdiction) {
    const config = getJurisdictionConfig(jurisdiction);
    lines.push(`Jurisdiction: ${config.jurisdictionLabel}`);
    lines.push(`Regulator: ${config.regulator}`);
  }

  return {
    title: 'ASSESSMENT DETAILS',
    body: lines.join('\n'),
  };
}

/**
 * Render the risk determination section
 */
function renderRiskDetermination(assessment: AssessmentRecord): DeterminationSection {
  const { output_snapshot } = assessment;
  const riskText = RISK_LEVEL_TEXT[output_snapshot.riskLevel] || output_snapshot.riskLevel;
  const thresholdText = getThresholdText(output_snapshot.riskLevel);

  const lines: string[] = [];

  lines.push(`Total Score: ${output_snapshot.score}`);
  lines.push(`Risk Level: ${riskText}`);
  lines.push(`Threshold: ${thresholdText}`);

  if (output_snapshot.automaticOutcome) {
    lines.push('');
    lines.push('AUTOMATIC OUTCOME APPLIED:');
    lines.push(`- ${output_snapshot.automaticOutcome.outcomeId}`);
    lines.push(`- ${output_snapshot.automaticOutcome.description}`);
    lines.push(`- Trigger: ${output_snapshot.automaticOutcome.triggeredBy}`);
  }

  return {
    title: 'RISK DETERMINATION',
    body: lines.join('\n'),
  };
}

/**
 * Group actions by category
 */
function groupActionsByCategory(
  actions: MandatoryActionSnapshot[]
): Record<string, MandatoryActionSnapshot[]> {
  const grouped: Record<string, MandatoryActionSnapshot[]> = {};

  for (const action of actions) {
    const category = action.category || 'other';
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(action);
  }

  return grouped;
}

/**
 * Get the display text for an action, preferring displayText over description
 */
function getActionDisplayText(action: MandatoryActionSnapshot): string {
  return action.displayText || action.description;
}

/**
 * Render the CDD requirements section (non-EDD actions, numbered)
 */
function renderCDDRequirements(assessment: AssessmentRecord): DeterminationSection {
  const { output_snapshot } = assessment;
  const { mandatoryActions } = output_snapshot;

  // Separate non-EDD and EDD actions
  const nonEddActions = mandatoryActions.filter((a) => a.category !== 'edd');
  const eddActions = mandatoryActions.filter((a) => a.category === 'edd');

  if (nonEddActions.length === 0 && eddActions.length === 0) {
    return {
      title: 'CDD REQUIREMENTS',
      body: 'No CDD requirements.',
    };
  }

  const grouped = groupActionsByCategory(nonEddActions);

  // Sort categories by defined order
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a);
    const bIndex = CATEGORY_ORDER.indexOf(b);
    const aOrder = aIndex === -1 ? 999 : aIndex;
    const bOrder = bIndex === -1 ? 999 : bIndex;
    return aOrder - bOrder;
  });

  const lines: string[] = [];
  let actionNumber = 0;

  for (const category of sortedCategories) {
    const label = CATEGORY_LABELS[category] || category.toUpperCase();
    lines.push(`[${label}]`);

    // Sort actions within category by actionId for determinism
    const sortedActions = [...grouped[category]].sort((a, b) =>
      a.actionId.localeCompare(b.actionId)
    );

    for (const action of sortedActions) {
      actionNumber++;
      const priorityLabel = action.priority === 'recommended' ? ' [Recommended]' : '';
      lines.push(`${actionNumber}. ${getActionDisplayText(action)}${priorityLabel}`);
      // Show evidence types when no displayText (backward compatibility)
      if (!action.displayText && action.evidenceTypes && action.evidenceTypes.length > 0) {
        lines.push('   Supporting evidence:');
        for (const evidence of action.evidenceTypes) {
          lines.push(`     - ${evidence}`);
        }
      }
    }

    lines.push('');
  }

  // EDD requirements (if present)
  if (eddActions.length > 0) {
    lines.push('[Enhanced Due Diligence (EDD)]');

    const sortedEdd = [...eddActions].sort((a, b) =>
      a.actionId.localeCompare(b.actionId)
    );

    for (const action of sortedEdd) {
      actionNumber++;
      lines.push(`${actionNumber}. ${getActionDisplayText(action)}`);
    }

    lines.push('');
  }

  // Remove trailing empty line
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return {
    title: 'CDD REQUIREMENTS',
    body: lines.join('\n'),
  };
}

/**
 * Render EDD triggers section (if any)
 */
function renderEDDTriggers(assessment: AssessmentRecord): DeterminationSection | null {
  const triggers = assessment.output_snapshot.eddTriggers;
  if (!triggers || triggers.length === 0) {
    return null;
  }

  const lines: string[] = [];
  lines.push('The following Enhanced Due Diligence triggers have been detected:');
  lines.push('');

  for (const trigger of triggers) {
    lines.push(`- ${trigger.description}`);
    lines.push(`  Authority: ${trigger.authority}`);
  }

  lines.push('');
  lines.push('EDD triggers require Enhanced Due Diligence actions regardless of the calculated risk level.');

  return {
    title: 'EDD TRIGGERS',
    body: lines.join('\n'),
  };
}

/**
 * Render warnings section (e.g. entity exclusions requiring MLRO escalation)
 */
function renderWarnings(assessment: AssessmentRecord): DeterminationSection | null {
  const warnings = assessment.output_snapshot.warnings;
  if (!warnings || warnings.length === 0) {
    return null;
  }

  const lines: string[] = [];

  for (const warning of warnings) {
    lines.push(`MLRO ESCALATION REQUIRED: ${warning.message}`);
    lines.push(`Authority: ${warning.authority}`);
    lines.push('');
  }

  // Remove trailing empty line
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return {
    title: 'WARNINGS',
    body: lines.join('\n'),
  };
}

/**
 * Render the verification evidence section
 */
function renderVerificationEvidence(evidence: EvidenceForDetermination[]): DeterminationSection | null {
  if (!evidence || evidence.length === 0) {
    return null;
  }

  const lines: string[] = [];

  for (const item of evidence) {
    const date = formatTimestamp(item.created_at);

    if (item.evidence_type === 'companies_house') {
      const data = item.data as {
        profile?: { company_name?: string; company_status?: string; company_number?: string };
        officers?: Array<unknown>;
      } | null;
      const companyName = data?.profile?.company_name || 'Unknown';
      const companyStatus = data?.profile?.company_status || 'unknown';
      const officerCount = data?.officers?.length || 0;
      lines.push(`- Companies House Report: ${companyName} (${companyStatus}), ${officerCount} active officer(s)`);
      lines.push(`  Looked up: ${date}`);
    } else if (item.evidence_type === 'file_upload') {
      lines.push(`- File: ${item.label}`);
      lines.push(`  Uploaded: ${date}`);
    } else {
      lines.push(`- ${item.label}`);
      lines.push(`  Recorded: ${date}`);
    }
  }

  return {
    title: 'VERIFICATION EVIDENCE',
    body: lines.join('\n'),
  };
}

/**
 * Render the scoring breakdown showing every scoring factor, its answer, and score.
 * Uses the scoring config (not the output snapshot) to enumerate all factors,
 * then looks up answers from input_snapshot.formAnswers and scores from output_snapshot.riskFactors.
 */
function renderScoringBreakdown(assessment: AssessmentRecord): DeterminationSection {
  const { input_snapshot, output_snapshot } = assessment;
  const clientType = input_snapshot.clientType;
  const formAnswers = input_snapshot.formAnswers;
  const config = getRiskScoringConfig();
  const sections = config.scoringFactors[clientType];

  // Build a lookup from factorId to the computed risk factor result
  const riskFactorMap = new Map<string, RiskFactorSnapshot>();
  for (const rf of output_snapshot.riskFactors) {
    riskFactorMap.set(rf.factorId, rf);
  }

  // Column layout matching the 70-char document width
  // Factor (42)  Answer (22)  Score (6, right-aligned)
  const COL_FACTOR = 42;
  const COL_ANSWER = 22;
  const COL_SCORE = 6;
  const TABLE_WIDTH = COL_FACTOR + COL_ANSWER + COL_SCORE;

  const lines: string[] = [];
  lines.push(
    padRight('Factor', COL_FACTOR) +
    padRight('Answer', COL_ANSWER) +
    padLeft('Score', COL_SCORE)
  );
  lines.push('\u2500'.repeat(TABLE_WIDTH));

  let total = 0;

  for (const sectionKey of Object.keys(sections)) {
    const section = sections[sectionKey];

    for (const factor of section.factors) {
      // Skip unscored/context-only factors
      if (factor.scored === false) continue;

      const label = truncate(factor.label, COL_FACTOR - 2);

      // Check if the engine computed this factor
      const computed = riskFactorMap.get(factor.id);

      if (computed) {
        const answerDisplay = truncate(
          formatAnswer(computed.selectedAnswer),
          COL_ANSWER - 2
        );
        const scoreDisplay = computed.score > 0 ? `+${computed.score}` : '0';
        total += computed.score;

        lines.push(
          padRight(label, COL_FACTOR) +
          padRight(answerDisplay, COL_ANSWER) +
          padLeft(scoreDisplay, COL_SCORE)
        );
      } else {
        // Factor not in output — check if form answer exists
        const rawAnswer = formAnswers[factor.formFieldId];

        if (rawAnswer !== undefined && rawAnswer !== '' && !(Array.isArray(rawAnswer) && rawAnswer.length === 0)) {
          const answerDisplay = truncate(formatAnswer(rawAnswer), COL_ANSWER - 2);
          lines.push(
            padRight(label, COL_FACTOR) +
            padRight(answerDisplay, COL_ANSWER) +
            padLeft('0', COL_SCORE)
          );
        } else {
          lines.push(
            padRight(label, COL_FACTOR) +
            padRight('(not applicable)', COL_ANSWER) +
            padLeft('-', COL_SCORE)
          );
        }
      }
    }
  }

  lines.push('\u2500'.repeat(TABLE_WIDTH));
  lines.push(
    padRight('TOTAL', COL_FACTOR + COL_ANSWER) +
    padLeft(String(total), COL_SCORE)
  );

  return {
    title: 'SCORING BREAKDOWN',
    body: lines.join('\n'),
  };
}

/** Pad a string to a fixed width with trailing spaces (left-aligned) */
function padRight(str: string, width: number): string {
  if (str.length >= width) return str.substring(0, width);
  return str + ' '.repeat(width - str.length);
}

/** Pad a string to a fixed width with leading spaces (right-aligned) */
function padLeft(str: string, width: number): string {
  if (str.length >= width) return str.substring(0, width);
  return ' '.repeat(width - str.length) + str;
}

/** Truncate a string with ellipsis if it exceeds maxLen */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '\u2026';
}

/**
 * Render the triggered risk factors section
 */
function renderRiskFactors(assessment: AssessmentRecord): DeterminationSection {
  const { output_snapshot } = assessment;

  // Filter to only factors that contributed to score
  const triggeredFactors = output_snapshot.riskFactors.filter(
    (factor: RiskFactorSnapshot) => factor.score > 0
  );

  if (triggeredFactors.length === 0) {
    return {
      title: 'RISK FACTORS',
      body: 'No risk factors triggered.',
    };
  }

  // Sort by score descending, then by factorId for determinism
  const sortedFactors = [...triggeredFactors].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.factorId.localeCompare(b.factorId);
  });

  const lines: string[] = [];

  for (const factor of sortedFactors) {
    lines.push(`- ${factor.factorLabel} (+${factor.score})`);
    lines.push(`  Answer: ${formatAnswer(factor.selectedAnswer)}`);
  }

  return {
    title: 'RISK FACTORS',
    body: lines.join('\n'),
  };
}

/**
 * Render the policy references section
 */
function renderPolicyReferencesSection(assessment: AssessmentRecord): DeterminationSection {
  const { output_snapshot } = assessment;

  // Collect unique categories from mandatory actions
  const categories = [...new Set(output_snapshot.mandatoryActions.map((a) => a.category))];

  // Collect EDD trigger IDs
  const eddTriggerIds = output_snapshot.eddTriggers?.map((t) => t.triggerId);

  // Collect all policy references
  const references = collectPolicyReferences(
    output_snapshot.riskLevel,
    categories,
    output_snapshot.automaticOutcome?.outcomeId || null,
    eddTriggerIds
  );

  const lines: string[] = [];

  lines.push(`Scoring Model: ${SCORING_MODEL_AUTHORITY}`);
  lines.push('');
  lines.push('Applicable Policy Sections:');

  for (const ref of references) {
    lines.push(`  - ${ref}`);
  }

  return {
    title: 'POLICY REFERENCES',
    body: lines.join('\n'),
  };
}

/**
 * Render the risk appetite statement
 */
function renderRiskAppetite(assessment: AssessmentRecord): DeterminationSection {
  const { output_snapshot } = assessment;

  let statement: string;

  if (output_snapshot.riskLevel === 'HIGH') {
    statement = 'Outside risk appetite unless approved in accordance with AML Policy.';
  } else {
    statement = 'Within risk appetite.';
  }

  return {
    title: 'RISK APPETITE',
    body: statement,
  };
}

export interface RenderDeterminationOptions {
  jurisdiction?: Jurisdiction;
  evidence?: EvidenceForDetermination[];
}

/**
 * Render a complete determination from an assessment record
 *
 * This function is deterministic:
 * - Same input ALWAYS produces same output
 * - Does NOT recompute scoring
 * - Does NOT call any LLM
 * - Uses UTC timestamps for timezone independence
 *
 * Section order:
 * 1. HEADING
 * 2. ASSESSMENT DETAILS
 * 3. RISK DETERMINATION
 * 4. SCORING BREAKDOWN (all factors with answers and scores)
 * 5. CDD REQUIREMENTS (numbered, with EDD sub-section)
 * 6. EDD TRIGGERS (conditional)
 * 7. WARNINGS (conditional)
 * 8. VERIFICATION EVIDENCE (conditional)
 * 9. RISK FACTORS (triggered only, for backward compatibility)
 * 10. POLICY REFERENCES
 * 11. RISK APPETITE
 *
 * @param assessment - The assessment record with snapshots
 * @param options - Optional configuration (jurisdiction, evidence)
 * @returns Determination text and structured sections
 */
export function renderDetermination(
  assessment: AssessmentRecord,
  options?: RenderDeterminationOptions
): DeterminationOutput {
  // Resolve jurisdiction: options parameter takes priority, then snapshot
  const jurisdiction = options?.jurisdiction ?? assessment.input_snapshot.jurisdiction as Jurisdiction | undefined;

  const sections: DeterminationSection[] = [
    renderHeading(),
    renderDetails(assessment, jurisdiction),
    renderRiskDetermination(assessment),
    renderScoringBreakdown(assessment),
    renderCDDRequirements(assessment),
  ];

  // EDD triggers section (only if triggers present)
  const eddTriggersSection = renderEDDTriggers(assessment);
  if (eddTriggersSection) {
    sections.push(eddTriggersSection);
  }

  // Warnings section (only if warnings present)
  const warningsSection = renderWarnings(assessment);
  if (warningsSection) {
    sections.push(warningsSection);
  }

  // Verification evidence (only if evidence provided)
  if (options?.evidence) {
    const evidenceSection = renderVerificationEvidence(options.evidence);
    if (evidenceSection) {
      sections.push(evidenceSection);
    }
  }

  sections.push(renderRiskFactors(assessment));
  sections.push(renderPolicyReferencesSection(assessment));
  sections.push(renderRiskAppetite(assessment));

  // Build full text with section separators
  const textParts: string[] = [];

  for (const section of sections) {
    if (section.title === 'HEADING') {
      // Heading gets special formatting
      textParts.push('\u2550'.repeat(70));
      textParts.push(section.body);
      textParts.push('\u2550'.repeat(70));
    } else {
      textParts.push('');
      textParts.push('\u2500'.repeat(70));
      textParts.push(section.title);
      textParts.push('\u2500'.repeat(70));
      textParts.push(section.body);
    }
  }

  // End marker
  textParts.push('');
  textParts.push('\u2550'.repeat(70));
  textParts.push('END OF DETERMINATION');
  textParts.push('\u2550'.repeat(70));

  return {
    determinationText: textParts.join('\n'),
    sections,
  };
}
