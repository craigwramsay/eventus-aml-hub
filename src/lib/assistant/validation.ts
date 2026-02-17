/**
 * Assistant Input Validation
 *
 * Ensures no client data is passed to the assistant.
 */

import type { AssistantRequest } from './types';

/** Fields that indicate client data - must be rejected */
const CLIENT_DATA_PATTERNS = [
  // Personal identifiers
  /\b(client[_\s]?name|full[_\s]?name|first[_\s]?name|last[_\s]?name|surname)\b/i,
  /\b(date[_\s]?of[_\s]?birth|dob|birth[_\s]?date)\b/i,
  /\b(address|postcode|zip[_\s]?code|street|city|town)\b/i,
  /\b(national[_\s]?insurance|ni[_\s]?number|ssn|social[_\s]?security)\b/i,
  /\b(passport[_\s]?number|driving[_\s]?licen[cs]e)\b/i,

  // Financial data
  /\b(bank[_\s]?account|account[_\s]?number|sort[_\s]?code|iban|bic|swift)\b/i,
  /\b(source[_\s]?of[_\s]?wealth|sow)\b/i,
  /\b(source[_\s]?of[_\s]?funds|sof)\b/i,

  // Contact information
  /\b(email[_\s]?address|phone[_\s]?number|mobile|telephone)\b/i,

  // Company identifiers
  /\b(company[_\s]?number|crn|registration[_\s]?number)\b/i,
];

/**
 * Patterns that look like actual personal data values
 * (UK postcode, date of birth format, NI number, etc.)
 */
const PERSONAL_DATA_VALUE_PATTERNS = [
  // UK postcode
  /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/i,
  // UK National Insurance number
  /\b[A-Z]{2}\s*\d{2}\s*\d{2}\s*\d{2}\s*[A-Z]\b/i,
  // Dates that look like DOBs (DD/MM/YYYY or similar)
  /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](19|20)\d{2}\b/,
];

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate that the request contains no client data
 */
export function validateRequest(request: AssistantRequest): ValidationResult {
  const textToCheck = [
    request.questionText,
    request.uiContext?.questionId,
    request.uiContext?.questionText,
  ]
    .filter(Boolean)
    .join(' ');

  // Check for client data field names
  for (const pattern of CLIENT_DATA_PATTERNS) {
    if (pattern.test(textToCheck)) {
      return {
        valid: false,
        error: 'Request appears to contain client data fields. The assistant cannot process client-specific information.',
      };
    }
  }

  // Check for actual personal data values
  for (const pattern of PERSONAL_DATA_VALUE_PATTERNS) {
    if (pattern.test(textToCheck)) {
      return {
        valid: false,
        error: 'Request appears to contain personal data. The assistant cannot process client-specific information.',
      };
    }
  }

  // Check for empty question
  if (!request.questionText || request.questionText.trim().length === 0) {
    return {
      valid: false,
      error: 'Question text is required.',
    };
  }

  // Check for reasonable length
  if (request.questionText.length > 2000) {
    return {
      valid: false,
      error: 'Question is too long. Maximum 2000 characters.',
    };
  }

  return { valid: true };
}
