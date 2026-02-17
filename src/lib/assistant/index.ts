/**
 * AML Assistant Module
 *
 * Provides explanatory assistance for AML compliance questions.
 * Grounded in curated source excerpts only.
 */

export type {
  AssistantRequest,
  AssistantResponse,
  UIContext,
  Citation,
  FirmContext,
} from './types';

export { validateRequest } from './validation';
export { buildSystemPrompt, extractCitations, NOT_FOUND_RESPONSE } from './prompt';
export { retrieveRelevantSources, extractTopicsFromQuestion } from './sources';
export { processAssistantRequest } from './service';
