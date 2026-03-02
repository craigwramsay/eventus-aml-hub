import { describe, it, expect } from 'vitest';
import { validateConfig } from '../config-validator';
import type { RegulatoryBaseline } from '../baseline-types';
import type { RiskScoringConfig, CDDRulesetConfig } from '../types';
import type { SectorMappingConfig, CDDStalenessConfig } from '../config-loader';

// Minimal valid baseline for testing
const testBaseline: RegulatoryBaseline = {
  version: '1.0',
  effectiveDate: '2026-01-01',
  authorities: ['MLR 2017'],
  scoring: {
    maxHighThresholdMin: 12,
    mandatoryFactors: [
      {
        factorId: 'pep_or_rca',
        description: 'PEP status must be assessed',
        authority: 'MLR 2017, reg. 35',
      },
      {
        factorId: 'country_risk',
        description: 'Country risk must be assessed',
        authority: 'MLR 2017, reg. 33(1)(a)',
      },
    ],
    mandatoryAutomaticOutcomes: [
      {
        outcomeId: 'HIGH_RISK_EDD_REQUIRED',
        description: 'Must have automatic HIGH for PEP',
        authority: 'MLR 2017, reg. 35',
      },
    ],
    mandatoryEddTriggers: [
      {
        triggerId: 'client_account',
        description: 'Client account EDD trigger',
        authority: 'LSAG 2025 §6.2.3',
      },
    ],
  },
  cdd: {
    mandatoryActions: [
      {
        actionId: 'verify_identity',
        description: 'Verify client identity',
        authority: 'MLR 2017, reg. 28(2)',
        appliesTo: {
          clientTypes: ['individual'],
          riskLevels: ['LOW', 'MEDIUM', 'HIGH'],
        },
      },
    ],
    eddRequiredAtHigh: true,
    sowRequiredAtMediumPlus: true,
    sofRequiredAtHigh: true,
    ongoingMonitoringRequired: true,
  },
  sectorMapping: {
    mandatoryProhibited: ['Weapons or defence brokering'],
  },
  staleness: {
    maxMonths: { HIGH: 12, MEDIUM: 24, LOW: 36 },
  },
};

// Minimal valid firm config that passes all baseline checks
function makeValidFirmConfig() {
  const riskScoring: RiskScoringConfig = {
    meta: {
      source: 'test',
      version: '1.0',
      versionDate: '2026-01',
      authorities: ['MLR 2017'],
    },
    riskLevels: ['LOW', 'MEDIUM', 'HIGH'],
    thresholds: {
      LOW: { min: 0, max: 4 },
      MEDIUM: { min: 5, max: 8 },
      HIGH: { min: 9, max: null },
    },
    thresholdAuthority: 'test',
    automaticOutcomes: {
      HIGH_RISK_EDD_REQUIRED: {
        description: 'Auto HIGH',
        triggers: [{ id: 'pep_status' }],
      },
    },
    eddTriggers: [
      {
        id: 'client_account',
        description: 'Client account',
        authority: 'test',
        fieldMapping: { individual: '36' },
        condition: { type: 'equals' as const, value: 'Yes' },
      },
    ],
    scoringFactors: {
      individual: {
        section1: {
          label: 'Section 1',
          factors: [
            {
              id: 'pep_or_rca',
              formFieldId: '20',
              label: 'PEP status',
              options: [{ answer: 'Yes', score: 3 }],
            },
            {
              id: 'country_risk',
              formFieldId: '16',
              label: 'Country',
              options: [{ answer: 'UK', score: 0 }],
            },
          ],
        },
      },
      corporate: {
        section1: {
          label: 'Section 1',
          factors: [
            {
              id: 'pep_or_rca',
              formFieldId: '20',
              label: 'PEP status',
              options: [{ answer: 'Yes', score: 3 }],
            },
            {
              id: 'country_risk',
              formFieldId: '16',
              label: 'Country',
              options: [{ answer: 'UK', score: 0 }],
            },
          ],
        },
      },
    },
    clarifications: {},
  };

  const cddRuleset: CDDRulesetConfig = {
    meta: {
      source: 'test',
      version: '1.0',
      status: 'active',
      derivedFrom: 'test',
      appliesTo: 'test',
      scope: [],
    },
    generalRules: {
      verification_methods: { description: 'test', options: [] },
      mandatory_outcomes: 'test',
      edd_approval: { rule: 'test', authority: 'test' },
    },
    clientTypes: {
      individual: {
        label: 'Individual',
        riskLevels: {
          LOW: {
            cdd_actions: [{ action: 'verify_identity', description: 'Verify identity' }],
            edd: { required: false },
          },
          MEDIUM: {
            cdd_actions: [{ action: 'verify_identity', description: 'Verify identity' }],
            edd: { required: false },
          },
          HIGH: {
            cdd_actions: [{ action: 'verify_identity', description: 'Verify identity' }],
            edd: { required: true, actions: [] },
          },
        },
      },
      uk_private_limited_company: {
        label: 'UK Ltd',
        riskLevels: {
          LOW: { cdd_actions: [], edd: { required: false } },
          MEDIUM: { cdd_actions: [], edd: { required: false } },
          HIGH: { cdd_actions: [], edd: { required: true, actions: [] } },
        },
      },
      uk_llp: {
        label: 'UK LLP',
        riskLevels: {
          LOW: { cdd_actions: [], edd: { required: false } },
          MEDIUM: { cdd_actions: [], edd: { required: false } },
          HIGH: { cdd_actions: [], edd: { required: true, actions: [] } },
        },
      },
    },
    exclusions: { description: 'test', excluded_types: [] },
  };

  const sectorMapping: SectorMappingConfig = {
    version: '1.0',
    categories: {
      Standard: ['Professional services'],
      'Higher-risk': ['Construction'],
      Prohibited: ['Weapons or defence brokering'],
    },
  };

  const cddStaleness: CDDStalenessConfig = {
    thresholds: {
      HIGH: { months: 12, label: '12 months' },
      MEDIUM: { months: 24, label: '24 months' },
      LOW: { months: 36, label: '36 months' },
    },
  };

  return { riskScoring, cddRuleset, sectorMapping, cddStaleness };
}

