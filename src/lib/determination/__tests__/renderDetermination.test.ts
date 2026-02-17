import { describe, it, expect } from 'vitest';
import { renderDetermination } from '../renderDetermination';
import type { AssessmentRecord } from '../types';

/**
 * Test Fixtures
 *
 * Fixed timestamps ensure deterministic output
 */

const LOW_RISK_ASSESSMENT: AssessmentRecord = {
  id: 'assess-001',
  matter_id: 'matter-001',
  input_snapshot: {
    clientType: 'individual',
    formAnswers: {
      '3': 'New client',
      '16': 'UK',
      '20': 'No',
    },
    formVersion: '1.0',
    assessedAt: '2025-01-15T10:30:00.000Z',
  },
  output_snapshot: {
    score: 2,
    riskLevel: 'LOW',
    automaticOutcome: null,
    riskFactors: [
      {
        factorId: 'existing_or_new_client',
        factorLabel: 'Existing or new client',
        formFieldId: '3',
        selectedAnswer: 'New client',
        score: 1,
        rationale: 'New client: +1',
      },
      {
        factorId: 'instruction_type',
        factorLabel: 'One-off or ongoing instruction',
        formFieldId: '28',
        selectedAnswer: 'One-off',
        score: 1,
        rationale: 'One-off instruction: +1',
      },
      {
        factorId: 'country_of_residence',
        factorLabel: 'Country of residence',
        formFieldId: '16',
        selectedAnswer: 'UK',
        score: 0,
        rationale: 'UK resident: 0',
      },
    ],
    rationale: [
      'Total score: 2',
      'Risk level: LOW (score 0-4)',
    ],
    mandatoryActions: [
      {
        actionId: 'identify_client',
        actionName: 'Identify the client',
        description: 'Record full legal name, date of birth, and residential address',
        category: 'cdd',
        priority: 'required',
      },
      {
        actionId: 'verify_identity',
        actionName: 'Verify identity',
        description: 'Verify using approved method',
        category: 'cdd',
        priority: 'required',
      },
    ],
    timestamp: '2025-01-15T10:30:00.000Z',
  },
  risk_level: 'LOW',
  score: 2,
  created_at: '2025-01-15T10:30:00.000Z',
  finalised_at: null,
};

const MEDIUM_RISK_ASSESSMENT: AssessmentRecord = {
  id: 'assess-002',
  matter_id: 'matter-002',
  input_snapshot: {
    clientType: 'corporate',
    formAnswers: {
      '16': 'New client',
      '26': 'Some resident in the UK / European Economic Area and some resident elsewhere',
    },
    formVersion: '1.0',
    assessedAt: '2025-01-16T14:00:00.000Z',
  },
  output_snapshot: {
    score: 6,
    riskLevel: 'MEDIUM',
    automaticOutcome: null,
    riskFactors: [
      {
        factorId: 'existing_or_new_client',
        factorLabel: 'Existing or new client',
        formFieldId: '16',
        selectedAnswer: 'New client',
        score: 1,
        rationale: 'New client: +1',
      },
      {
        factorId: 'beneficial_owner_residency',
        factorLabel: 'Beneficial owner residency',
        formFieldId: '26',
        selectedAnswer: 'Mixed UK/EEA & elsewhere',
        score: 1,
        rationale: 'Mixed residency: +1',
      },
      {
        factorId: 'opaque_foreign_intermediates',
        factorLabel: 'Opaque or non-equivalent foreign intermediates',
        formFieldId: '28',
        selectedAnswer: 'Yes',
        score: 2,
        rationale: 'Opaque intermediates: +2',
      },
      {
        factorId: 'sector_risk',
        factorLabel: 'Sector risk',
        formFieldId: '49',
        selectedAnswer: 'Higher-risk',
        score: 2,
        rationale: 'Higher-risk sector: +2',
      },
    ],
    rationale: [
      'Total score: 6',
      'Risk level: MEDIUM (score 5-8)',
    ],
    mandatoryActions: [
      {
        actionId: 'identify_client',
        actionName: 'Identify the client',
        description: 'Record company details',
        category: 'cdd',
        priority: 'required',
      },
      {
        actionId: 'sow_form',
        actionName: 'Complete Source of Wealth form',
        description: 'Document source of wealth',
        category: 'sow',
        priority: 'required',
      },
      {
        actionId: 'sof_form',
        actionName: 'Complete Source of Funds form',
        description: 'Document source of funds',
        category: 'sof',
        priority: 'required',
      },
    ],
    timestamp: '2025-01-16T14:00:00.000Z',
  },
  risk_level: 'MEDIUM',
  score: 6,
  created_at: '2025-01-16T14:00:00.000Z',
  finalised_at: '2025-01-17T09:30:00.000Z',
};

