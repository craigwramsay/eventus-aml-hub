import { describe, it, expect } from 'vitest';
import { normalizePersonName } from '../person-name-normaliser';

describe('normalizePersonName', () => {
  it('lowercases and trims', () => {
    expect(normalizePersonName('  John Smith  ')).toBe('john smith');
  });

  it('strips Mr/Mrs/Ms honorifics', () => {
    expect(normalizePersonName('Mr John Smith')).toBe('john smith');
    expect(normalizePersonName('Mrs Jane Doe')).toBe('jane doe');
    expect(normalizePersonName('Ms. Alex Brown')).toBe('alex brown');
  });

  it('strips Dr/Prof/Rev', () => {
    expect(normalizePersonName('Dr Watson')).toBe('watson');
    expect(normalizePersonName('Prof. Plum')).toBe('plum');
    expect(normalizePersonName('Rev John Doe')).toBe('john doe');
  });

  it('does not chew into words that start with an honorific', () => {
    expect(normalizePersonName('Drake Carter')).toBe('drake carter');
    expect(normalizePersonName('Missy Elliott')).toBe('missy elliott');
  });

  it('flips Companies House "Surname, Forename" format', () => {
    expect(normalizePersonName('Smith, John')).toBe('john smith');
    expect(normalizePersonName('Smith, John Andrew')).toBe('john andrew smith');
    expect(normalizePersonName('SMITH, JOHN')).toBe('john smith');
  });

  it('handles honorifics in flipped format', () => {
    expect(normalizePersonName('Smith, Mr John')).toBe('john smith');
  });

  it('leaves multi-comma strings alone (ambiguous)', () => {
    expect(normalizePersonName('Smith, John, II')).toBe('smith john ii');
  });

  it('matches director from CH against Amiqus-stored name', () => {
    // CH typically: "SMITH, JOHN" ; Amiqus typically: "Mr John Smith"
    expect(normalizePersonName('SMITH, JOHN')).toBe(
      normalizePersonName('Mr John Smith')
    );
  });

  it('preserves hyphens and apostrophes', () => {
    expect(normalizePersonName("Mary-Jane O'Neill")).toBe("mary-jane o'neill");
  });
});
