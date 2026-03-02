/**
 * Regulatory Baseline Types
 *
 * Defines the structure for the platform-managed regulatory floor.
 * This is a validation ruleset — it defines minimums that firm configs
 * are checked against, not an engine config itself.
 */

import type { RiskLevel } from './types';

export interface BaselineMandatoryFactor {
  factorId: string;
  description: string;
  authority: string;
  minimumHighScore?: number;
}

export interface BaselineMandatoryOutcome {
  outcomeId: string;
  description: string;
  authority: string;
}

export interface BaselineMandatoryEddTrigger {
  triggerId: string;
  description: string;
  authority: string;
}

export interface BaselineMandatoryAction {
  actionId: string;
  description: string;
  authority: string;
  appliesTo: {
    clientTypes: ('individual' | 'corporate')[];
    riskLevels: RiskLevel[];
  };
}

export interface RegulatoryBaseline {
  version: string;
  effectiveDate: string;
  authorities: string[];
  scoring: {
    maxHighThresholdMin: number;
    mandatoryFactors: BaselineMandatoryFactor[];
    mandatoryAutomaticOutcomes: BaselineMandatoryOutcome[];
    mandatoryEddTriggers: BaselineMandatoryEddTrigger[];
  };
  cdd: {
    mandatoryActions: BaselineMandatoryAction[];
    eddRequiredAtHigh: boolean;
    sowRequiredAtMediumPlus: boolean;
    sofRequiredAtHigh: boolean;
    ongoingMonitoringRequired: boolean;
  };
  sectorMapping: {
    mandatoryProhibited: string[];
  };
  staleness: {
    maxMonths: Record<RiskLevel, number>;
  };
}
