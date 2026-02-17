/**
 * LLM Client Factory
 *
 * Creates the appropriate LLM client based on configuration.
 */

import type { LLMClient, LLMConfig } from './types';
import { getLLMConfig } from './config';
import { OpenAIClient } from './openai-client';
import { AnthropicClient } from './anthropic-client';

let cachedClient: LLMClient | null = null;

/**
 * Create an LLM client based on the provided config
 */
export function createLLMClient(config: LLMConfig): LLMClient {
  switch (config.provider) {
    case 'openai':
      return new OpenAIClient(config.model, config.apiKey);
    case 'anthropic':
      return new AnthropicClient(config.model, config.apiKey);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * Get the configured LLM client (cached)
 *
 * @throws Error if LLM is not configured
 */
export function getLLMClient(): LLMClient {
  if (!cachedClient) {
    const config = getLLMConfig();
    cachedClient = createLLMClient(config);
  }
  return cachedClient;
}

/**
 * Clear the cached client (for testing)
 */
export function clearLLMClientCache(): void {
  cachedClient = null;
}
