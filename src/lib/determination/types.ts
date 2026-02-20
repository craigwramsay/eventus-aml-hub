/**
 * Determination Renderer Types
 */

import type { RiskLevel } from '@/lib/supabase/types';

/** Section of the determination */
export interface DeterminationSection {
  title: string;
  body: string;
}

/** Output from renderDetermination */
export interface DeterminationOutput {
  /** Complete determination text */
  determinationText: string;
  /** Structured sections */
  sections: DeterminationSection[];
}

/** Input snapshot structure (from assessment.input_snapshot) */
export interface InputSnapshot {
  clientType: 'individual' | 'corporate';
  formAnswers: Record<string, string | string[]>;
  formVersion?: string | null;
  assessedAt: string;
  jurisdiction?: 'scotland' | 'england_and_wales';
}

/** Risk factor from output snapshot */
export interface RiskFactorSnapshot {
  factorId: string;
  factorLabel: string;
  formFieldId: string;
  selectedAnswer: string | string[];
  score: number;
  rationale: string;
}

/** Mandatory action from output snapshot */
export interface MandatoryActionSnapshot {
  actionId: string;
  actionName: string;
  description: string;
  displayText?: string;
  category: 'cdd' | 'edd' | 'sow' | 'sof' | 'monitoring' | 'escalation';
  priority: 'required' | 'recommended';
  evidenceTypes?: string[];
}

/** Evidence record for determination rendering */
export interface EvidenceForDetermination {
  evidence_type: string;
  label: string;
  source: string | null;
  data: unknown;
  created_at: string;
}

/** EDD trigger from output snapshot */
export interface EDDTriggerSnapshot {
  triggerId: string;
  description: string;
  authority: string;
  triggeredBy: string;
}

/** Assessment warning from output snapshot */
export interface AssessmentWarningSnapshot {
  warningId: string;
  message: string;
  authority: string;
}

/** Automatic outcome from output snapshot */
export interface AutomaticOutcomeSnapshot {
  outcomeId: string;
  description: string;
  triggeredBy: string;
}

/** Output snapshot structure (from assessment.output_snapshot) */
export interface OutputSnapshot {
  score: number;
  riskLevel: RiskLevel;
  automaticOutcome: AutomaticOutcomeSnapshot | null;
  riskFactors: RiskFactorSnapshot[];
  rationale: string[];
  mandatoryActions: MandatoryActionSnapshot[];
  eddTriggers?: EDDTriggerSnapshot[];
  warnings?: AssessmentWarningSnapshot[];
  timestamp: string;
}

/** Assessment record input for determination rendering */
export interface AssessmentRecord {
  id: string;
  matter_id: string;
  input_snapshot: InputSnapshot;
  output_snapshot: OutputSnapshot;
  risk_level: RiskLevel;
  score: number;
  created_at: string;
  finalised_at: string | null;
}