const HIGH_RISK_PEP_ASSESSMENT: AssessmentRecord = {
  id: 'assess-003',
  matter_id: 'matter-003',
  input_snapshot: {
    clientType: 'individual',
    formAnswers: {
      '3': 'Existing client',
      '20': 'Yes',
      '32': 'Yes',
    },
    formVersion: '1.0',
    assessedAt: '2025-01-17T16:45:00.000Z',
  },
  output_snapshot: {
    score: 3,
    riskLevel: 'HIGH',
    automaticOutcome: {
      outcomeId: 'HIGH_RISK_EDD_REQUIRED',
      description: 'Automatic HIGH risk classification requiring Enhanced Due Diligence',
      triggeredBy: 'PEP status: Yes',
    },
    riskFactors: [
      {
        factorId: 'pep_or_rca',
        factorLabel: 'Politically Exposed Person (PEP / RCA)',
        formFieldId: '20',
        selectedAnswer: 'Yes',
        score: 0,
        rationale: 'PEP triggers automatic HIGH',
      },
      {
        factorId: 'hrtc_sanctions_nexus',
        factorLabel: 'HRTC / sanctions nexus',
        formFieldId: '32',
        selectedAnswer: 'Yes',
        score: 3,
        rationale: 'HRTC nexus: +3',
      },
    ],
    rationale: [
      'AUTOMATIC OUTCOME: HIGH_RISK_EDD_REQUIRED',
      'PEP status triggers automatic HIGH risk classification',
      'Total score: 3',
    ],
    mandatoryActions: [
      {
        actionId: 'identify_client',
        actionName: 'Identify the client',
        description: 'Record full details',
        category: 'cdd',
        priority: 'required',
      },
      {
        actionId: 'edd_assessment',
        actionName: 'Conduct Enhanced Due Diligence',
        description: 'MLRO approval required before matter proceeds',
        category: 'edd',
        priority: 'required',
      },
      {
        actionId: 'sow_form',
        actionName: 'Complete Source of Wealth form',
        description: 'Document source of wealth with supporting evidence',
        category: 'sow',
        priority: 'required',
      },
      {
        actionId: 'sof_form',
        actionName: 'Complete Source of Funds form',
        description: 'Document source of funds with supporting evidence',
        category: 'sof',
        priority: 'required',
      },
      {
        actionId: 'ongoing_monitoring',
        actionName: 'Apply enhanced ongoing monitoring',
        description: 'Monitor throughout retainer with increased frequency',
        category: 'monitoring',
        priority: 'required',
      },
    ],
    timestamp: '2025-01-17T16:45:00.000Z',
  },
  risk_level: 'HIGH',
  score: 3,
  created_at: '2025-01-17T16:45:00.000Z',
  finalised_at: null,
};

