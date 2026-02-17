/**
 * Determination Module
 *
 * Renders formal risk determination documents from assessment records.
 * Deterministic: same input always produces same output.
 */

export { renderDetermination } from './renderDetermination';
export type {
  DeterminationOutput,
  DeterminationSection,
  AssessmentRecord,
  InputSnapshot,
  OutputSnapshot,
  RiskFactorSnapshot,
  MandatoryActionSnapshot,
  AutomaticOutcomeSnapshot,
} from './types';
