/**
 * Determination Module
 *
 * Renders formal risk determination documents from assessment records.
 * Deterministic: same input always produces same output.
 */

export { renderDetermination } from './renderDetermination';
export type { RenderDeterminationOptions } from './renderDetermination';
export {
  collectPolicyReferences,
  RISK_LEVEL_REFERENCES,
  CATEGORY_REFERENCES,
  AUTOMATIC_OUTCOME_REFERENCES,
  EDD_TRIGGER_REFERENCES,
  THRESHOLD_AUTHORITY,
  SCORING_MODEL_AUTHORITY,
} from './policy-references';
export {
  JURISDICTION_CONFIG,
  getJurisdictionConfig,
} from './jurisdiction';
export type { JurisdictionConfig } from './jurisdiction';
export type {
  DeterminationOutput,
  DeterminationSection,
  AssessmentRecord,
  InputSnapshot,
  OutputSnapshot,
  RiskFactorSnapshot,
  MandatoryActionSnapshot,
  AutomaticOutcomeSnapshot,
  EDDTriggerSnapshot,
  AssessmentWarningSnapshot,
} from './types';
