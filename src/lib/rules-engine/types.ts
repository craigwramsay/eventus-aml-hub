/**
 * Types for the Eventus AML Rules Engine
 * All types derived from source configs - no hardcoded values
 */

/** Risk levels as defined in the scoring config */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/** Client type for assessment */
export type ClientType = 'individual' | 'corporate';

/** Form field answers keyed by field ID */
export type FormAnswers = Record<string, string | string[]>;

/** Input to the assessment engine */
export interface AssessmentInput {
  clientType: ClientType;
  formAnswers: FormAnswers;
}

/** Individual risk factor with score and rationale */
export interface RiskFactorResult {
  factorId: string;
  factorLabel: string;
  formFieldId: string;
  selectedAnswer: string | string[];
  score: number;
  rationale: string;
}

/** Automatic outcome trigger result */
export interface AutomaticOutcomeResult {
  outcomeId: string;
  description: string;
  triggeredBy: string;
}

/** Mandatory action from CDD ruleset */
export interface MandatoryAction {
  actionId: string;
  actionName: string;
  description: string;
  category: 'cdd' | 'edd' | 'sow' | 'sof' | 'monitoring';
  priority: 'required' | 'recommended';
}

/** Output from runAssessment */
export interface AssessmentOutput {
  /** Calculated numeric score */
  score: number;

  /** Risk level based on thresholds */
  riskLevel: RiskLevel;

  /** Whether an automatic outcome was triggered */
  automaticOutcome: AutomaticOutcomeResult | null;

  /** Breakdown of each risk factor */
  riskFactors: RiskFactorResult[];

  /** Human-readable rationale strings */
  rationale: string[];

  /** Mandatory CDD/EDD actions based on risk level and client type */
  mandatoryActions: MandatoryAction[];

  /** Timestamp of assessment */
  timestamp: string;
}

// ============================================
// Config Types (matching JSON structure)
// ============================================

export interface ScoringThreshold {
  min: number;
  max: number | null;
}

export interface ScoringOption {
  answer: string;
  score?: number;
  outcome?: string;
  formAnswer?: string;
  formAnswers?: string[];
  formAnswerPrefix?: string;
}

export interface ScoringFactor {
  id: string;
  formFieldId: string;
  label: string;
  authority?: string;
  scored?: boolean;
  note?: string;
  options?: ScoringOption[];
}

export interface ScoringSection {
  label: string;
  note?: string;
  factors: ScoringFactor[];
}

export interface AutomaticOutcomeTrigger {
  id: string;
  condition?: string;
  description?: string;
  authority?: string;
}

export interface AutomaticOutcome {
  description: string;
  authority?: string;
  triggers: AutomaticOutcomeTrigger[];
}

export interface RiskScoringConfig {
  meta: {
    source: string;
    version: string;
    versionDate: string;
    versionNote?: string;
    authorities: string[];
  };
  riskLevels: RiskLevel[];
  thresholds: Record<RiskLevel, ScoringThreshold>;
  thresholdAuthority: string;
  automaticOutcomes: Record<string, AutomaticOutcome>;
  scoringFactors: {
    corporate: Record<string, ScoringSection>;
    individual: Record<string, ScoringSection>;
  };
  clarifications: Record<string, unknown>;
}

export interface CDDAction {
  action: string;
  description: string;
  requirements?: string[];
  evidence_types?: string[];
}

export interface CDDRiskLevelConfig {
  cdd_actions?: CDDAction[];
  entity_identification?: CDDAction[];
  directors?: CDDAction[];
  members_partners?: CDDAction[];
  beneficial_ownership?: CDDAction[];
  ownership_control?: CDDAction[];
  ongoing_monitoring?: { required: boolean; description: string };
  enhanced_monitoring?: { required: boolean; description: string };
  edd?: {
    required: boolean;
    actions?: CDDAction[];
  };
  sow?: {
    required: boolean;
    actions?: CDDAction[];
  };
  sof?: {
    required: boolean;
    actions?: CDDAction[];
  };
  authority?: string;
}

export interface CDDClientTypeConfig {
  label: string;
  riskLevels: Record<RiskLevel, CDDRiskLevelConfig>;
}

export interface CDDRulesetConfig {
  meta: {
    source: string;
    version: string;
    status: string;
    derivedFrom: string;
    appliesTo: string;
    scope: string[];
  };
  generalRules: {
    verification_methods: {
      description: string;
      options: Array<{
        method: string;
        description?: string;
        requirements?: string[];
      }>;
    };
    mandatory_outcomes: string;
    edd_approval: {
      rule: string;
      authority: string;
    };
  };
  clientTypes: {
    individual: CDDClientTypeConfig;
    uk_private_limited_company: CDDClientTypeConfig;
    uk_llp: CDDClientTypeConfig;
  };
  exclusions: {
    description: string;
    excluded_types: string[];
  };
}

export interface FormFieldOption {
  value: string;
  options: string[];
}

export interface FormField {
  id: string;
  type: string;
  label?: string | FormFieldOption;
  validation?: string[];
  hint?: string;
  show_if?: Record<string, string>;
  smart_logic_fields?: string[];
  fields?: string[];
}

export interface FormConfig {
  name: string;
  description: string;
  instructions: unknown;
  fields: FormField[];
}
