/**
 * LLM Module
 *
 * Configurable LLM client supporting OpenAI and Anthropic.
 * Provider and model are selected via environment variables.
 */

export type {
  LLMProvider,
  LLMConfig,
  ChatMessage,
  MessageRole,
  LLMRequest,
  LLMResponse,
  LLMClient,
} from './types';

export { getLLMConfig, isLLMConfigured } from './config';
export { createLLMClient, getLLMClient, clearLLMClientCache } from './client';