describe('renderDetermination', () => {
  describe('Determinism', () => {
    it('produces identical output for identical LOW risk input', () => {
      const result1 = renderDetermination(LOW_RISK_ASSESSMENT);
      const result2 = renderDetermination(LOW_RISK_ASSESSMENT);
      const result3 = renderDetermination(LOW_RISK_ASSESSMENT);

      expect(result1.determinationText).toBe(result2.determinationText);
      expect(result2.determinationText).toBe(result3.determinationText);
    });

    it('produces identical output for identical MEDIUM risk input', () => {
      const result1 = renderDetermination(MEDIUM_RISK_ASSESSMENT);
      const result2 = renderDetermination(MEDIUM_RISK_ASSESSMENT);

      expect(result1.determinationText).toBe(result2.determinationText);
    });

    it('produces identical output for identical HIGH risk input', () => {
      const result1 = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);
      const result2 = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);

      expect(result1.determinationText).toBe(result2.determinationText);
    });

    it('produces identical sections for identical input', () => {
      const result1 = renderDetermination(LOW_RISK_ASSESSMENT);
      const result2 = renderDetermination(LOW_RISK_ASSESSMENT);

      expect(result1.sections).toEqual(result2.sections);
    });
  });

  describe('LOW Risk Assessment', () => {
    it('includes correct heading', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('CLIENT & MATTER LEVEL RISK ASSESSMENT DETERMINATION');
    });

    it('includes matter reference', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Matter Reference: matter-001');
    });

    it('shows DRAFT status for non-finalised assessment', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Status: DRAFT');
    });

    it('shows correct client type', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Client Type: Individual');
    });

    it('shows correct score and risk level', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Total Score: 2');
      expect(result.determinationText).toContain('Risk Level: LOW RISK');
      expect(result.determinationText).toContain('Threshold: 0-4');
    });

    it('lists triggered risk factors', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Existing or new client (+1)');
      expect(result.determinationText).toContain('One-off or ongoing instruction (+1)');
    });

    it('does not list zero-score factors as triggered', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      // Country of residence scored 0, should not appear in triggered factors
      const triggeredSection = result.sections.find(s => s.title === 'TRIGGERED RISK FACTORS');
      expect(triggeredSection?.body).not.toContain('Country of residence (+0)');
    });

    it('shows Within risk appetite for LOW risk', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Within risk appetite.');
    });

    it('has correct section structure', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      const sectionTitles = result.sections.map(s => s.title);
      expect(sectionTitles).toEqual([
        'HEADING',
        'ASSESSMENT DETAILS',
        'RISK DETERMINATION',
        'TRIGGERED RISK FACTORS',
        'MANDATORY ACTIONS',
        'RISK APPETITE',
      ]);
    });
  });

  describe('MEDIUM Risk Assessment', () => {
    it('shows correct score and risk level', () => {
      const result = renderDetermination(MEDIUM_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Total Score: 6');
      expect(result.determinationText).toContain('Risk Level: MEDIUM RISK');
      expect(result.determinationText).toContain('Threshold: 5-8');
    });

    it('shows FINALISED status when finalised', () => {
      const result = renderDetermination(MEDIUM_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Status: FINALISED');
      expect(result.determinationText).toContain('Finalised Date: 2025-01-17 09:30 UTC');
    });

    it('shows Corporate Entity for corporate client', () => {
      const result = renderDetermination(MEDIUM_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Client Type: Corporate Entity');
    });

    it('shows Within risk appetite for MEDIUM risk', () => {
      const result = renderDetermination(MEDIUM_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Within risk appetite.');
    });

    it('groups mandatory actions by category', () => {
      const result = renderDetermination(MEDIUM_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('[Customer Due Diligence (CDD)]');
      expect(result.determinationText).toContain('[Source of Wealth (SoW)]');
      expect(result.determinationText).toContain('[Source of Funds (SoF)]');
    });
  });

  describe('HIGH Risk Assessment', () => {
    it('shows correct score and risk level', () => {
      const result = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);
      expect(result.determinationText).toContain('Total Score: 3');
      expect(result.determinationText).toContain('Risk Level: HIGH RISK');
      expect(result.determinationText).toContain('Threshold: 9+');
    });

    it('shows automatic outcome', () => {
      const result = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);
      expect(result.determinationText).toContain('AUTOMATIC OUTCOME APPLIED:');
      expect(result.determinationText).toContain('HIGH_RISK_EDD_REQUIRED');
      expect(result.determinationText).toContain('PEP status: Yes');
    });

    it('shows Outside risk appetite for HIGH risk', () => {
      const result = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);
      expect(result.determinationText).toContain(
        'Outside risk appetite unless approved in accordance with AML Policy.'
      );
    });

    it('includes EDD actions', () => {
      const result = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);
      expect(result.determinationText).toContain('[Enhanced Due Diligence (EDD)]');
      expect(result.determinationText).toContain('Conduct Enhanced Due Diligence');
    });

    it('includes monitoring actions', () => {
      const result = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);
      expect(result.determinationText).toContain('[Ongoing Monitoring]');
      expect(result.determinationText).toContain('Apply enhanced ongoing monitoring');
    });
  });

  describe('Timestamp Formatting', () => {
    it('formats timestamps in UTC', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Assessment Date: 2025-01-15 10:30 UTC');
    });

    it('formats finalised timestamp in UTC', () => {
      const result = renderDetermination(MEDIUM_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Finalised Date: 2025-01-17 09:30 UTC');
    });
  });

  describe('Golden String Tests', () => {
    it('LOW risk produces expected exact output', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);

      // Verify key exact strings appear
      expect(result.determinationText).toContain('═'.repeat(70));
      expect(result.determinationText).toContain('─'.repeat(70));
      expect(result.determinationText).toContain('END OF DETERMINATION');
    });

    it('sections contain expected content', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);

      const headingSection = result.sections.find(s => s.title === 'HEADING');
      expect(headingSection?.body).toBe('CLIENT & MATTER LEVEL RISK ASSESSMENT DETERMINATION');

      const riskAppetiteSection = result.sections.find(s => s.title === 'RISK APPETITE');
      expect(riskAppetiteSection?.body).toBe('Within risk appetite.');
    });

    it('HIGH risk appetite section has exact text', () => {
      const result = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);

      const riskAppetiteSection = result.sections.find(s => s.title === 'RISK APPETITE');
      expect(riskAppetiteSection?.body).toBe(
        'Outside risk appetite unless approved in accordance with AML Policy.'
      );
    });
  });

  describe('Language Requirements', () => {
    it('does not contain conditional language', () => {
      const result = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);
      const text = result.determinationText.toLowerCase();

      // These words are banned in mandatory actions
      expect(text).not.toMatch(/\bif\b/);
      expect(text).not.toMatch(/\bconsider\b/);
      expect(text).not.toMatch(/\bwhere required\b/);
      // Note: "may" can appear in policy references, but not in action statements
    });
  });

  describe('Category Ordering', () => {
    it('orders categories correctly: CDD, EDD, SoW, SoF, Monitoring', () => {
      const result = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);
      const text = result.determinationText;

      const cddIndex = text.indexOf('[Customer Due Diligence (CDD)]');
      const eddIndex = text.indexOf('[Enhanced Due Diligence (EDD)]');
      const sowIndex = text.indexOf('[Source of Wealth (SoW)]');
      const sofIndex = text.indexOf('[Source of Funds (SoF)]');
      const monitoringIndex = text.indexOf('[Ongoing Monitoring]');

      expect(cddIndex).toBeLessThan(eddIndex);
      expect(eddIndex).toBeLessThan(sowIndex);
      expect(sowIndex).toBeLessThan(sofIndex);
      expect(sofIndex).toBeLessThan(monitoringIndex);
    });
  });

  describe('Risk Factor Ordering', () => {
    it('orders risk factors by score descending', () => {
      const result = renderDetermination(MEDIUM_RISK_ASSESSMENT);
      const factorsSection = result.sections.find(s => s.title === 'TRIGGERED RISK FACTORS');
      const body = factorsSection?.body || '';

      // +2 factors should come before +1 factors
      const opaqueIndex = body.indexOf('Opaque or non-equivalent foreign intermediates (+2)');
      const sectorIndex = body.indexOf('Sector risk (+2)');
      const newClientIndex = body.indexOf('Existing or new client (+1)');

      // Both +2 factors should be before +1 factors
      expect(opaqueIndex).toBeLessThan(newClientIndex);
      expect(sectorIndex).toBeLessThan(newClientIndex);
    });
  });
});
