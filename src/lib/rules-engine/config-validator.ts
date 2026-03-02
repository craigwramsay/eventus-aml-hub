/**
 * Config Validator
 *
 * Validates a firm's config against the regulatory baseline.
 * Returns gaps (warnings) that the MLRO must acknowledge before activation.
 * Pure function — no database access.
 */

import type { RegulatoryBaseline } from './baseline-types';
import type { RiskScoringConfig, CDDRulesetConfig, CDDRiskLevelConfig, CDDClientTypeConfig } from './types';
import type { SectorMappingConfig, CDDStalenessConfig } from './config-loader';

export interface ValidationGap {
  gapCode: string;
  severity: 'error' | 'warning';
  description: string;
  baselineRequirement: string;
  firmValue: string | null;
  authority: string;
}

export interface ValidationResult {
  valid: boolean;
  gaps: ValidationGap[];
}

/**
 * Validate a firm's config against the regulatory baseline.
 * Returns gaps that must be acknowledged by the MLRO.
 */
export function validateConfig(
  firmConfig: {
    riskScoring: RiskScoringConfig;
    cddRuleset: CDDRulesetConfig;
    sectorMapping: SectorMappingConfig;
    cddStaleness: CDDStalenessConfig;
  },
  baseline: RegulatoryBaseline
): ValidationResult {
  const gaps: ValidationGap[] = [];

  // 1. Check mandatory scoring factors exist
  validateMandatoryFactors(firmConfig.riskScoring, baseline, gaps);

  // 2. Check mandatory automatic outcomes exist
  validateMandatoryOutcomes(firmConfig.riskScoring, baseline, gaps);

  // 3. Check HIGH threshold minimum
  validateHighThreshold(firmConfig.riskScoring, baseline, gaps);

  // 4. Check mandatory CDD actions
  validateMandatoryCddActions(firmConfig.cddRuleset, baseline, gaps);

  // 5. Check EDD required at HIGH
  validateEddAtHigh(firmConfig.cddRuleset, baseline, gaps);

  // 6. Check mandatory EDD triggers
  validateMandatoryEddTriggers(firmConfig.riskScoring, baseline, gaps);

  // 7. Check prohibited sectors
  validateProhibitedSectors(firmConfig.sectorMapping, baseline, gaps);

  // 8. Check staleness thresholds
  validateStalenessThresholds(firmConfig.cddStaleness, baseline, gaps);

  return {
    valid: gaps.length === 0,
    gaps,
  };
}

function getAllFactorIds(riskScoring: RiskScoringConfig): Set<string> {
  const ids = new Set<string>();
  for (const clientType of ['individual', 'corporate'] as const) {
    const sections = riskScoring.scoringFactors[clientType];
    if (!sections) continue;
    for (const section of Object.values(sections)) {
      for (const factor of section.factors) {
        ids.add(factor.id);
      }
    }
  }
  return ids;
}

function validateMandatoryFactors(
  riskScoring: RiskScoringConfig,
  baseline: RegulatoryBaseline,
  gaps: ValidationGap[]
): void {
  const existingFactorIds = getAllFactorIds(riskScoring);

  for (const mandatoryFactor of baseline.scoring.mandatoryFactors) {
    if (!existingFactorIds.has(mandatoryFactor.factorId)) {
      gaps.push({
        gapCode: `MISSING_FACTOR_${mandatoryFactor.factorId}`,
        severity: 'warning',
        description: `Mandatory scoring factor "${mandatoryFactor.factorId}" is not present in the firm's config`,
        baselineRequirement: mandatoryFactor.description,
        firmValue: null,
        authority: mandatoryFactor.authority,
      });
    }
  }
}

function validateMandatoryOutcomes(
  riskScoring: RiskScoringConfig,
  baseline: RegulatoryBaseline,
  gaps: ValidationGap[]
): void {
  const existingOutcomeIds = new Set(Object.keys(riskScoring.automaticOutcomes || {}));

  for (const mandatoryOutcome of baseline.scoring.mandatoryAutomaticOutcomes) {
    if (!existingOutcomeIds.has(mandatoryOutcome.outcomeId)) {
      gaps.push({
        gapCode: `MISSING_OUTCOME_${mandatoryOutcome.outcomeId}`,
        severity: 'warning',
        description: `Mandatory automatic outcome "${mandatoryOutcome.outcomeId}" is not configured`,
        baselineRequirement: mandatoryOutcome.description,
        firmValue: null,
        authority: mandatoryOutcome.authority,
      });
    }
  }
}

