/**
 * Anthropic LLM Client
 */

import type { LLMClient, LLMRequest, LLMResponse, ChatMessage } from './types';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicContentBlock {
  type: 'text';
  text: string;
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string;
  usage: AnthropicUsage;
}

interface AnthropicError {
  type: string;
  error: {
    type: string;
    message: string;
  };
}

export class AnthropicClient implements LLMClient {
  readonly provider = 'anthropic' as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.anthropic.com/v1';
  private readonly apiVersion = '2023-06-01';

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    // Extract system message and convert others to Anthropic format
    let systemPrompt: string | undefined;
    const messages: AnthropicMessage[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.3,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.apiVersion,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as AnthropicError;
      throw new Error(
        `Anthropic API error: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = (await response.json()) as AnthropicResponse;

    // Extract text content
    const textContent = data.content
      .filter((block): block is AnthropicContentBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content: textContent,
      finishReason: data.stop_reason,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          }
        : undefined,
    };
  }
}
