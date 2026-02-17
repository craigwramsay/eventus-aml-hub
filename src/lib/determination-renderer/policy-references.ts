/**
 * Policy Reference Mappings
 *
 * Maps risk levels, CDD categories, and outcomes to Eventus AML Policy section IDs.
 * Derived from Eventus AML PCPs and PWRA source documents.
 */

import type { RiskLevel } from '@/lib/rules-engine/types';

/** Policy references by risk level */
export const RISK_LEVEL_REFERENCES: Record<RiskLevel, string[]> = {
  LOW: ['PCP §4.6', 'PCP §7', 'MLR 2017 reg. 28'],
  MEDIUM: ['PCP §4.6', 'PCP §8', 'PCP §11', 'MLR 2017 reg. 28'],
  HIGH: ['PCP §4.6', 'PCP §15', 'PCP §20', 'MLR 2017 regs. 33, 35'],
};

/** Policy references by CDD action category */
export const CATEGORY_REFERENCES: Record<string, string[]> = {
  cdd: ['PCP §7', 'MLR 2017 reg. 28(2)'],
  edd: ['PCP §15', 'PCP §20', 'MLR 2017 reg. 33'],
  sow: ['PCP §8', 'PCP §11.2', 'LSAG 2025 §5.6'],
  sof: ['PCP §8', 'PCP §11.3', 'LSAG 2025 §5.6'],
  monitoring: ['PCP §17', 'MLR 2017 reg. 28(11)'],
};

/** Policy references for automatic outcomes */
export const AUTOMATIC_OUTCOME_REFERENCES: Record<string, string[]> = {
  HIGH_RISK_EDD_REQUIRED: ['PCP §15', 'MLR 2017 reg. 35'],
  OUT_OF_APPETITE: ['PWRA §2.4.3', 'PCP §3.2'],
};

/** Threshold authority reference */
export const THRESHOLD_AUTHORITY = 'PCP §4.6';

/** Scoring model authority reference */
export const SCORING_MODEL_AUTHORITY = 'Eventus Internal Risk Scoring Model v3.7';

/**
 * Collect all unique policy references for a determination
 */
export function collectPolicyReferences(
  riskLevel: RiskLevel,
  categories: string[],
  automaticOutcomeId: string | null
): string[] {
  const refs = new Set<string>();

  // Add threshold authority
  refs.add(THRESHOLD_AUTHORITY);

  // Add risk level references
  const riskRefs = RISK_LEVEL_REFERENCES[riskLevel] || [];
  riskRefs.forEach((ref) => refs.add(ref));

  // Add category references
  categories.forEach((cat) => {
    const catRefs = CATEGORY_REFERENCES[cat] || [];
    catRefs.forEach((ref) => refs.add(ref));
  });

  // Add automatic outcome references
  if (automaticOutcomeId) {
    const outcomeRefs = AUTOMATIC_OUTCOME_REFERENCES[automaticOutcomeId] || [];
    outcomeRefs.forEach((ref) => refs.add(ref));
  }

  // Sort references for deterministic output
  return Array.from(refs).sort();
}
