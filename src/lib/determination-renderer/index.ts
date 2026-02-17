/**
 * Determination Renderer
 *
 * Produces standardised textual determinations from assessment outputs.
 * Deterministic: same input always produces same output.
 */

export { renderDetermination } from './renderer';
export type { DeterminationInput, DeterminationOutput } from './types';
export {
  collectPolicyReferences,
  RISK_LEVEL_REFERENCES,
  CATEGORY_REFERENCES,
  AUTOMATIC_OUTCOME_REFERENCES,
} from './policy-references';
