/**
 * Types for the Determination Renderer
 */

import type { AssessmentOutput, ClientType } from '@/lib/rules-engine/types';

/** Input for rendering a determination */
export interface DeterminationInput {
  /** The assessment output snapshot */
  output: AssessmentOutput;
  /** Client type */
  clientType: ClientType;
  /** Client name for display */
  clientName: string;
  /** Matter reference for display */
  matterReference: string;
}

/** Rendered determination output */
export interface DeterminationOutput {
  /** The complete determination text */
  text: string;
  /** Structured sections for programmatic access */
  sections: {
    heading: string;
    riskStatement: string;
    mandatoryActionsText: string;
    policyReferences: string;
  };
}

/** Policy reference mapping */
export interface PolicyReference {
  id: string;
  section: string;
  description: string;
}
