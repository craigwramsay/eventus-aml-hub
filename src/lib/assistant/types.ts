/**
 * AML Assistant Types
 */

/** UI context passed with a question */
export interface UIContext {
  /** Question ID from the form */
  questionId?: string;
  /** Question text for context */
  questionText?: string;
}

/** Request to the assistant */
export interface AssistantRequest {
  /** The user's question */
  questionText: string;
  /** Optional UI context */
  uiContext?: UIContext;
}

/** Citation from source materials */
export interface Citation {
  sourceName: string;
  sectionRef: string;
}

/** Response from the assistant */
export interface AssistantResponse {
  /** The assistant's answer */
  answer: string;
  /** Citations from source materials */
  citations: Citation[];
}

/** Firm context for the assistant */
export interface FirmContext {
  firmId: string;
  firmName: string;
}
