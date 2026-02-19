import { describe, it, expect } from 'vitest';
import { validateRequest } from '../validation';
import type { AssistantRequest } from '../types';

function makeRequest(questionText: string): AssistantRequest {
  return { questionText };
}

describe('Assistant Validation', () => {
  describe('SoW/SoF false positive fix', () => {
    it('allows "What does SoF mean?"', () => {
      const result = validateRequest(makeRequest('What does SoF mean?'));
      expect(result.valid).toBe(true);
    });

    it('allows "What are SoW verification requirements?"', () => {
      const result = validateRequest(makeRequest('What are SoW verification requirements?'));
      expect(result.valid).toBe(true);
    });

    it('allows "Explain source of funds obligations"', () => {
      const result = validateRequest(makeRequest('Explain source of funds obligations'));
      expect(result.valid).toBe(true);
    });

    it('allows "What is source of wealth?"', () => {
      const result = validateRequest(makeRequest('What is source of wealth?'));
      expect(result.valid).toBe(true);
    });

    it('rejects "SoF: £50,000 from salary"', () => {
      const result = validateRequest(makeRequest('SoF: £50,000 from salary'));
      expect(result.valid).toBe(false);
    });

    it('rejects "SoW = inheritance from father"', () => {
      const result = validateRequest(makeRequest('SoW = inheritance from father'));
      expect(result.valid).toBe(false);
    });

    it('rejects "source of funds: savings"', () => {
      const result = validateRequest(makeRequest('source of funds: savings'));
      expect(result.valid).toBe(false);
    });
  });

  describe('Currency amounts', () => {
    it('rejects messages with GBP amounts', () => {
      const result = validateRequest(makeRequest('The client has £50,000 in savings'));
      expect(result.valid).toBe(false);
    });

    it('rejects messages with USD amounts', () => {
      const result = validateRequest(makeRequest('Transfer of $1,200,000'));
      expect(result.valid).toBe(false);
    });

    it('rejects messages with EUR amounts', () => {
      const result = validateRequest(makeRequest('Funds of €250,000.00'));
      expect(result.valid).toBe(false);
    });
  });

  describe('Still blocks actual client data', () => {
    it('rejects client name fields', () => {
      const result = validateRequest(makeRequest('client_name: John Smith'));
      expect(result.valid).toBe(false);
    });

    it('rejects bank account numbers', () => {
      const result = validateRequest(makeRequest('bank account 12345678'));
      expect(result.valid).toBe(false);
    });

    it('rejects postcodes', () => {
      const result = validateRequest(makeRequest('Lives at EH1 1BB'));
      expect(result.valid).toBe(false);
    });
  });

  describe('Valid regulatory questions', () => {
    it('allows general AML questions', () => {
      const result = validateRequest(makeRequest('What are the CDD requirements under MLR 2017?'));
      expect(result.valid).toBe(true);
    });

    it('allows policy questions', () => {
      const result = validateRequest(makeRequest('When is EDD required?'));
      expect(result.valid).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('rejects empty question', () => {
      const result = validateRequest(makeRequest(''));
      expect(result.valid).toBe(false);
    });

    it('rejects very long question', () => {
      const result = validateRequest(makeRequest('x'.repeat(2001)));
      expect(result.valid).toBe(false);
    });
  });
});
