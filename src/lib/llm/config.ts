/**
 * LLM Configuration
 *
 * Reads configuration from environment variables.
 * Throws hard errors if configuration is invalid.
 */

import type { LLMConfig, LLMProvider } from './types';

const SUPPORTED_PROVIDERS: LLMProvider[] = ['openai', 'anthropic'];

/**
 * Get LLM configuration from environment variables
 *
 * Required environment variables:
 * - ASSISTANT_LLM_PROVIDER: 'openai' | 'anthropic'
 * - ASSISTANT_LLM_MODEL: Model identifier (e.g., 'gpt-4o', 'claude-sonnet-4-20250514')
 * - OPENAI_API_KEY or ANTHROPIC_API_KEY: API key for the selected provider
 *
 * @throws Error if configuration is missing or invalid
 */
export function getLLMConfig(): LLMConfig {
  const provider = process.env.ASSISTANT_LLM_PROVIDER;
  const model = process.env.ASSISTANT_LLM_MODEL;

  // Validate provider
  if (!provider) {
    throw new Error(
      'ASSISTANT_LLM_PROVIDER environment variable is required. ' +
        `Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`
    );
  }

  if (!SUPPORTED_PROVIDERS.includes(provider as LLMProvider)) {
    throw new Error(
      `Unsupported LLM provider: "${provider}". ` +
        `Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`
    );
  }

  // Validate model
  if (!model) {
    throw new Error(
      'ASSISTANT_LLM_MODEL environment variable is required. ' +
        'Example: "gpt-4o" for OpenAI, "claude-sonnet-4-20250514" for Anthropic'
    );
  }

  // Get API key for the provider
  const apiKey = getApiKeyForProvider(provider as LLMProvider);

  return {
    provider: provider as LLMProvider,
    model,
    apiKey,
  };
}

/**
 * Get API key for the specified provider
 *
 * @throws Error if API key is not set
 */
function getApiKeyForProvider(provider: LLMProvider): string {
  switch (provider) {
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          'OPENAI_API_KEY environment variable is required when using OpenAI provider'
        );
      }
      return apiKey;
    }
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'ANTHROPIC_API_KEY environment variable is required when using Anthropic provider'
        );
      }
      return apiKey;
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Check if LLM is configured (for conditional UI rendering)
 * Does not throw - returns false if not configured
 */
export function isLLMConfigured(): boolean {
  try {
    getLLMConfig();
    return true;
  } catch {
    return false;
  }
}
