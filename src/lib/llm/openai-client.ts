/**
 * OpenAI LLM Client
 */

import type { LLMClient, LLMRequest, LLMResponse, ChatMessage } from './types';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIChoice {
  index: number;
  message: {
    role: string;
    content: string;
  };
  finish_reason: string;
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
}

interface OpenAIError {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

export class OpenAIClient implements LLMClient {
  readonly provider = 'openai' as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.openai.com/v1';

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const messages: OpenAIMessage[] = request.messages.map((msg: ChatMessage) => ({
      role: msg.role,
      content: msg.content,
    }));

    const body = {
      model: this.model,
      messages,
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.3,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as OpenAIError;
      throw new Error(
        `OpenAI API error: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = (await response.json()) as OpenAIResponse;

    if (!data.choices || data.choices.length === 0) {
      throw new Error('OpenAI returned no choices');
    }

    const choice = data.choices[0];

    return {
      content: choice.message.content,
      finishReason: choice.finish_reason,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }
}
