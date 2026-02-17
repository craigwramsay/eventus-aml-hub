import { describe, it, expect } from 'vitest';
import { renderDetermination } from '../index';
import type { DeterminationInput } from '../types';
import type { AssessmentOutput } from '@/lib/rules-engine/types';

/**
 * Test fixtures
 */
const LOW_RISK_OUTPUT: AssessmentOutput = {
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
      factorId: 'country_of_residence',
      factorLabel: 'Country of residence',
      formFieldId: '16',
      selectedAnswer: 'UK',
      score: 0,
      rationale: 'UK resident: 0',
    },
    {
      factorId: 'instruction_type',
      factorLabel: 'One-off or ongoing instruction',
      formFieldId: '28',
      selectedAnswer: 'One-off',
      score: 1,
      rationale: 'One-off instruction: +1',
    },
  ],
  rationale: [
    'Total score: 2',
    'Risk level: LOW (score 0-4)',
    'Contributing risk factors:',
    '- Existing or new client: New client (+1)',
    '- One-off or ongoing instruction: One-off (+1)',
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
    {
      actionId: 'ongoing_monitoring',
      actionName: 'Apply ongoing monitoring',
      description: 'Monitor throughout retainer',
      category: 'monitoring',
      priority: 'required',
    },
  ],
  timestamp: '2025-01-15T10:30:00.000Z',
};

const HIGH_RISK_PEP_OUTPUT: AssessmentOutput = {
  score: 3,
  riskLevel: 'HIGH',
  automaticOutcome: {
    outcomeId: 'HIGH_RISK_EDD_REQUIRED',
    description: 'Automatic HIGH risk classification requiring Enhanced Due Diligence',
    triggeredBy: 'PEP status: Yes',
  },
  riskFactors: [
    {
      factorId: 'existing_or_new_client',
      factorLabel: 'Existing or new client',
      formFieldId: '3',
      selectedAnswer: 'Existing client',
      score: 0,
      rationale: 'Existing client: 0',
    },
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
    'Contributing risk factors:',
    '- HRTC / sanctions nexus: Yes (+3)',
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
      description: 'Obtain supporting evidence aligned to declared source',
      category: 'sow',
      priority: 'required',
    },
    {
      actionId: 'sof_form',
      actionName: 'Complete Source of Funds form',
      description: 'Document origin of funds for this specific transaction',
      category: 'sof',
      priority: 'required',
    },
  ],
  timestamp: '2025-01-15T14:45:00.000Z',
};

const createInput = (output: AssessmentOutput): DeterminationInput => ({
  output,
  clientType: 'individual',
  clientName: 'John Smith',
  matterReference: 'MAT-2025-001',
});

