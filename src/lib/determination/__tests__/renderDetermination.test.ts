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
      expect(result.determinationText).toContain('Risk Level: Low Risk');
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
      const triggeredSection = result.sections.find(s => s.title === 'RISK FACTORS');
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
        'SCORING BREAKDOWN',
        'CDD REQUIREMENTS',
        'RISK FACTORS',
        'POLICY REFERENCES',
        'RISK APPETITE',
      ]);
    });
  });

  describe('MEDIUM Risk Assessment', () => {
    it('shows correct score and risk level', () => {
      const result = renderDetermination(MEDIUM_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Total Score: 6');
      expect(result.determinationText).toContain('Risk Level: Medium Risk');
      expect(result.determinationText).toContain('Threshold: 5-8');
    });

    it('shows FINALISED status when finalised', () => {
      const result = renderDetermination(MEDIUM_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Status: FINALISED');
      expect(result.determinationText).toContain('Finalised Date: 2025-01-17 09:30 UTC');
    });

    it('shows Non-individual for corporate client', () => {
      const result = renderDetermination(MEDIUM_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Client Type: Non-individual');
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
      expect(result.determinationText).toContain('Risk Level: High Risk');
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
      expect(result.determinationText).toContain('MLRO approval required before matter proceeds');
    });

    it('includes monitoring actions', () => {
      const result = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);
      expect(result.determinationText).toContain('[Ongoing Monitoring]');
      expect(result.determinationText).toContain('Monitor throughout retainer with increased frequency');
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
    it('orders categories correctly: CDD, SoW, SoF, Monitoring, EDD', () => {
      const result = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);
      const text = result.determinationText;

      const cddIndex = text.indexOf('[Customer Due Diligence (CDD)]');
      const sowIndex = text.indexOf('[Source of Wealth (SoW)]');
      const sofIndex = text.indexOf('[Source of Funds (SoF)]');
      const monitoringIndex = text.indexOf('[Ongoing Monitoring]');
      const eddIndex = text.indexOf('[Enhanced Due Diligence (EDD)]');

      expect(cddIndex).toBeLessThan(sowIndex);
      expect(sowIndex).toBeLessThan(sofIndex);
      expect(sofIndex).toBeLessThan(monitoringIndex);
      expect(monitoringIndex).toBeLessThan(eddIndex);
    });
  });

  describe('Risk Factor Ordering', () => {
    it('orders risk factors by score descending', () => {
      const result = renderDetermination(MEDIUM_RISK_ASSESSMENT);
      const factorsSection = result.sections.find(s => s.title === 'RISK FACTORS');
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

  describe('Policy References', () => {
    it('includes POLICY REFERENCES section in output', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('POLICY REFERENCES');
    });

    it('includes scoring model authority', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Scoring Model: Eventus Internal Risk Scoring Model v3.8');
    });

    it('includes applicable policy sections header', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).toContain('Applicable Policy Sections:');
    });

    it('includes risk level references for LOW risk', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      const policySection = result.sections.find(s => s.title === 'POLICY REFERENCES');
      expect(policySection?.body).toContain('PCP §4.6');
      expect(policySection?.body).toContain('PCP §7');
      expect(policySection?.body).toContain('MLR 2017 reg. 28');
    });

    it('includes CDD category references for assessments with CDD actions', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      const policySection = result.sections.find(s => s.title === 'POLICY REFERENCES');
      expect(policySection?.body).toContain('MLR 2017 reg. 28(2)');
    });

    it('includes HIGH risk references including EDD', () => {
      const result = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);
      const policySection = result.sections.find(s => s.title === 'POLICY REFERENCES');
      expect(policySection?.body).toContain('PCP §15');
      expect(policySection?.body).toContain('PCP §20');
      expect(policySection?.body).toContain('MLR 2017 regs. 33, 35');
    });

    it('includes automatic outcome references', () => {
      const result = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);
      const policySection = result.sections.find(s => s.title === 'POLICY REFERENCES');
      expect(policySection?.body).toContain('MLR 2017 reg. 35');
    });

    it('includes SoW/SoF category references for MEDIUM risk', () => {
      const result = renderDetermination(MEDIUM_RISK_ASSESSMENT);
      const policySection = result.sections.find(s => s.title === 'POLICY REFERENCES');
      expect(policySection?.body).toContain('PCP §11.2');
      expect(policySection?.body).toContain('PCP §11.3');
      expect(policySection?.body).toContain('LSAG 2025 §5.6');
    });

    it('produces deterministic policy references', () => {
      const result1 = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);
      const result2 = renderDetermination(HIGH_RISK_PEP_ASSESSMENT);
      const policy1 = result1.sections.find(s => s.title === 'POLICY REFERENCES');
      const policy2 = result2.sections.find(s => s.title === 'POLICY REFERENCES');
      expect(policy1?.body).toBe(policy2?.body);
    });
  });

  describe('Jurisdiction Support', () => {
    it('includes Scottish jurisdiction details when specified', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT, { jurisdiction: 'scotland' });
      expect(result.determinationText).toContain('Jurisdiction: Scotland');
      expect(result.determinationText).toContain('Regulator: Law Society of Scotland');
    });

    it('includes English jurisdiction details when specified', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT, { jurisdiction: 'england_and_wales' });
      expect(result.determinationText).toContain('Jurisdiction: England & Wales');
      expect(result.determinationText).toContain('Regulator: Solicitors Regulation Authority (SRA)');
    });

    it('omits jurisdiction when not specified', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).not.toContain('Jurisdiction:');
      expect(result.determinationText).not.toContain('Regulator:');
    });

    it('remains deterministic with jurisdiction', () => {
      const result1 = renderDetermination(LOW_RISK_ASSESSMENT, { jurisdiction: 'scotland' });
      const result2 = renderDetermination(LOW_RISK_ASSESSMENT, { jurisdiction: 'scotland' });
      expect(result1.determinationText).toBe(result2.determinationText);
    });

    it('reads jurisdiction from input_snapshot when options not provided (Gap 5)', () => {
      const assessmentWithJurisdiction: AssessmentRecord = {
        ...LOW_RISK_ASSESSMENT,
        input_snapshot: {
          ...LOW_RISK_ASSESSMENT.input_snapshot,
          jurisdiction: 'scotland',
        },
      };

      const result = renderDetermination(assessmentWithJurisdiction);
      expect(result.determinationText).toContain('Jurisdiction: Scotland');
      expect(result.determinationText).toContain('Regulator: Law Society of Scotland');
    });

    it('prefers options jurisdiction over snapshot jurisdiction', () => {
      const assessmentWithJurisdiction: AssessmentRecord = {
        ...LOW_RISK_ASSESSMENT,
        input_snapshot: {
          ...LOW_RISK_ASSESSMENT.input_snapshot,
          jurisdiction: 'scotland',
        },
      };

      const result = renderDetermination(assessmentWithJurisdiction, { jurisdiction: 'england_and_wales' });
      expect(result.determinationText).toContain('Jurisdiction: England & Wales');
    });
  });

  describe('EDD Triggers Section (Gap 1)', () => {
    const ASSESSMENT_WITH_TRIGGERS: AssessmentRecord = {
      ...LOW_RISK_ASSESSMENT,
      output_snapshot: {
        ...LOW_RISK_ASSESSMENT.output_snapshot,
        eddTriggers: [
          {
            triggerId: 'client_account',
            description: 'Matter involves receipt of funds into Eventus\' client account',
            authority: 'PCP §20 §1.6; PWRA §2.4',
            triggeredBy: 'Field 36: "Yes"',
          },
        ],
      },
    };

    it('includes EDD TRIGGERS section when triggers present', () => {
      const result = renderDetermination(ASSESSMENT_WITH_TRIGGERS);
      expect(result.determinationText).toContain('EDD TRIGGERS');
      expect(result.determinationText).toContain('client account');
    });

    it('shows trigger authority', () => {
      const result = renderDetermination(ASSESSMENT_WITH_TRIGGERS);
      expect(result.determinationText).toContain('PCP §20');
    });

    it('omits EDD TRIGGERS section when no triggers', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).not.toContain('EDD TRIGGERS');
    });

    it('places EDD TRIGGERS after CDD REQUIREMENTS and before RISK FACTORS', () => {
      const result = renderDetermination(ASSESSMENT_WITH_TRIGGERS);
      const text = result.determinationText;
      const cddReqIndex = text.indexOf('CDD REQUIREMENTS');
      const eddTriggersIndex = text.indexOf('EDD TRIGGERS');
      const riskFactorsIndex = text.indexOf('RISK FACTORS');
      expect(eddTriggersIndex).toBeGreaterThan(cddReqIndex);
      expect(eddTriggersIndex).toBeLessThan(riskFactorsIndex);
    });
  });

  describe('Evidence Types in Actions (Gap 4)', () => {
    const ASSESSMENT_WITH_EVIDENCE: AssessmentRecord = {
      ...MEDIUM_RISK_ASSESSMENT,
      output_snapshot: {
        ...MEDIUM_RISK_ASSESSMENT.output_snapshot,
        mandatoryActions: [
          ...MEDIUM_RISK_ASSESSMENT.output_snapshot.mandatoryActions,
          {
            actionId: 'obtain_evidence',
            actionName: 'Obtain Evidence',
            description: 'Obtain supporting evidence aligned to the declared source of wealth',
            category: 'sow',
            priority: 'required',
            evidenceTypes: ['payslips or tax returns', 'bank statements'],
          },
        ],
      },
    };

    it('shows evidence types under actions that have them', () => {
      const result = renderDetermination(ASSESSMENT_WITH_EVIDENCE);
      expect(result.determinationText).toContain('Supporting evidence:');
      expect(result.determinationText).toContain('payslips or tax returns');
      expect(result.determinationText).toContain('bank statements');
    });
  });

  describe('Warnings Section (Gap 2)', () => {
    const ASSESSMENT_WITH_WARNINGS: AssessmentRecord = {
      ...LOW_RISK_ASSESSMENT,
      output_snapshot: {
        ...LOW_RISK_ASSESSMENT.output_snapshot,
        warnings: [
          {
            warningId: 'excluded_entity_trust',
            message: 'Entity type "Trust" falls outside the standard CDD ruleset. This matter must be assessed by reference to the Eventus AML PCPs and escalated to the MLRO for bespoke assessment.',
            authority: 'CDD Ruleset - Exclusions; Eventus AML PCPs',
          },
        ],
      },
    };

    it('includes WARNINGS section when warnings present', () => {
      const result = renderDetermination(ASSESSMENT_WITH_WARNINGS);
      expect(result.determinationText).toContain('WARNINGS');
      expect(result.determinationText).toContain('MLRO ESCALATION REQUIRED');
    });

    it('shows warning message and authority', () => {
      const result = renderDetermination(ASSESSMENT_WITH_WARNINGS);
      expect(result.determinationText).toContain('Trust');
      expect(result.determinationText).toContain('CDD Ruleset - Exclusions');
    });

    it('omits WARNINGS section when no warnings', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).not.toContain('WARNINGS');
    });

    it('places WARNINGS after CDD REQUIREMENTS and before RISK FACTORS', () => {
      const result = renderDetermination(ASSESSMENT_WITH_WARNINGS);
      const text = result.determinationText;
      const cddReqIndex = text.indexOf('CDD REQUIREMENTS');
      const warningsIndex = text.indexOf('WARNINGS');
      const riskFactorsIndex = text.indexOf('RISK FACTORS');
      expect(warningsIndex).toBeGreaterThan(cddReqIndex);
      expect(warningsIndex).toBeLessThan(riskFactorsIndex);
    });
  });

  describe('Recommended Priority Label', () => {
    const ASSESSMENT_WITH_RECOMMENDED: AssessmentRecord = {
      ...LOW_RISK_ASSESSMENT,
      output_snapshot: {
        ...LOW_RISK_ASSESSMENT.output_snapshot,
        mandatoryActions: [
          {
            actionId: 'sow_form',
            actionName: 'Source of Wealth',
            description: 'Complete and retain Source of Wealth Form',
            category: 'sow',
            priority: 'required',
          },
          {
            actionId: 'sow_evidence_new_client',
            actionName: 'Source of Wealth Evidence',
            description: 'Obtain supporting evidence',
            category: 'sow',
            priority: 'recommended',
          },
        ],
      },
    };

    it('shows [Recommended] label for recommended priority actions', () => {
      const result = renderDetermination(ASSESSMENT_WITH_RECOMMENDED);
      expect(result.determinationText).toContain('[Recommended]');
    });

    it('does not show [Recommended] for required actions', () => {
      const result = renderDetermination(ASSESSMENT_WITH_RECOMMENDED);
      // Source of Wealth form is required, should not have [Recommended]
      const lines = result.determinationText.split('\n');
      const sowFormLine = lines.find(l => l.includes('Source of Wealth') && !l.includes('Evidence'));
      expect(sowFormLine).not.toContain('[Recommended]');
    });
  });

  describe('displayText Support', () => {
    const ASSESSMENT_WITH_DISPLAY_TEXT: AssessmentRecord = {
      ...LOW_RISK_ASSESSMENT,
      output_snapshot: {
        ...LOW_RISK_ASSESSMENT.output_snapshot,
        mandatoryActions: [
          {
            actionId: 'identify_client',
            actionName: 'Identify the client',
            description: 'Record full legal name, date of birth, and residential address',
            displayText: 'Identify the client by recording their full legal name, date of birth, and residential address.',
            category: 'cdd',
            priority: 'required',
          },
          {
            actionId: 'verify_identity',
            actionName: 'Verify identity',
            description: 'Verify using approved method',
            displayText: 'Verify the client\'s identity using one approved verification method.',
            category: 'cdd',
            priority: 'required',
          },
        ],
      },
    };

    it('uses displayText when available', () => {
      const result = renderDetermination(ASSESSMENT_WITH_DISPLAY_TEXT);
      expect(result.determinationText).toContain(
        'Identify the client by recording their full legal name, date of birth, and residential address.'
      );
      expect(result.determinationText).toContain(
        'Verify the client\'s identity using one approved verification method.'
      );
    });

    it('renders numbered format with displayText', () => {
      const result = renderDetermination(ASSESSMENT_WITH_DISPLAY_TEXT);
      expect(result.determinationText).toContain('1. Identify the client by recording');
      expect(result.determinationText).toContain('2. Verify the client\'s identity');
    });

    it('falls back to description when displayText is absent', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      // LOW_RISK_ASSESSMENT has no displayText, should use description
      expect(result.determinationText).toContain('Record full legal name');
    });

    it('suppresses evidence types when displayText is present', () => {
      const assessmentWithDisplayAndEvidence: AssessmentRecord = {
        ...MEDIUM_RISK_ASSESSMENT,
        output_snapshot: {
          ...MEDIUM_RISK_ASSESSMENT.output_snapshot,
          mandatoryActions: [
            {
              actionId: 'obtain_evidence',
              actionName: 'Obtain Evidence',
              description: 'Obtain supporting evidence',
              displayText: 'Obtain supporting evidence (payslips, bank statements).',
              category: 'sow',
              priority: 'required',
              evidenceTypes: ['payslips', 'bank statements'],
            },
          ],
        },
      };
      const result = renderDetermination(assessmentWithDisplayAndEvidence);
      // Should use displayText, not show separate evidence types block
      expect(result.determinationText).toContain('Obtain supporting evidence (payslips, bank statements).');
      expect(result.determinationText).not.toContain('Supporting evidence:');
    });
  });

  describe('Verification Evidence Section', () => {
    it('includes VERIFICATION EVIDENCE section when evidence provided', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT, {
        evidence: [
          {
            evidence_type: 'companies_house',
            label: 'CH Report - 12345678',
            source: 'Companies House',
            data: {
              profile: {
                company_name: 'Test Company Ltd',
                company_status: 'active',
                company_number: '12345678',
              },
              officers: [{ name: 'John Smith' }, { name: 'Jane Doe' }],
            },
            created_at: '2025-01-20T12:00:00.000Z',
          },
        ],
      });
      expect(result.determinationText).toContain('VERIFICATION EVIDENCE');
      expect(result.determinationText).toContain('Test Company Ltd');
      expect(result.determinationText).toContain('active');
      expect(result.determinationText).toContain('2 active officer(s)');
    });

    it('shows file uploads in evidence', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT, {
        evidence: [
          {
            evidence_type: 'file_upload',
            label: 'passport_scan.pdf',
            source: 'Manual',
            data: null,
            created_at: '2025-01-21T14:30:00.000Z',
          },
        ],
      });
      expect(result.determinationText).toContain('VERIFICATION EVIDENCE');
      expect(result.determinationText).toContain('File: passport_scan.pdf');
      expect(result.determinationText).toContain('Uploaded: 2025-01-21 14:30 UTC');
    });

    it('shows manual records in evidence', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT, {
        evidence: [
          {
            evidence_type: 'manual_record',
            label: 'Passport verified in person',
            source: 'Manual',
            data: null,
            created_at: '2025-01-22T09:00:00.000Z',
          },
        ],
      });
      expect(result.determinationText).toContain('Passport verified in person');
      expect(result.determinationText).toContain('Recorded: 2025-01-22 09:00 UTC');
    });

    it('omits VERIFICATION EVIDENCE section when no evidence', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT);
      expect(result.determinationText).not.toContain('VERIFICATION EVIDENCE');
    });

    it('omits VERIFICATION EVIDENCE section with empty array', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT, { evidence: [] });
      expect(result.determinationText).not.toContain('VERIFICATION EVIDENCE');
    });

    it('places VERIFICATION EVIDENCE before RISK FACTORS', () => {
      const result = renderDetermination(LOW_RISK_ASSESSMENT, {
        evidence: [
          {
            evidence_type: 'file_upload',
            label: 'test.pdf',
            source: 'Manual',
            data: null,
            created_at: '2025-01-22T09:00:00.000Z',
          },
        ],
      });
      const text = result.determinationText;
      const evidenceIndex = text.indexOf('VERIFICATION EVIDENCE');
      const riskFactorsIndex = text.indexOf('RISK FACTORS');
      expect(evidenceIndex).toBeGreaterThan(-1);
      expect(evidenceIndex).toBeLessThan(riskFactorsIndex);
    });
  });
});
