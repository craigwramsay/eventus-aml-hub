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
} from './types';
import {
  collectPolicyReferences,
  SCORING_MODEL_AUTHORITY,
} from './policy-references';
import { getJurisdictionConfig } from './jurisdiction';
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
const CATEGORY_ORDER: string[] = ['cdd', 'edd', 'sow', 'sof', 'monitoring', 'escalation'];

/** Risk level display text */
const RISK_LEVEL_TEXT: Record<string, string> = {
  LOW: 'LOW RISK',
  MEDIUM: 'MEDIUM RISK',
  HIGH: 'HIGH RISK',
};

/** Threshold descriptions */
const THRESHOLD_TEXT: Record<string, string> = {
  LOW: '0-4',
  MEDIUM: '5-8',
  HIGH: '9+',
};

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
  return clientType === 'individual' ? 'Individual' : 'Corporate Entity';
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
  const thresholdText = THRESHOLD_TEXT[output_snapshot.riskLevel] || '';

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
      title: 'TRIGGERED RISK FACTORS',
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
    title: 'TRIGGERED RISK FACTORS',
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
 * Render the mandatory actions section
 */
function renderMandatoryActions(assessment: AssessmentRecord): DeterminationSection {
  const { output_snapshot } = assessment;
  const { mandatoryActions } = output_snapshot;

  if (mandatoryActions.length === 0) {
    return {
      title: 'MANDATORY ACTIONS',
      body: 'No mandatory actions.',
    };
  }

  const grouped = groupActionsByCategory(mandatoryActions);

  // Sort categories by defined order
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a);
    const bIndex = CATEGORY_ORDER.indexOf(b);
    const aOrder = aIndex === -1 ? 999 : aIndex;
    const bOrder = bIndex === -1 ? 999 : bIndex;
    return aOrder - bOrder;
  });

  const lines: string[] = [];

  for (const category of sortedCategories) {
    const label = CATEGORY_LABELS[category] || category.toUpperCase();
    lines.push(`[${label}]`);

    // Sort actions within category by actionId for determinism
    const sortedActions = [...grouped[category]].sort((a, b) =>
      a.actionId.localeCompare(b.actionId)
    );

    for (const action of sortedActions) {
      // Use mandatory language - no conditionals
      const priorityLabel = action.priority === 'recommended' ? ' [Recommended]' : '';
      lines.push(`- ${action.actionName}${priorityLabel}`);
      if (action.description) {
        lines.push(`  ${action.description}`);
      }
      if (action.evidenceTypes && action.evidenceTypes.length > 0) {
        lines.push('  Supporting evidence:');
        for (const evidence of action.evidenceTypes) {
          lines.push(`    - ${evidence}`);
        }
      }
    }

    lines.push('');
  }

  // Remove trailing empty line
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return {
    title: 'MANDATORY ACTIONS',
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
 * @param assessment - The assessment record with snapshots
 * @param options - Optional configuration (jurisdiction)
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
  ];

  // EDD triggers section (only if triggers present)
  const eddTriggersSection = renderEDDTriggers(assessment);
  if (eddTriggersSection) {
    sections.push(eddTriggersSection);
  }

  sections.push(renderRiskFactors(assessment));
  sections.push(renderMandatoryActions(assessment));

  // Warnings section (only if warnings present)
  const warningsSection = renderWarnings(assessment);
  if (warningsSection) {
    sections.push(warningsSection);
  }

  sections.push(renderPolicyReferencesSection(assessment));
  sections.push(renderRiskAppetite(assessment));

  // Build full text with section separators
  const textParts: string[] = [];

  for (const section of sections) {
    if (section.title === 'HEADING') {
      // Heading gets special formatting
      textParts.push('═'.repeat(70));
      textParts.push(section.body);
      textParts.push('═'.repeat(70));
    } else {
      textParts.push('');
      textParts.push('─'.repeat(70));
      textParts.push(section.title);
      textParts.push('─'.repeat(70));
      textParts.push(section.body);
    }
  }

  // End marker
  textParts.push('');
  textParts.push('═'.repeat(70));
  textParts.push('END OF DETERMINATION');
  textParts.push('═'.repeat(70));

  return {
    determinationText: textParts.join('\n'),
    sections,
  };
}
