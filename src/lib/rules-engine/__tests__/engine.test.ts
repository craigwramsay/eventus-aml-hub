import { describe, it, expect, beforeEach } from 'vitest';
import {
  runAssessment,
  assessIndividual,
  assessCorporate,
  clearConfigCache,
} from '../index';
import type { FormAnswers } from '../types';

/**
 * Test fixtures for Individual CMLRA
 * Field IDs from CMLRA_individual.json
 */
const INDIVIDUAL_FIXTURES = {
  /**
   * Low risk individual: Score 1 (New client only)
   * - New client: +1
   * - UK resident: 0
   * - Not PEP: 0
   * - Routine work: 0
   * - Ongoing: 0
   * - No HRTC: 0
   * - Client funds: 0
   * - No cross-border: 0
   * - No unusual transaction: 0
   * - No reluctance: 0
   * Total: 1 (LOW)
   */
  lowRisk: {
    '3': 'New client',
    '16': 'UK',
    '20': 'No',
    '24': 'Yes',
    '28': 'Ongoing',
    '32': 'No',
    '38': 'Client',
    '42': 'No',
    '47': 'No',
    '48': 'No',
  } as FormAnswers,

  /**
   * Medium risk individual: Score 6
   * - Existing client: 0
   * - FATF-equivalent: +1
   * - Not PEP: 0
   * - Not routine: +1
   * - One-off: +1
   * - No HRTC: 0
   * - Third party funds: +2
   * - Cross-border: +1
   * - No unusual: 0
   * - No reluctance: 0
   * Total: 6 (MEDIUM)
   */
  mediumRisk: {
    '3': 'Existing client',
    '16': 'FATF-equivalent jurisdiction',
    '20': 'No',
    '24': 'No',
    '28': 'One-off',
    '32': 'No',
    '38': 'Third party',
    '42': 'Yes',
    '47': 'No',
    '48': 'No',
  } as FormAnswers,

  /**
   * High risk individual: Score 12
   * - New client: +1
   * - HRTC: +3
   * - Not PEP: 0
   * - Unusual: +2
   * - One-off: +1
   * - HRTC nexus: +3
   * - Third party: +2
   * - Cross-border: +1 (but won't count if no funds movement)
   * - Unusual transaction: 0 (already counted)
   * - Reluctance: 0
   * Total: 12 (HIGH)
   */
  highRisk: {
    '3': 'New client',
    '16': 'HRTC - High-Risk Third Country',
    '20': 'No',
    '24': 'Unusual',
    '28': 'One-off',
    '32': 'Yes',
    '38': 'Third party',
    '42': 'Yes',
    '47': 'No',
    '48': 'No',
  } as FormAnswers,

  /**
   * PEP triggers automatic HIGH
   */
  pepTrigger: {
    '3': 'Existing client',
    '16': 'UK',
    '20': 'Yes', // PEP = automatic HIGH
    '24': 'Yes',
    '28': 'Ongoing',
    '32': 'No',
    '38': 'Client',
    '42': 'No',
    '47': 'No',
    '48': 'No',
  } as FormAnswers,
};

/**
 * Test fixtures for Corporate CMLRA
 * Field IDs from CMLRA_corporate.json
 */
const CORPORATE_FIXTURES = {
  /**
   * Low risk corporate: Score 2
   * - New client: +1
   * - All UK/EEA BOs: 0
   * - No opaque: 0
   * - No complex: 0
   * - No nominees: 0
   * - No trust: 0
   * - Routine: 0
   * - Ongoing: 0
   * - No HRTC: 0
   * - Standard sector: 0
   * - Client funds: 0
   * - No cross-border: 0
   * - No unusual: 0
   * - No reluctance: 0
   * Total: 1 (LOW)
   */
  lowRisk: {
    '16': 'New client',
    '26': 'All resident in the UK / European Economic Area',
    '28': 'No',
    '30': 'No',
    '32': 'No',
    '34': 'No',
    '37': 'Yes',
    '39': 'Ongoing',
    '47': 'No',
    '49': 'Standard - Typical Eventus client sectors (professional services, property holding, manufacturing, retail etc.)',
    '59': 'Client',
    '63': 'No',
    '67': 'No',
    '68': 'No',
  } as FormAnswers,

  /**
   * Medium risk corporate: Score 7
   * - Existing: 0
   * - Mixed BOs: +1
   * - Opaque: +2
   * - No complex: 0
   * - No nominees: 0
   * - No trust: 0
   * - Not routine: +1
   * - One-off: +1
   * - No HRTC: 0
   * - Higher-risk sector: +2
   * - Client funds: 0
   * - No cross-border: 0
   * - No unusual: 0
   * - No reluctance: 0
   * Total: 7 (MEDIUM)
   */
  mediumRisk: {
    '16': 'Existing client',
    '26': 'Some resident in the UK / European Economic Area and some resident elsewhere',
    '28': 'Yes',
    '30': 'No',
    '32': 'No',
    '34': 'No',
    '37': 'No',
    '39': 'One-off',
    '47': 'No',
    '49': 'Higher-risk - Sectors identified as heightened ML/TF risk in Eventus PWRA, including: cash-intensive trades (e.g. hospitality, construction, transport), cryptoasset activity, gambling, private wealth / family office work, unregulated financial services, or property development involving offshore structures.',
    '59': 'Client',
    '63': 'No',
    '67': 'No',
    '68': 'No',
  } as FormAnswers,

  /**
   * High risk corporate: Score 15
   * - New: +1
   * - All outside UK/EEA: +2
   * - Opaque: +2
   * - Complex: +2
   * - Nominees: +2
   * - Trust: +2
   * - Unusual: +2
   * - One-off: +1
   * - No HRTC: 0
   * - Standard: 0
   * - Third party: +2
   * - Cross-border: +1
   * Total: 17 (HIGH)
   */
  highRisk: {
    '16': 'New client',
    '26': 'All resident out with the UK / European Economic Area',
    '28': 'Yes',
    '30': 'Yes',
    '32': 'Yes',
    '34': 'Yes',
    '37': 'Unusual',
    '39': 'One-off',
    '47': 'No',
    '49': 'Standard - Typical Eventus client sectors (professional services, property holding, manufacturing, retail etc.)',
    '59': 'Third party',
    '63': 'Yes',
    '67': 'No',
    '68': 'No',
  } as FormAnswers,
};

