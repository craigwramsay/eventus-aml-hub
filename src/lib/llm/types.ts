/**
 * LLM Provider Types
 */

/** Supported LLM providers */
export type LLMProvider = 'openai' | 'anthropic';

/** LLM configuration from environment */
export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;
}

/** Message role for chat completion */
export type MessageRole = 'system' | 'user' | 'assistant';

/** Chat message */
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/** Request to the LLM */
export interface LLMRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

/** Response from the LLM */
export interface LLMResponse {
  content: string;
  finishReason: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** LLM client interface */
export interface LLMClient {
  provider: LLMProvider;
  model: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}
