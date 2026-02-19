/**
 * Password Policy for Cyber Essentials Plus
 *
 * Minimum 12 characters, mixed case, digit, special character.
 * Rejects top 1000 common passwords.
 */

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

const MIN_LENGTH = 12;

// Top common passwords (abbreviated list — extend as needed)
const COMMON_PASSWORDS = new Set([
  'password1234', 'password12345', 'qwerty123456',
  'letmein12345', 'welcome12345', 'monkey123456',
  'dragon123456', 'master123456', 'admin1234567',
  'changeme1234', 'password!234', 'iloveyou1234',
  'sunshine1234', 'trustno1!234', 'football1234',
  'baseball1234', 'shadow123456', 'michael12345',
  'jennifer1234', 'abcdef123456', 'abc123456789',
  '123456789012', 'qwertyuiopas',
]);

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < MIN_LENGTH) {
    errors.push(`Password must be at least ${MIN_LENGTH} characters`);
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one digit');
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('This password is too common. Please choose a different one');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
