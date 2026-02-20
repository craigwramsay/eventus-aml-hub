import { describe, it, expect } from 'vitest';
import { isValidCompanyNumber, CompaniesHouseError } from '../client';

describe('Companies House Client', () => {
  describe('isValidCompanyNumber', () => {
    it('accepts 8-digit company numbers', () => {
      expect(isValidCompanyNumber('12345678')).toBe(true);
      expect(isValidCompanyNumber('00000001')).toBe(true);
    });

    it('accepts 2-letter + 6-digit Scottish/NI company numbers', () => {
      expect(isValidCompanyNumber('SC123456')).toBe(true);
      expect(isValidCompanyNumber('NI123456')).toBe(true);
      expect(isValidCompanyNumber('OC123456')).toBe(true);
    });

    it('is case-insensitive for letter prefix', () => {
      expect(isValidCompanyNumber('sc123456')).toBe(true);
      expect(isValidCompanyNumber('ni123456')).toBe(true);
    });

    it('rejects numbers with wrong digit count', () => {
      expect(isValidCompanyNumber('1234567')).toBe(false);
      expect(isValidCompanyNumber('123456789')).toBe(false);
      expect(isValidCompanyNumber('SC12345')).toBe(false);
      expect(isValidCompanyNumber('SC1234567')).toBe(false);
    });

    it('rejects empty or whitespace strings', () => {
      expect(isValidCompanyNumber('')).toBe(false);
      expect(isValidCompanyNumber('  ')).toBe(false);
    });

    it('rejects strings with invalid characters', () => {
      expect(isValidCompanyNumber('1234567A')).toBe(false);
      expect(isValidCompanyNumber('ABC12345')).toBe(false);
      expect(isValidCompanyNumber('12-34-56-78')).toBe(false);
    });

    it('rejects single-letter prefix', () => {
      expect(isValidCompanyNumber('S1234567')).toBe(false);
    });
  });

  describe('CompaniesHouseError', () => {
    it('has correct name and message', () => {
      const error = new CompaniesHouseError('Not found', 404);
      expect(error.name).toBe('CompaniesHouseError');
      expect(error.message).toBe('Not found');
      expect(error.statusCode).toBe(404);
    });

    it('works without status code', () => {
      const error = new CompaniesHouseError('API key missing');
      expect(error.message).toBe('API key missing');
      expect(error.statusCode).toBeUndefined();
    });

    it('is an instance of Error', () => {
      const error = new CompaniesHouseError('test');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