function validateHighThreshold(
  riskScoring: RiskScoringConfig,
  baseline: RegulatoryBaseline,
  gaps: ValidationGap[]
): void {
  const highThreshold = riskScoring.thresholds?.HIGH;
  if (!highThreshold) return;

  if (highThreshold.min > baseline.scoring.maxHighThresholdMin) {
    gaps.push({
      gapCode: 'HIGH_THRESHOLD_TOO_HIGH',
      severity: 'warning',
      description: `HIGH risk threshold minimum (${highThreshold.min}) exceeds the regulatory maximum (${baseline.scoring.maxHighThresholdMin})`,
      baselineRequirement: `HIGH risk threshold minimum must not exceed ${baseline.scoring.maxHighThresholdMin}`,
      firmValue: String(highThreshold.min),
      authority: 'MLR 2017, reg. 33',
    });
  }
}

function validateMandatoryCddActions(
  cddRuleset: CDDRulesetConfig,
  baseline: RegulatoryBaseline,
  gaps: ValidationGap[]
): void {
  for (const mandatoryAction of baseline.cdd.mandatoryActions) {
    const { actionId, appliesTo } = mandatoryAction;

    for (const clientType of appliesTo.clientTypes) {
      // Find the matching client type config in the CDD ruleset
      const clientTypeConfigs = getClientTypeConfig(cddRuleset, clientType);
      if (!clientTypeConfigs) continue;

      for (const riskLevel of appliesTo.riskLevels) {
        const riskConfig = clientTypeConfigs.riskLevels[riskLevel];
        if (!riskConfig) {
          gaps.push({
            gapCode: `MISSING_ACTION_${actionId}_${clientType}_${riskLevel}`,
            severity: 'warning',
            description: `Risk level "${riskLevel}" config missing for ${clientType} — mandatory action "${actionId}" cannot be verified`,
            baselineRequirement: mandatoryAction.description,
            firmValue: null,
            authority: mandatoryAction.authority,
          });
          continue;
        }

        // Check if the action exists in any action category for this risk level
        const hasAction = findActionInRiskConfig(riskConfig, actionId);
        if (!hasAction) {
          gaps.push({
            gapCode: `MISSING_ACTION_${actionId}_${clientType}_${riskLevel}`,
            severity: 'warning',
            description: `Mandatory CDD action "${actionId}" is not configured for ${clientType} at ${riskLevel} risk`,
            baselineRequirement: mandatoryAction.description,
            firmValue: null,
            authority: mandatoryAction.authority,
          });
        }
      }
    }
  }
}

function getClientTypeConfig(
  cddRuleset: CDDRulesetConfig,
  clientType: 'individual' | 'corporate'
): CDDClientTypeConfig | null {
  if (clientType === 'individual') {
    return cddRuleset.clientTypes.individual ?? null;
  }
  // For corporate, check all corporate entity types
  return (
    cddRuleset.clientTypes.uk_private_limited_company ??
    cddRuleset.clientTypes.uk_llp ??
    null
  );
}

function findActionInRiskConfig(
  riskConfig: CDDRiskLevelConfig,
  actionId: string
): boolean {
  // Check across all action array categories
  const actionArrays = [
    riskConfig.cdd_actions,
    riskConfig.entity_identification,
    riskConfig.directors,
    riskConfig.members_partners,
    riskConfig.beneficial_ownership,
    riskConfig.ownership_control,
  ];

  for (const actions of actionArrays) {
    if (actions?.some((a) => a.action === actionId)) {
      return true;
    }
  }

  // Check EDD actions
  if (riskConfig.edd?.actions?.some((a) => a.action === actionId)) {
    return true;
  }

  // Check SoW/SoF actions
  if (riskConfig.sow?.actions?.some((a) => a.action === actionId)) {
    return true;
  }

  if (riskConfig.sof?.actions?.some((a) => a.action === actionId)) {
    return true;
  }

  return false;
}