describe('validateConfig', () => {
  it('returns valid for a compliant config', () => {
    const config = makeValidFirmConfig();
    const result = validateConfig(config, testBaseline);
    expect(result.valid).toBe(true);
    expect(result.gaps).toHaveLength(0);
  });

  it('detects missing mandatory scoring factor', () => {
    const config = makeValidFirmConfig();
    // Remove pep_or_rca from individual
    config.riskScoring.scoringFactors.individual.section1.factors =
      config.riskScoring.scoringFactors.individual.section1.factors.filter(
        (f) => f.id !== 'pep_or_rca'
      );
    config.riskScoring.scoringFactors.corporate.section1.factors =
      config.riskScoring.scoringFactors.corporate.section1.factors.filter(
        (f) => f.id !== 'pep_or_rca'
      );

    const result = validateConfig(config, testBaseline);
    expect(result.valid).toBe(false);
    expect(result.gaps.some((g) => g.gapCode === 'MISSING_FACTOR_pep_or_rca')).toBe(true);
  });

  it('detects missing mandatory automatic outcome', () => {
    const config = makeValidFirmConfig();
    delete config.riskScoring.automaticOutcomes.HIGH_RISK_EDD_REQUIRED;

    const result = validateConfig(config, testBaseline);
    expect(result.valid).toBe(false);
    expect(result.gaps.some((g) => g.gapCode === 'MISSING_OUTCOME_HIGH_RISK_EDD_REQUIRED')).toBe(true);
  });

  it('detects HIGH threshold exceeding maximum', () => {
    const config = makeValidFirmConfig();
    config.riskScoring.thresholds.HIGH = { min: 15, max: null };

    const result = validateConfig(config, testBaseline);
    expect(result.valid).toBe(false);
    expect(result.gaps.some((g) => g.gapCode === 'HIGH_THRESHOLD_TOO_HIGH')).toBe(true);
  });

  it('detects missing mandatory CDD action', () => {
    const config = makeValidFirmConfig();
    // Remove verify_identity from individual LOW
    config.cddRuleset.clientTypes.individual.riskLevels.LOW.cdd_actions = [];

    const result = validateConfig(config, testBaseline);
    expect(result.valid).toBe(false);
    expect(result.gaps.some((g) => g.gapCode === 'MISSING_ACTION_verify_identity_individual_LOW')).toBe(true);
  });

  it('detects EDD not required at HIGH', () => {
    const config = makeValidFirmConfig();
    config.cddRuleset.clientTypes.individual.riskLevels.HIGH.edd = { required: false };

    const result = validateConfig(config, testBaseline);
    expect(result.valid).toBe(false);
    expect(result.gaps.some((g) => g.gapCode === 'EDD_NOT_REQUIRED_AT_HIGH_individual')).toBe(true);
  });

  it('detects missing mandatory EDD trigger', () => {
    const config = makeValidFirmConfig();
    config.riskScoring.eddTriggers = [];

    const result = validateConfig(config, testBaseline);
    expect(result.valid).toBe(false);
    expect(result.gaps.some((g) => g.gapCode === 'MISSING_EDD_TRIGGER_client_account')).toBe(true);
  });

  it('detects missing prohibited sector', () => {
    const config = makeValidFirmConfig();
    config.sectorMapping.categories.Prohibited = [];

    const result = validateConfig(config, testBaseline);
    expect(result.valid).toBe(false);
    expect(result.gaps.some((g) =>
      g.gapCode.startsWith('MISSING_PROHIBITED_SECTOR_')
    )).toBe(true);
  });

  it('detects staleness threshold exceeding maximum', () => {
    const config = makeValidFirmConfig();
    config.cddStaleness.thresholds.HIGH = { months: 18, label: '18 months' };

    const result = validateConfig(config, testBaseline);
    expect(result.valid).toBe(false);
    expect(result.gaps.some((g) => g.gapCode === 'STALENESS_EXCEEDS_MAX_HIGH')).toBe(true);
  });

  it('allows stricter thresholds than baseline', () => {
    const config = makeValidFirmConfig();
    config.riskScoring.thresholds.HIGH = { min: 7, max: null };
    config.cddStaleness.thresholds.HIGH = { months: 6, label: '6 months' };

    const result = validateConfig(config, testBaseline);
    expect(result.valid).toBe(true);
  });
});
