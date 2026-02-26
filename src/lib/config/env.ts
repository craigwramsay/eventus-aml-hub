/**
 * Environment Variable Validation
 *
 * Validates all required environment variables at startup.
 * Import this in layout.tsx to catch missing config early.
 */

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

const OPTIONAL_VARS = [
  'ASSISTANT_LLM_PROVIDER',
  'ASSISTANT_LLM_MODEL',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'COMPANIES_HOUSE_API_KEY',
  'CLIO_CLIENT_ID',
  'CLIO_CLIENT_SECRET',
  'CLIO_REGION',
  'AMIQUS_API_KEY',
] as const;

export function validateEnv(): void {
  const missing: string[] = [];

  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Check .env.local or your deployment configuration.'
    );
  }
}

export function getOptionalEnvWarnings(): string[] {
  const warnings: string[] = [];

  for (const varName of OPTIONAL_VARS) {
    if (!process.env[varName]) {
      warnings.push(`Optional env var ${varName} is not set`);
    }
  }

  return warnings;
}
