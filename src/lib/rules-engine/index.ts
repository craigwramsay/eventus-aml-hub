/**
 * Eventus AML Rules Engine
 *
 * Source-driven assessment engine that loads all rules from config.
 * No hardcoded rules - everything derived from:
 * - risk_scoring_v3_8.json
 * - cdd_ruleset.json
 * - CMLRA form configs
 */

import type {
  AssessmentInput,
  AssessmentOutput,
  ClientType,
  FormAnswers,
  RiskLevel,
} from './types';

import { getRiskScoringConfig, getCDDRulesetConfig } from './config-loader';
import { calculateScore, generateRationale, checkEDDTriggers } from './scorer';
import { getMandatoryActions } from './requirements';

// Re-export types
export type {
  AssessmentInput,
  AssessmentOutput,
  ClientType,
  FormAnswers,
  RiskLevel,
  RiskFactorResult,
  AutomaticOutcomeResult,
  MandatoryAction,
  EDDTriggerResult,
  AssessmentWarning,
} from './types';

// Re-export config loader
export { loadConfig, clearConfigCache } from './config-loader';

// Re-export scorer utilities
export { scoreToRiskLevel } from './scorer';

/**
 * Run AML risk assessment on form answers
 *
 * @param input - Assessment input with client type and form answers
 * @returns Assessment output with score, risk level, rationale, and mandatory actions
 *
 * @example
 * ```ts
 * const result = runAssessment({
 *   clientType: 'individual',
 *   formAnswers: {
 *     '3': 'New client',
 *     '16': 'UK',
 *     '20': 'No',
 *     '24': 'Yes',
 *     '28': 'Ongoing',
 *     '32': 'No',
 *     '38': 'Client',
 *     '42': 'No',
 *     '47': 'No',
 *     '48': 'No',
 *   }
 * });
 * console.log(result.riskLevel); // 'LOW'
 * ```
 */
export function runAssessment(input: AssessmentInput): AssessmentOutput {
  const { clientType, formAnswers } = input;

  // Load configs
  const riskScoringConfig = getRiskScoringConfig();
  const cddRulesetConfig = getCDDRulesetConfig();

  // Calculate score and risk factors
  const { score, riskLevel, riskFactors, automaticOutcome } = calculateScore(
    clientType,
    formAnswers,
    riskScoringConfig
  );

  // Check for EDD triggers (does not change risk level)
  const eddTriggers = checkEDDTriggers(
    riskScoringConfig,
    clientType,
    formAnswers
  );

  // Generate rationale
  const rationale = generateRationale(
    score,
    riskLevel,
    riskFactors,
    automaticOutcome,
    riskScoringConfig
  );

  // Get mandatory actions (pass EDD triggers for action injection)
  const { actions: mandatoryActions, warnings } = getMandatoryActions(
    clientType,
    riskLevel,
    cddRulesetConfig,
    formAnswers,
    eddTriggers
  );

  return {
    score,
    riskLevel,
    automaticOutcome,
    riskFactors,
    rationale,
    mandatoryActions,
    eddTriggers,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Convenience function to run assessment with just form answers
 * Infers client type from form structure or requires explicit type
 */
export function assessIndividual(formAnswers: FormAnswers): AssessmentOutput {
  return runAssessment({ clientType: 'individual', formAnswers });
}

/**
 * Convenience function to run corporate assessment
 */
export function assessCorporate(formAnswers: FormAnswers): AssessmentOutput {
  return runAssessment({ clientType: 'corporate', formAnswers });
}
