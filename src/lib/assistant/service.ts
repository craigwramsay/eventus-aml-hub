/**
 * AML Assistant Service
 *
 * Handles the assistant request/response flow.
 */

import type { AssistantRequest, AssistantResponse, FirmContext } from './types';
import { validateRequest } from './validation';
import { buildSystemPrompt, extractCitations } from './prompt';
import { retrieveRelevantSources, retrieveAllSources } from './sources';
import { getLLMClient } from '@/lib/llm';
import type { ChatMessage } from '@/lib/llm';

export interface ProcessRequestResult {
  success: boolean;
  response?: AssistantResponse;
  error?: string;
}

/**
 * Process an assistant request
 *
 * @param request - The assistant request
 * @param firmContext - The firm context
 */
export async function processAssistantRequest(
  request: AssistantRequest,
  firmContext: FirmContext
): Promise<ProcessRequestResult> {
  // Validate the request
  const validation = validateRequest(request);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  try {
    // Retrieve relevant sources
    let sources = await retrieveRelevantSources(
      firmContext.firmId,
      request.questionText
    );

    // If no relevant sources found, try getting all sources
    if (sources.length === 0) {
      sources = await retrieveAllSources(firmContext.firmId);
    }

    // Build the system prompt
    const systemPrompt = buildSystemPrompt(
      firmContext,
      sources,
      request.uiContext
    );

    // Build messages for the LLM
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: request.questionText },
    ];

    // Get LLM client and make request
    const client = getLLMClient();

    const llmResponse = await client.complete({
      messages,
      maxTokens: 1024,
      temperature: 0.2, // Low temperature for factual responses
    });

    // Extract citations
    const citations = extractCitations(sources);

    return {
      success: true,
      response: {
        answer: llmResponse.content,
        citations,
      },
    };
  } catch (error) {
    console.error('Error processing assistant request:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}
