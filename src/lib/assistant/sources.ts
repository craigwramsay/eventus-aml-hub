/**
 * Assistant Source Retrieval
 *
 * Retrieves relevant source excerpts for the assistant.
 * Uses vector similarity search when available, falls back to keyword matching.
 */

import { createClient } from '@/lib/supabase/server';
import { generateEmbedding, isEmbeddingConfigured } from '@/lib/embeddings';
import type { AssistantSource } from '@/lib/supabase/types';

/** Keywords to topic mapping for simple relevance matching */
const KEYWORD_TOPICS: Record<string, string[]> = {
  // CDD related
  cdd: ['cdd', 'due-diligence', 'verification', 'identity'],
  'customer due diligence': ['cdd', 'due-diligence', 'verification'],
  identification: ['cdd', 'verification', 'identity'],
  verify: ['cdd', 'verification', 'identity'],

  // EDD related
  edd: ['edd', 'enhanced-due-diligence', 'high-risk'],
  'enhanced due diligence': ['edd', 'enhanced-due-diligence'],
  'high risk': ['edd', 'high-risk', 'pep'],
  pep: ['pep', 'edd', 'high-risk'],
  'politically exposed': ['pep', 'edd'],

  // Risk scoring
  score: ['risk-scoring', 'scoring', 'methodology', 'cmlra'],
  scoring: ['risk-scoring', 'scoring', 'methodology'],
  threshold: ['risk-scoring', 'thresholds', 'methodology'],
  'risk assessment': ['risk-assessment', 'cmlra', 'scoring', 'methodology'],
  cmlra: ['cmlra', 'risk-assessment', 'methodology'],

  // Source of funds/wealth
  'source of funds': ['sof', 'source-of-funds'],
  'source of wealth': ['sow', 'source-of-wealth'],
  sof: ['sof', 'source-of-funds'],
  sow: ['sow', 'source-of-wealth'],
  'third party': ['sof', 'third-party'],
  funding: ['sof', 'source-of-funds', 'third-party'],

  // Monitoring
  monitoring: ['monitoring', 'ongoing-monitoring'],
  ongoing: ['monitoring', 'ongoing-monitoring'],

  // Regulations
  mlr: ['cdd', 'edd', 'verification', 'due-diligence'],
  'money laundering regulations': ['cdd', 'edd', 'verification'],
  regulation: ['cdd', 'edd', 'methodology'],
};

/**
 * Extract topics from a question using keyword matching
 */
export function extractTopicsFromQuestion(questionText: string): string[] {
  const lowerQuestion = questionText.toLowerCase();
  const topics = new Set<string>();

  for (const [keyword, mappedTopics] of Object.entries(KEYWORD_TOPICS)) {
    if (lowerQuestion.includes(keyword)) {
      mappedTopics.forEach((topic) => topics.add(topic));
    }
  }

  // If no topics matched, return empty (will fetch all sources)
  return Array.from(topics);
}

/**
 * Retrieve sources by vector similarity search
 *
 * @param firmId - The firm ID (RLS enforced at DB level via SECURITY INVOKER)
 * @param questionText - The user's question
 * @param limit - Maximum number of sources to return
 */
async function retrieveSourcesByVector(
  firmId: string,
  questionText: string,
  limit: number = 10
): Promise<AssistantSource[]> {
  const queryEmbedding = await generateEmbedding(questionText);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('match_assistant_sources', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: 0.5,
    match_count: limit,
  });

  if (error) {
    console.error('Vector search failed:', error);
    return [];
  }

  return (data as unknown as AssistantSource[]) || [];
}

/**
 * Retrieve sources by keyword topic matching (original approach)
 */
async function retrieveSourcesByKeyword(
  firmId: string,
  questionText: string,
  limit: number = 10
): Promise<AssistantSource[]> {
  const supabase = await createClient();
  const topics = extractTopicsFromQuestion(questionText);

  let query = supabase
    .from('assistant_sources')
    .select('*')
    .eq('firm_id', firmId)
    .order('source_name')
    .order('section_ref')
    .limit(limit);

  if (topics.length > 0) {
    query = query.overlaps('topics', topics);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error retrieving assistant sources:', error);
    return [];
  }

  return (data as AssistantSource[]) || [];
}

/**
 * Retrieve relevant sources for a question
 *
 * Tries vector similarity search first when configured.
 * Falls back to keyword matching if vector search is unavailable or returns empty.
 *
 * @param firmId - The firm ID for RLS
 * @param questionText - The user's question
 * @param limit - Maximum number of sources to return
 */
export async function retrieveRelevantSources(
  firmId: string,
  questionText: string,
  limit: number = 10
): Promise<AssistantSource[]> {
  // Try vector search first
  if (isEmbeddingConfigured()) {
    try {
      const vectorResults = await retrieveSourcesByVector(firmId, questionText, limit);
      if (vectorResults.length > 0) {
        return vectorResults;
      }
      // Vector search returned empty — fall through to keyword matching
    } catch (error) {
      console.error('Vector search error, falling back to keyword matching:', error);
    }
  }

  // Fallback: keyword-based topic matching
  return retrieveSourcesByKeyword(firmId, questionText, limit);
}

/**
 * Retrieve all sources for a firm (fallback when no topic match)
 */
export async function retrieveAllSources(
  firmId: string,
  limit: number = 20
): Promise<AssistantSource[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('assistant_sources')
    .select('*')
    .eq('firm_id', firmId)
    .order('source_name')
    .order('section_ref')
    .limit(limit);

  if (error) {
    console.error('Error retrieving all assistant sources:', error);
    return [];
  }

  return (data as AssistantSource[]) || [];
}
