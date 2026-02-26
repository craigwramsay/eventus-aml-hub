/**
 * Config loader for the Eventus AML Rules Engine
 * Loads all configuration from JSON files - no hardcoded values
 */

import type {
  RiskScoringConfig,
  CDDRulesetConfig,
  FormConfig,
} from './types';

// Import configs directly for static bundling
import riskScoringConfig from '@/config/eventus/risk_scoring_v3_8.json';
import cddRulesetConfig from '@/config/eventus/cdd_ruleset.json';
import individualFormConfig from '@/config/eventus/forms/CMLRA_individual.json';
import corporateFormConfig from '@/config/eventus/forms/CMLRA_corporate.json';
import sowIndividualConfig from '@/config/eventus/forms/SoW_individual.json';
import sowCorporateConfig from '@/config/eventus/forms/SoW_corporate.json';
import sofConfig from '@/config/eventus/forms/SoF.json';
import sectorMappingConfig from '@/config/eventus/rules/sector_mapping.json';
import cddStalenessConfig from '@/config/eventus/cdd_staleness.json';

export type SectorRiskCategory = 'Standard' | 'Higher-risk' | 'Prohibited';

export interface SectorMappingConfig {
  version: string;
  categories: Record<SectorRiskCategory, string[]>;
}

export interface CDDStalenessThreshold {
  months: number;
  label: string;
}

export interface CDDStalenessConfig {
  thresholds: Record<string, CDDStalenessThreshold>;
}

/**
 * Loaded configuration singleton
 */
let loadedConfig: {
  riskScoring: RiskScoringConfig;
  cddRuleset: CDDRulesetConfig;
  sectorMapping: SectorMappingConfig;
  forms: {
    individual: FormConfig;
    corporate: FormConfig;
    sow_individual: FormConfig;
    sow_corporate: FormConfig;
    sof: FormConfig;
  };
} | null = null;

/**
 * Load all configuration files
 */
export function loadConfig(): {
  riskScoring: RiskScoringConfig;
  cddRuleset: CDDRulesetConfig;
  sectorMapping: SectorMappingConfig;
  forms: {
    individual: FormConfig;
    corporate: FormConfig;
    sow_individual: FormConfig;
    sow_corporate: FormConfig;
    sof: FormConfig;
  };
} {
  if (loadedConfig) {
    return loadedConfig;
  }

  loadedConfig = {
    riskScoring: riskScoringConfig as unknown as RiskScoringConfig,
    cddRuleset: cddRulesetConfig as unknown as CDDRulesetConfig,
    sectorMapping: sectorMappingConfig as unknown as SectorMappingConfig,
    forms: {
      individual: individualFormConfig as unknown as FormConfig,
      corporate: corporateFormConfig as unknown as FormConfig,
      sow_individual: sowIndividualConfig as unknown as FormConfig,
      sow_corporate: sowCorporateConfig as unknown as FormConfig,
      sof: sofConfig as unknown as FormConfig,
    },
  };

  return loadedConfig;
}

/**
 * Get risk scoring configuration
 */
export function getRiskScoringConfig(): RiskScoringConfig {
  return loadConfig().riskScoring;
}

/**
 * Get CDD ruleset configuration
 */
export function getCDDRulesetConfig(): CDDRulesetConfig {
  return loadConfig().cddRuleset;
}

/**
 * Get sector mapping configuration
 */
export function getSectorMappingConfig(): SectorMappingConfig {
  return loadConfig().sectorMapping;
}

/**
 * Get form configuration by client type
 */
export function getFormConfig(clientType: 'individual' | 'corporate'): FormConfig {
  return loadConfig().forms[clientType];
}

/**
 * Get SoW/SoF form configuration
 */
export function getSowSofFormConfig(
  formType: 'sow' | 'sof',
  clientType: 'individual' | 'corporate'
): FormConfig {
  const config = loadConfig();
  if (formType === 'sof') {
    return config.forms.sof;
  }
  return clientType === 'individual'
    ? config.forms.sow_individual
    : config.forms.sow_corporate;
}

/**
 * Get CDD staleness thresholds
 */
export function getCddStalenessConfig(): CDDStalenessConfig {
  return cddStalenessConfig as CDDStalenessConfig;
}

/**
 * Clear cached config (useful for testing)
 */
export function clearConfigCache(): void {
  loadedConfig = null;
}