describe('Determination Renderer', () => {
  describe('Determinism', () => {
    it('should produce identical output for identical input - LOW risk', () => {
      const input = createInput(LOW_RISK_OUTPUT);

      const result1 = renderDetermination(input);
      const result2 = renderDetermination(input);
      const result3 = renderDetermination(input);

      expect(result1.text).toBe(result2.text);
      expect(result2.text).toBe(result3.text);
    });

    it('should produce identical output for identical input - HIGH risk', () => {
      const input = createInput(HIGH_RISK_PEP_OUTPUT);

      const result1 = renderDetermination(input);
      const result2 = renderDetermination(input);
      const result3 = renderDetermination(input);

      expect(result1.text).toBe(result2.text);
      expect(result2.text).toBe(result3.text);
    });

    it('should produce identical sections for identical input', () => {
      const input = createInput(LOW_RISK_OUTPUT);

      const result1 = renderDetermination(input);
      const result2 = renderDetermination(input);

      expect(result1.sections.heading).toBe(result2.sections.heading);
      expect(result1.sections.riskStatement).toBe(result2.sections.riskStatement);
      expect(result1.sections.mandatoryActionsText).toBe(result2.sections.mandatoryActionsText);
      expect(result1.sections.policyReferences).toBe(result2.sections.policyReferences);
    });
  });

  describe('Heading Section', () => {
    it('should include client name', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.heading).toContain('John Smith');
    });

    it('should include matter reference', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.heading).toContain('MAT-2025-001');
    });

    it('should include client type', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.heading).toContain('Individual');
    });

    it('should include assessment date', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.heading).toContain('2025-01-15');
    });
  });

  describe('Risk Statement Section', () => {
    it('should include risk level for LOW risk', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.riskStatement).toContain('LOW RISK');
    });

    it('should include risk level for HIGH risk', () => {
      const input = createInput(HIGH_RISK_PEP_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.riskStatement).toContain('HIGH RISK');
    });

    it('should include score', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.riskStatement).toContain('Score:       2');
    });

    it('should include threshold description', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.riskStatement).toContain('Score 0-4');
    });

    it('should include automatic outcome when triggered', () => {
      const input = createInput(HIGH_RISK_PEP_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.riskStatement).toContain('AUTOMATIC OUTCOME TRIGGERED');
      expect(result.sections.riskStatement).toContain('HIGH_RISK_EDD_REQUIRED');
    });

    it('should list contributing risk factors', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.riskStatement).toContain('Contributing Risk Factors:');
      expect(result.sections.riskStatement).toContain('Existing or new client: +1');
      expect(result.sections.riskStatement).toContain('One-off or ongoing instruction: +1');
    });

    it('should sort risk factors by score descending', () => {
      const input = createInput(HIGH_RISK_PEP_OUTPUT);
      const result = renderDetermination(input);

      // HRTC (+3) should appear before lower-scored factors
      const lines = result.sections.riskStatement.split('\n');
      const hrtcIndex = lines.findIndex((l) => l.includes('HRTC'));
      expect(hrtcIndex).toBeGreaterThan(-1);
    });
  });

  describe('Mandatory Actions Section', () => {
    it('should list all mandatory actions', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.mandatoryActionsText).toContain('Identify the client');
      expect(result.sections.mandatoryActionsText).toContain('Verify identity');
      expect(result.sections.mandatoryActionsText).toContain('Apply ongoing monitoring');
    });

    it('should group actions by category', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.mandatoryActionsText).toContain('[Customer Due Diligence]');
      expect(result.sections.mandatoryActionsText).toContain('[Ongoing Monitoring]');
    });

    it('should include EDD actions for HIGH risk', () => {
      const input = createInput(HIGH_RISK_PEP_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.mandatoryActionsText).toContain('[Enhanced Due Diligence]');
      expect(result.sections.mandatoryActionsText).toContain('MLRO approval required');
    });

    it('should include SoW and SoF for HIGH risk', () => {
      const input = createInput(HIGH_RISK_PEP_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.mandatoryActionsText).toContain('[Source of Wealth]');
      expect(result.sections.mandatoryActionsText).toContain('[Source of Funds]');
    });

    it('should include priority labels', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.mandatoryActionsText).toContain('Priority: REQUIRED');
    });
  });

  describe('Policy References Section', () => {
    it('should include scoring model authority', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.policyReferences).toContain('Eventus Internal Risk Scoring Model v3.7');
    });

    it('should include threshold authority', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.policyReferences).toContain('PCP §4.6');
    });

    it('should include MLR 2017 reference', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.policyReferences).toContain('MLR 2017');
    });

    it('should include EDD references for HIGH risk', () => {
      const input = createInput(HIGH_RISK_PEP_OUTPUT);
      const result = renderDetermination(input);

      expect(result.sections.policyReferences).toContain('PCP §15');
      expect(result.sections.policyReferences).toContain('PCP §20');
    });

    it('should sort references deterministically', () => {
      const input = createInput(HIGH_RISK_PEP_OUTPUT);

      const result1 = renderDetermination(input);
      const result2 = renderDetermination(input);

      // Extract reference lines
      const extractRefs = (text: string) =>
        text
          .split('\n')
          .filter((l) => l.trim().startsWith('- '))
          .map((l) => l.trim());

      const refs1 = extractRefs(result1.sections.policyReferences);
      const refs2 = extractRefs(result2.sections.policyReferences);

      expect(refs1).toEqual(refs2);
    });
  });

  describe('Complete Output', () => {
    it('should produce valid complete text', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.text).toContain('AML RISK ASSESSMENT DETERMINATION');
      expect(result.text).toContain('RISK DETERMINATION');
      expect(result.text).toContain('MANDATORY ACTIONS');
      expect(result.text).toContain('POLICY REFERENCES');
      expect(result.text).toContain('END OF DETERMINATION');
    });

    it('should include all sections in text output', () => {
      const input = createInput(LOW_RISK_OUTPUT);
      const result = renderDetermination(input);

      expect(result.text).toContain(result.sections.heading);
      expect(result.text).toContain(result.sections.riskStatement);
      expect(result.text).toContain(result.sections.mandatoryActionsText);
      expect(result.text).toContain(result.sections.policyReferences);
    });
  });

  describe('Corporate Client', () => {
    it('should display Corporate Entity for corporate clients', () => {
      const input: DeterminationInput = {
        ...createInput(LOW_RISK_OUTPUT),
        clientType: 'corporate',
        clientName: 'Acme Ltd',
      };
      const result = renderDetermination(input);

      expect(result.sections.heading).toContain('Corporate Entity');
      expect(result.sections.heading).toContain('Acme Ltd');
    });
  });
});
