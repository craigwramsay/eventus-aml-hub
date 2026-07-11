import { describe, it, expect } from 'vitest';
import { computeChecklistItemInfo } from '../checklist-numbering';

const ACTIONS = [
  { actionId: 'companies_house_search', category: 'cdd', displayText: 'Carry out Companies House search' },
  { actionId: 'confirm_matter_purpose', category: 'cdd', displayText: 'Confirm matter purpose' },
  { actionId: 'identify_and_verify_directors', category: 'cdd', displayText: 'Identify and verify all directors' },
  { actionId: 'identify_and_verify_beneficial_owners', category: 'cdd', displayText: 'Identify and verify all beneficial owners' },
  { actionId: 'sow_form', category: 'sow', displayText: 'Complete SoW form' },
  { actionId: 'sof_form', category: 'sof', displayText: 'Complete SoF form' },
  { actionId: 'edd_pep_check', category: 'edd', displayText: 'Run PEP check' },
];

describe('computeChecklistItemInfo', () => {
  it('numbers CDD actions in input order', () => {
    expect(computeChecklistItemInfo(ACTIONS, 'companies_house_search')?.number).toBe(1);
    expect(computeChecklistItemInfo(ACTIONS, 'identify_and_verify_directors')?.number).toBe(3);
    expect(computeChecklistItemInfo(ACTIONS, 'identify_and_verify_beneficial_owners')?.number).toBe(4);
  });

  it('respects CATEGORY_ORDER (cdd → sow → sof) before EDD', () => {
    expect(computeChecklistItemInfo(ACTIONS, 'sow_form')?.number).toBe(5);
    expect(computeChecklistItemInfo(ACTIONS, 'sof_form')?.number).toBe(6);
  });

  it('continues numbering into EDD after non-EDD', () => {
    expect(computeChecklistItemInfo(ACTIONS, 'edd_pep_check')?.number).toBe(7);
  });

  it('returns label from displayText', () => {
    expect(computeChecklistItemInfo(ACTIONS, 'identify_and_verify_directors')?.label).toBe('Identify and verify all directors');
  });

  it('returns null for unknown action', () => {
    expect(computeChecklistItemInfo(ACTIONS, 'no_such_thing')).toBeNull();
  });

  it('returns null for empty list', () => {
    expect(computeChecklistItemInfo([], 'companies_house_search')).toBeNull();
  });

  it('falls back to description, then actionId, when displayText is missing', () => {
    const actions = [
      { actionId: 'foo', category: 'cdd', description: 'Foo desc' },
      { actionId: 'bar', category: 'cdd' },
    ];
    expect(computeChecklistItemInfo(actions, 'foo')?.label).toBe('Foo desc');
    expect(computeChecklistItemInfo(actions, 'bar')?.label).toBe('bar');
  });
});
