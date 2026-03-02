/**
 * Server-only config loader
 *
 * Loads firm-specific config from the database.
 * This file imports @/lib/supabase/server and must NOT be imported
 * from client components — only from server actions and server components.
 */

import { createClient } from '@/lib/supabase/server';
import type { RiskScoringConfig, CDDRulesetConfig } from './types';
import type { SectorMappingConfig, CDDStalenessConfig } from './config-loader';
import {
  getRiskScoringConfig,
  getCDDRulesetConfig,
  getSectorMappingConfig,
  getCddStalenessConfig,
} from './config-loader';

/**
 * Load firm-specific config from DB, or fall back to static defaults.
 * Used by submitAssessment() to get the right config for each firm.
 *
 * Server-only — do not import from client components.
 */
export async function getConfigForAssessment(firmId: string): Promise<{
  riskScoring: RiskScoringConfig;
  cddRuleset: CDDRulesetConfig;
  sectorMapping: SectorMappingConfig;
  cddStaleness: CDDStalenessConfig;
  configVersionId: string | null;
}> {
  // Try loading from database
  try {
    const supabase = await createClient();

    const { data: configVersion } = await supabase
      .from('firm_config_versions')
      .select('id, risk_scoring, cdd_ruleset, sector_mapping, cdd_staleness')
      .eq('firm_id', firmId)
      .eq('status', 'active')
      .single();

    if (configVersion) {
      return {
        riskScoring: configVersion.risk_scoring as unknown as RiskScoringConfig,
        cddRuleset: configVersion.cdd_ruleset as unknown as CDDRulesetConfig,
        sectorMapping: configVersion.sector_mapping as unknown as SectorMappingConfig,
        cddStaleness: configVersion.cdd_staleness as unknown as CDDStalenessConfig,
        configVersionId: configVersion.id,
      };
    }
  } catch {
    // DB not available or query failed — fall back to static
  }

  // Fall back to static defaults
  return {
    riskScoring: getRiskScoringConfig(),
    cddRuleset: getCDDRulesetConfig(),
    sectorMapping: getSectorMappingConfig(),
    cddStaleness: getCddStalenessConfig(),
    configVersionId: null,
  };
}