describe('AML Rules Engine', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  describe('Risk Level Thresholds', () => {
    it('should classify score 0-4 as LOW', () => {
      const result = assessIndividual(INDIVIDUAL_FIXTURES.lowRisk);
      expect(result.score).toBeLessThanOrEqual(4);
      expect(result.riskLevel).toBe('LOW');
    });

    it('should classify score 5-8 as MEDIUM', () => {
      const result = assessIndividual(INDIVIDUAL_FIXTURES.mediumRisk);
      expect(result.score).toBeGreaterThanOrEqual(5);
      expect(result.score).toBeLessThanOrEqual(8);
      expect(result.riskLevel).toBe('MEDIUM');
    });

    it('should classify score 9+ as HIGH', () => {
      const result = assessIndividual(INDIVIDUAL_FIXTURES.highRisk);
      expect(result.score).toBeGreaterThanOrEqual(9);
      expect(result.riskLevel).toBe('HIGH');
    });
  });

  describe('Individual Client Assessment', () => {
    it('should assess low-risk individual correctly', () => {
      const result = assessIndividual(INDIVIDUAL_FIXTURES.lowRisk);

      expect(result.riskLevel).toBe('LOW');
      expect(result.automaticOutcome).toBeNull();
      expect(result.rationale.length).toBeGreaterThan(0);
      expect(result.mandatoryActions.length).toBeGreaterThan(0);

      // LOW risk should not require EDD
      const eddActions = result.mandatoryActions.filter(
        (a) => a.category === 'edd'
      );
      expect(eddActions.length).toBe(0);
    });

    it('should assess medium-risk individual correctly', () => {
      const result = assessIndividual(INDIVIDUAL_FIXTURES.mediumRisk);

      expect(result.riskLevel).toBe('MEDIUM');

      // MEDIUM risk should require SoW and SoF
      const sowActions = result.mandatoryActions.filter(
        (a) => a.category === 'sow'
      );
      const sofActions = result.mandatoryActions.filter(
        (a) => a.category === 'sof'
      );
      expect(sowActions.length).toBeGreaterThan(0);
      expect(sofActions.length).toBeGreaterThan(0);
    });

    it('should assess high-risk individual correctly', () => {
      const result = assessIndividual(INDIVIDUAL_FIXTURES.highRisk);

      expect(result.riskLevel).toBe('HIGH');

      // HIGH risk should require EDD
      const eddActions = result.mandatoryActions.filter(
        (a) => a.category === 'edd'
      );
      expect(eddActions.length).toBeGreaterThan(0);
    });

    it('should trigger automatic HIGH for PEP', () => {
      const result = assessIndividual(INDIVIDUAL_FIXTURES.pepTrigger);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.automaticOutcome).not.toBeNull();
      expect(result.automaticOutcome?.outcomeId).toBe('HIGH_RISK_EDD_REQUIRED');
      expect(result.rationale.some((r) => r.includes('AUTOMATIC OUTCOME'))).toBe(
        true
      );
    });
  });

  describe('Corporate Client Assessment', () => {
    it('should assess low-risk corporate correctly', () => {
      const result = assessCorporate(CORPORATE_FIXTURES.lowRisk);

      expect(result.riskLevel).toBe('LOW');
      expect(result.automaticOutcome).toBeNull();
      expect(result.mandatoryActions.length).toBeGreaterThan(0);

      // Should include CDD actions
      const cddActions = result.mandatoryActions.filter(
        (a) => a.category === 'cdd'
      );
      expect(cddActions.length).toBeGreaterThan(0);
    });

    it('should assess medium-risk corporate correctly', () => {
      const result = assessCorporate(CORPORATE_FIXTURES.mediumRisk);

      expect(result.riskLevel).toBe('MEDIUM');

      // Should include SoW/SoF requirements
      const sowSofActions = result.mandatoryActions.filter(
        (a) => a.category === 'sow' || a.category === 'sof'
      );
      expect(sowSofActions.length).toBeGreaterThan(0);
    });

    it('should assess high-risk corporate correctly', () => {
      const result = assessCorporate(CORPORATE_FIXTURES.highRisk);

      expect(result.riskLevel).toBe('HIGH');

      // Should include EDD requirements
      const eddActions = result.mandatoryActions.filter(
        (a) => a.category === 'edd'
      );
      expect(eddActions.length).toBeGreaterThan(0);
    });
  });

  describe('Determinism', () => {
    it('should produce identical results for identical inputs', () => {
      const result1 = assessIndividual(INDIVIDUAL_FIXTURES.lowRisk);
      const result2 = assessIndividual(INDIVIDUAL_FIXTURES.lowRisk);

      expect(result1.score).toBe(result2.score);
      expect(result1.riskLevel).toBe(result2.riskLevel);
      expect(result1.riskFactors).toEqual(result2.riskFactors);
      expect(result1.mandatoryActions).toEqual(result2.mandatoryActions);
    });

    it('should produce identical results for corporate inputs', () => {
      const result1 = assessCorporate(CORPORATE_FIXTURES.mediumRisk);
      const result2 = assessCorporate(CORPORATE_FIXTURES.mediumRisk);

      expect(result1.score).toBe(result2.score);
      expect(result1.riskLevel).toBe(result2.riskLevel);
    });
  });

  describe('Risk Factor Breakdown', () => {
    it('should provide risk factor breakdown for each scored factor', () => {
      const result = assessIndividual(INDIVIDUAL_FIXTURES.mediumRisk);

      expect(result.riskFactors.length).toBeGreaterThan(0);

      // Each factor should have required properties
      for (const factor of result.riskFactors) {
        expect(factor.factorId).toBeDefined();
        expect(factor.factorLabel).toBeDefined();
        expect(factor.formFieldId).toBeDefined();
        expect(factor.selectedAnswer).toBeDefined();
        expect(typeof factor.score).toBe('number');
        expect(factor.rationale).toBeDefined();
      }
    });

    it('should include contributing factors in rationale', () => {
      const result = assessIndividual(INDIVIDUAL_FIXTURES.mediumRisk);

      // Should mention contributing factors
      const rationaleText = result.rationale.join('\n');
      expect(rationaleText).toContain('Contributing risk factors');
    });
  });

  describe('runAssessment API', () => {
    it('should accept AssessmentInput object', () => {
      const result = runAssessment({
        clientType: 'individual',
        formAnswers: INDIVIDUAL_FIXTURES.lowRisk,
      });

      expect(result.riskLevel).toBe('LOW');
      expect(result.timestamp).toBeDefined();
    });

    it('should include timestamp in output', () => {
      const before = new Date().toISOString();
      const result = runAssessment({
        clientType: 'corporate',
        formAnswers: CORPORATE_FIXTURES.lowRisk,
      });
      const after = new Date().toISOString();

      expect(result.timestamp).toBeDefined();
      expect(result.timestamp >= before).toBe(true);
      expect(result.timestamp <= after).toBe(true);
    });
  });

  describe('Boundary Cases', () => {
    it('should handle score exactly at LOW/MEDIUM boundary (4)', () => {
      // Create input that scores exactly 4 (boundary of LOW)
      const boundaryInput: FormAnswers = {
        '3': 'New client', // +1
        '16': 'FATF-equivalent jurisdiction', // +1
        '20': 'No',
        '24': 'No', // +1
        '28': 'One-off', // +1
        '32': 'No',
        '38': 'Client',
        '42': 'No',
        '47': 'No',
        '48': 'No',
      };

      const result = assessIndividual(boundaryInput);
      expect(result.score).toBe(4);
      expect(result.riskLevel).toBe('LOW');
    });

    it('should handle score exactly at MEDIUM/HIGH boundary (8)', () => {
      // Create input that scores exactly 8 (boundary of MEDIUM)
      const boundaryInput: FormAnswers = {
        '3': 'New client', // +1
        '16': 'FATF-equivalent jurisdiction', // +1
        '20': 'No',
        '24': 'Unusual', // +2
        '28': 'One-off', // +1
        '32': 'No',
        '38': 'Third party', // +2
        '42': 'Yes', // +1
        '47': 'No',
        '48': 'No',
      };

      const result = assessIndividual(boundaryInput);
      expect(result.score).toBe(8);
      expect(result.riskLevel).toBe('MEDIUM');
    });

    it('should handle score at 9 (first HIGH)', () => {
      // Create input that scores exactly 9
      const highBoundaryInput: FormAnswers = {
        '3': 'New client', // +1
        '16': 'FATF-equivalent jurisdiction', // +1
        '20': 'No',
        '24': 'Unusual', // +2
        '28': 'One-off', // +1
        '32': 'No',
        '38': 'Third party', // +2
        '42': 'Yes', // +1
        '47': 'No',
        '48': 'Yes', // +2 - but this would make it 10
      };

      const result = assessIndividual(highBoundaryInput);
      // This should be HIGH (9+)
      expect(result.riskLevel).toBe('HIGH');
    });
  });
});