function validateEddAtHigh(
  cddRuleset: CDDRulesetConfig,
  baseline: RegulatoryBaseline,
  gaps: ValidationGap[]
): void {
  if (!baseline.cdd.eddRequiredAtHigh) return;

  // Check all client type configs have EDD required at HIGH
  for (const [key, config] of Object.entries(cddRuleset.clientTypes)) {
    const highConfig = config.riskLevels.HIGH;
    if (!highConfig?.edd?.required) {
      gaps.push({
        gapCode: `EDD_NOT_REQUIRED_AT_HIGH_${key}`,
        severity: 'warning',
        description: `EDD is not marked as required at HIGH risk for client type "${key}"`,
        baselineRequirement: 'Enhanced Due Diligence must be required at HIGH risk',
        firmValue: 'EDD not required',
        authority: 'MLR 2017, reg. 33',
      });
    }
  }
}

function validateMandatoryEddTriggers(
  riskScoring: RiskScoringConfig,
  baseline: RegulatoryBaseline,
  gaps: ValidationGap[]
): void {
  const existingTriggerIds = new Set(
    (riskScoring.eddTriggers || []).map((t) => t.id)
  );

  for (const mandatoryTrigger of baseline.scoring.mandatoryEddTriggers) {
    if (!existingTriggerIds.has(mandatoryTrigger.triggerId)) {
      gaps.push({
        gapCode: `MISSING_EDD_TRIGGER_${mandatoryTrigger.triggerId}`,
        severity: 'warning',
        description: `Mandatory EDD trigger "${mandatoryTrigger.triggerId}" is not configured`,
        baselineRequirement: mandatoryTrigger.description,
        firmValue: null,
        authority: mandatoryTrigger.authority,
      });
    }
  }
}

function validateProhibitedSectors(
  sectorMapping: SectorMappingConfig,
  baseline: RegulatoryBaseline,
  gaps: ValidationGap[]
): void {
  const prohibitedSectors = new Set(sectorMapping.categories['Prohibited'] || []);

  for (const mandatoryProhibited of baseline.sectorMapping.mandatoryProhibited) {
    if (!prohibitedSectors.has(mandatoryProhibited)) {
      gaps.push({
        gapCode: `MISSING_PROHIBITED_SECTOR_${mandatoryProhibited.replace(/\s+/g, '_')}`,
        severity: 'warning',
        description: `Sector "${mandatoryProhibited}" must be categorised as Prohibited`,
        baselineRequirement: `"${mandatoryProhibited}" must be in the Prohibited category`,
        firmValue: null,
        authority: 'MLR 2017, reg. 31(1)',
      });
    }
  }
}

function validateStalenessThresholds(
  cddStaleness: CDDStalenessConfig,
  baseline: RegulatoryBaseline,
  gaps: ValidationGap[]
): void {
  for (const level of ['HIGH', 'MEDIUM', 'LOW'] as const) {
    const maxMonths = baseline.staleness.maxMonths[level];
    const firmThreshold = cddStaleness.thresholds[level];

    if (!firmThreshold) {
      gaps.push({
        gapCode: `MISSING_STALENESS_${level}`,
        severity: 'warning',
        description: `CDD staleness threshold not configured for ${level} risk`,
        baselineRequirement: `Must not exceed ${maxMonths} months`,
        firmValue: null,
        authority: 'MLR 2017, reg. 28(11)',
      });
      continue;
    }

    if (firmThreshold.months > maxMonths) {
      gaps.push({
        gapCode: `STALENESS_EXCEEDS_MAX_${level}`,
        severity: 'warning',
        description: `CDD staleness for ${level} risk (${firmThreshold.months} months) exceeds the regulatory maximum (${maxMonths} months)`,
        baselineRequirement: `Must not exceed ${maxMonths} months`,
        firmValue: `${firmThreshold.months} months`,
        authority: 'MLR 2017, reg. 28(11)',
      });
    }
  }
}
