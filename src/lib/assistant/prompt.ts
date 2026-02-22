/**
 * Assistant System Prompt Builder
 *
 * Creates the system prompt for the AML assistant.
 */

import type { FirmContext, UIContext } from './types';
import type { AssistantSource } from '@/lib/supabase/types';

/** The exact response when information is not found */
export const NOT_FOUND_RESPONSE =
  'That information is not contained in the provided materials.';

/**
 * Build the system prompt for the assistant
 */
export function buildSystemPrompt(
  firmContext: FirmContext,
  sources: AssistantSource[],
  uiContext?: UIContext
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${firmContext.firmName} AML Compliance Assistant`);
  lines.push('');

  // Role definition
  lines.push('## Role');
  if (firmContext.jurisdiction) {
    const jurisdictionLabels: Record<string, string> = {
      scotland: 'Scottish',
      england_and_wales: 'English & Welsh',
    };
    const regulators: Record<string, string> = {
      scotland: 'Law Society of Scotland',
      england_and_wales: 'Solicitors Regulation Authority (SRA)',
    };
    const label = jurisdictionLabels[firmContext.jurisdiction] || 'UK';
    const regulator = regulators[firmContext.jurisdiction] || 'the relevant regulator';
    lines.push(`You are an AML compliance assistant for a ${label} law firm regulated by ${regulator}.`);
  } else {
    lines.push('You are an AML compliance assistant for a UK law firm.');
  }
  lines.push('Your role is EXPLANATORY ONLY.');
  lines.push('');

  // Strict limitations
  lines.push('## Strict Limitations');
  lines.push('You MUST NOT:');
  lines.push('- Perform risk scoring or calculations');
  lines.push('- Make risk determinations or recommendations');
  lines.push('- Generate file notes, reports, or formal documents');
  lines.push('- Create PDFs or downloadable content');
  lines.push('- Access, reference, or process any client data');
  lines.push('- Access matters, assessments, or form answers');
  lines.push('- Rely on general knowledge outside the provided materials');
  lines.push('- Make assumptions about AML requirements not in the materials');
  lines.push('');

  // Response requirements
  lines.push('## Response Requirements');
  lines.push('1. Answer based on the Provided Materials below. You may interpret, summarise, and explain what the materials say in plain language.');
  lines.push('2. Recognise standard AML/legal abbreviations (CDD, EDD, KYC, SoF, SoW, PEP, SAR, MLR, MLRO, HRTC, FATF, LSAG, POCA, etc.) as references to their full terms in the materials.');
  lines.push('3. If the Provided Materials do not contain information that can reasonably answer the question, respond EXACTLY:');
  lines.push(`   "${NOT_FOUND_RESPONSE}"`);
  lines.push('4. Cite sources using the format: [Source Name, Section Ref]');
  lines.push('5. Be concise and factual.');
  lines.push('6. Do not speculate or add requirements beyond what the materials state.');
  lines.push('');

  // UI context if provided
  if (uiContext?.questionId || uiContext?.questionText) {
    lines.push('## Context');
    lines.push('The user is asking about a specific form question:');
    if (uiContext.questionId) {
      lines.push(`- Question ID: ${uiContext.questionId}`);
    }
    if (uiContext.questionText) {
      lines.push(`- Question: "${uiContext.questionText}"`);
    }
    lines.push('');
  }

  // Provided materials
  lines.push('## Provided Materials');
  lines.push('');

  if (sources.length === 0) {
    lines.push('No relevant materials found for this query.');
    lines.push('');
  } else {
    for (const source of sources) {
      lines.push(`### [${source.source_name}, ${source.section_ref}]`);
      if (source.effective_date) {
        lines.push(`Effective: ${source.effective_date}`);
      }
      lines.push('');
      lines.push(source.content);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Extract citations from source materials
 */
export function extractCitations(
  sources: AssistantSource[]
): Array<{ sourceName: string; sectionRef: string }> {
  return sources.map((source) => ({
    sourceName: source.source_name,
    sectionRef: source.section_ref,
  }));
}
