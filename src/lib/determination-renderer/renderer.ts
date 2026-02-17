/**
 * Deterministic Determination Renderer
 *
 * Produces standardised textual determinations from assessment outputs.
 * Same input always produces same output - no AI, no randomness.
 */

import type { AssessmentOutput, MandatoryAction, RiskFactorResult } from '@/lib/rules-engine/types';
import type { DeterminationInput, DeterminationOutput } from './types';
import {
  collectPolicyReferences,
  SCORING_MODEL_AUTHORITY,
  THRESHOLD_AUTHORITY,
} from './policy-references';

/**
 * Risk level descriptors for human-readable output
 */
const RISK_LEVEL_DESCRIPTORS: Record<string, string> = {
  LOW: 'LOW RISK',
  MEDIUM: 'MEDIUM RISK',
  HIGH: 'HIGH RISK',
};

/**
 * Threshold descriptions for each risk level
 */
const THRESHOLD_DESCRIPTIONS: Record<string, string> = {
  LOW: 'Score 0-4',
  MEDIUM: 'Score 5-8',
  HIGH: 'Score 9 or above',
};

/**
 * Category labels for display
 */
const CATEGORY_LABELS: Record<string, string> = {
  cdd: 'Customer Due Diligence',
  edd: 'Enhanced Due Diligence',
  sow: 'Source of Wealth',
  sof: 'Source of Funds',
  monitoring: 'Ongoing Monitoring',
};

/**
 * Format a date string consistently
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toISOString().split('T')[0];
}

/**
 * Generate the heading section
 */
function renderHeading(input: DeterminationInput): string {
  const lines = [
    '══════════════════════════════════════════════════════════════════',
    'AML RISK ASSESSMENT DETERMINATION',
    '══════════════════════════════════════════════════════════════════',
    '',
    `Client:           ${input.clientName}`,
    `Matter Reference: ${input.matterReference}`,
    `Client Type:      ${input.clientType === 'individual' ? 'Individual' : 'Corporate Entity'}`,
    `Assessment Date:  ${formatTimestamp(input.output.timestamp)}`,
    '',
  ];
  return lines.join('\n');
}

/**
 * Generate the risk level statement section
 */
function renderRiskStatement(output: AssessmentOutput): string {
  const riskDescriptor = RISK_LEVEL_DESCRIPTORS[output.riskLevel] || output.riskLevel;
  const thresholdDesc = THRESHOLD_DESCRIPTIONS[output.riskLevel] || '';

  const lines = [
    '──────────────────────────────────────────────────────────────────',
    'RISK DETERMINATION',
    '──────────────────────────────────────────────────────────────────',
    '',
    `Risk Level:  ${riskDescriptor}`,
    `Score:       ${output.score} (${thresholdDesc})`,
    `Authority:   ${THRESHOLD_AUTHORITY}`,
    '',
  ];

  // Add automatic outcome if triggered
  if (output.automaticOutcome) {
    lines.push('AUTOMATIC OUTCOME TRIGGERED:');
    lines.push(`  ${output.automaticOutcome.outcomeId}`);
    lines.push(`  ${output.automaticOutcome.description}`);
    lines.push(`  Trigger: ${output.automaticOutcome.triggeredBy}`);
    lines.push('');
  }

  // Add contributing risk factors
  const contributingFactors = output.riskFactors.filter((f) => f.score > 0);
  if (contributingFactors.length > 0) {
    lines.push('Contributing Risk Factors:');
    // Sort factors by score (descending) then by factorId for determinism
    const sortedFactors = [...contributingFactors].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.factorId.localeCompare(b.factorId);
    });
    sortedFactors.forEach((factor) => {
      lines.push(`  - ${factor.factorLabel}: +${factor.score}`);
      lines.push(`    Answer: ${formatAnswer(factor.selectedAnswer)}`);
    });
    lines.push('');
  }

  return lines.join('\n');
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
 * Generate the mandatory actions section
 */
function renderMandatoryActions(output: AssessmentOutput): string {
  const lines = [
    '──────────────────────────────────────────────────────────────────',
    'MANDATORY ACTIONS',
    '──────────────────────────────────────────────────────────────────',
    '',
  ];

  if (output.mandatoryActions.length === 0) {
    lines.push('No mandatory actions required.');
    lines.push('');
    return lines.join('\n');
  }

  // Group actions by category
  const actionsByCategory = groupActionsByCategory(output.mandatoryActions);

  // Sort categories for deterministic output
  const sortedCategories = Object.keys(actionsByCategory).sort();

  for (const category of sortedCategories) {
    const categoryLabel = CATEGORY_LABELS[category] || category.toUpperCase();
    lines.push(`[${categoryLabel}]`);

    // Sort actions within category for determinism
    const sortedActions = actionsByCategory[category].sort((a, b) =>
      a.actionId.localeCompare(b.actionId)
    );

    sortedActions.forEach((action, index) => {
      lines.push(`  ${index + 1}. ${action.actionName}`);
      if (action.description) {
        lines.push(`     ${action.description}`);
      }
      lines.push(`     Priority: ${action.priority.toUpperCase()}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Group actions by category
 */
function groupActionsByCategory(
  actions: MandatoryAction[]
): Record<string, MandatoryAction[]> {
  const grouped: Record<string, MandatoryAction[]> = {};

  for (const action of actions) {
    if (!grouped[action.category]) {
      grouped[action.category] = [];
    }
    grouped[action.category].push(action);
  }

  return grouped;
}

/**
 * Generate the policy references section
 */
function renderPolicyReferences(
  output: AssessmentOutput
): string {
  // Collect unique categories from mandatory actions
  const categories = [...new Set(output.mandatoryActions.map((a) => a.category))];

  // Collect all policy references
  const references = collectPolicyReferences(
    output.riskLevel,
    categories,
    output.automaticOutcome?.outcomeId || null
  );

  const lines = [
    '──────────────────────────────────────────────────────────────────',
    'POLICY REFERENCES',
    '──────────────────────────────────────────────────────────────────',
    '',
    `Scoring Model: ${SCORING_MODEL_AUTHORITY}`,
    '',
    'Applicable Policy Sections:',
  ];

  references.forEach((ref) => {
    lines.push(`  - ${ref}`);
  });

  lines.push('');
  lines.push('──────────────────────────────────────────────────────────────────');
  lines.push('END OF DETERMINATION');
  lines.push('──────────────────────────────────────────────────────────────────');

  return lines.join('\n');
}

/**
 * Render a complete determination from assessment output
 *
 * This function is deterministic - same input always produces same output.
 * No AI, no randomness, no external dependencies.
 *
 * @param input - The determination input containing assessment output and metadata
 * @returns The rendered determination with text and structured sections
 */
export function renderDetermination(input: DeterminationInput): DeterminationOutput {
  const heading = renderHeading(input);
  const riskStatement = renderRiskStatement(input.output);
  const mandatoryActionsText = renderMandatoryActions(input.output);
  const policyReferences = renderPolicyReferences(input.output);

  const text = [heading, riskStatement, mandatoryActionsText, policyReferences].join('\n');

  return {
    text,
    sections: {
      heading,
      riskStatement,
      mandatoryActionsText,
      policyReferences,
    },
  };
}
