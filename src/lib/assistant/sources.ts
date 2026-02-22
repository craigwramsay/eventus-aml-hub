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
  'due diligence': ['cdd', 'due-diligence', 'verification'],
  identification: ['cdd', 'verification', 'identity'],
  verify: ['cdd', 'verification', 'identity'],
  verification: ['cdd', 'verification', 'identity'],

  // EDD related
  edd: ['edd', 'enhanced-due-diligence', 'high-risk'],
  'enhanced due diligence': ['edd', 'enhanced-due-diligence'],
  'high risk': ['edd', 'high-risk', 'pep', 'hrtc'],
  pep: ['pep', 'edd', 'high-risk', 'politically-exposed-person'],
  'politically exposed': ['pep', 'edd', 'politically-exposed-person'],

  // Simplified due diligence
  sdd: ['simplified-due-diligence', 'sdd', 'low-risk', 'cdd'],
  'simplified due diligence': ['simplified-due-diligence', 'sdd', 'low-risk'],
  'low risk': ['simplified-due-diligence', 'sdd', 'low-risk'],

  // Risk scoring
  score: ['risk-scoring', 'scoring', 'methodology', 'cmlra'],
  scoring: ['risk-scoring', 'scoring', 'methodology'],
  threshold: ['risk-scoring', 'thresholds', 'methodology'],
  'risk assessment': ['risk-assessment', 'cmlra', 'scoring', 'methodology'],
  cmlra: ['cmlra', 'risk-assessment', 'methodology'],
  pwra: ['risk-assessment', 'pwra', 'cmlra'],
  'practice wide risk assessment': ['risk-assessment', 'pwra', 'cmlra'],

  // Source of funds/wealth
  'source of funds': ['sof', 'source-of-funds'],
  'source of wealth': ['sow', 'source-of-wealth'],
  sof: ['sof', 'source-of-funds'],
  sow: ['sow', 'source-of-wealth'],
  'third party': ['sof', 'third-party'],
  funding: ['sof', 'source-of-funds', 'third-party'],

  // SAR / reporting / disclosure
  sar: ['sar', 'reporting', 'disclosure', 'suspicious-activity'],
  'suspicious activity report': ['sar', 'reporting', 'disclosure'],
  'suspicious activity': ['sar', 'suspicious-activity', 'red-flags', 'reporting'],
  reporting: ['sar', 'reporting', 'disclosure'],
  disclosure: ['sar', 'reporting', 'disclosure', 'consent-regime'],
  'tipping off': ['tipping-off', 'sar', 'reporting', 'poca'],
  consent: ['consent-regime', 'sar', 'reporting', 'poca', 'moratorium'],
  moratorium: ['consent-regime', 'moratorium', 'sar', 'poca'],

  // POCA / money laundering offences
  poca: ['poca', 'money-laundering-offence', 'criminal-property'],
  'proceeds of crime': ['poca', 'money-laundering-offence', 'criminal-property'],
  'criminal property': ['poca', 'criminal-property', 'money-laundering-offence'],
  concealing: ['poca', 'money-laundering-offence', 'concealing'],
  arrangements: ['poca', 'money-laundering-offence', 'arrangements'],
  'failure to disclose': ['poca', 'failure-to-disclose', 'sar', 'reporting'],

  // Beneficial ownership
  'beneficial owner': ['beneficial-ownership', 'cdd', 'verification'],
  'beneficial ownership': ['beneficial-ownership', 'cdd', 'corporate-structures'],
  ubo: ['beneficial-ownership', 'cdd', 'corporate-structures'],

  // FATF / country risk
  fatf: ['fatf', 'hrtc', 'high-risk-third-countries', 'country-risk'],
  'high risk third country': ['fatf', 'hrtc', 'high-risk-third-countries', 'country-risk'],
  hrtc: ['fatf', 'hrtc', 'high-risk-third-countries', 'country-risk'],
  'country risk': ['country-risk', 'geographical-risk', 'hrtc', 'fatf'],
  'geographic risk': ['geographical-risk', 'country-risk', 'hrtc'],
  'geographical risk': ['geographical-risk', 'country-risk', 'hrtc'],
  sanctions: ['fatf', 'hrtc', 'country-risk', 'sanctions'],
  'black list': ['fatf', 'hrtc', 'countermeasures'],
  'grey list': ['fatf', 'hrtc', 'monitoring'],
  jurisdiction: ['geographical-risk', 'country-risk', 'hrtc'],

  // Record keeping
  'record keeping': ['record-keeping', 'retention', 'compliance'],
  retention: ['record-keeping', 'retention', 'compliance'],
  records: ['record-keeping', 'retention', 'compliance'],

  // Scotland-specific
  scotland: ['scotland', 'rule-b9', 'law-society-scotland', 'sectoral-risk'],
  'rule b9': ['scotland', 'rule-b9', 'compliance', 'mlro'],
  scottish: ['scotland', 'rule-b9', 'law-society-scotland', 'sectoral-risk'],
  'law society of scotland': ['scotland', 'law-society-scotland', 'rule-b9'],
  'organised crime': ['scotland', 'soc', 'organised-crime', 'sectoral-risk'],

  // Corporate structures / trusts / partnerships
  trust: ['trusts', 'beneficial-ownership', 'corporate-structures', 'cdd'],
  trusts: ['trusts', 'beneficial-ownership', 'corporate-structures', 'cdd'],
  company: ['corporate-structures', 'beneficial-ownership', 'cdd'],
  'corporate structure': ['corporate-structures', 'beneficial-ownership', 'trusts'],
  partnership: ['partnerships', 'beneficial-ownership', 'corporate-structures'],
  llp: ['partnerships', 'llp', 'corporate-structures'],
  slp: ['partnerships', 'slp', 'corporate-structures', 'scotland'],
  'shell company': ['corporate-structures', 'shell-companies', 'beneficial-ownership'],

  // Conveyancing / property / client account
  conveyancing: ['conveyancing', 'legal-sector', 'corporate-structures', 'client-account'],
  property: ['conveyancing', 'legal-sector'],
  'client account': ['client-account', 'legal-sector', 'conveyancing'],

  // Red flags
  'red flag': ['red-flags', 'suspicious-activity', 'sar'],
  'red flags': ['red-flags', 'suspicious-activity', 'sar'],
  suspicious: ['suspicious-activity', 'red-flags', 'sar', 'reporting'],

  // Delivery channel
  'delivery channel': ['delivery-channel', 'risk-assessment', 'methodology'],
  'non face to face': ['delivery-channel', 'risk-assessment'],
  remote: ['delivery-channel', 'risk-assessment'],

  // MLRO / compliance officer
  mlro: ['mlro', 'nominated-officer', 'internal-controls', 'compliance'],
  'nominated officer': ['mlro', 'nominated-officer', 'internal-controls'],
  'money laundering reporting officer': ['mlro', 'nominated-officer', 'compliance'],
  'compliance officer': ['mlro', 'compliance', 'internal-controls'],

  // Monitoring
  monitoring: ['monitoring', 'ongoing-monitoring'],
  ongoing: ['monitoring', 'ongoing-monitoring'],
  'ongoing monitoring': ['monitoring', 'ongoing-monitoring', 'business-relationship'],

  // Policies / controls / procedures
  policies: ['policies', 'controls', 'procedures', 'compliance'],
  controls: ['policies', 'controls', 'internal-controls', 'compliance'],
  procedures: ['policies', 'controls', 'procedures', 'compliance'],
  training: ['internal-controls', 'training', 'compliance'],

  // Regulations (general)
  mlr: ['cdd', 'edd', 'verification', 'due-diligence'],
  'money laundering regulations': ['cdd', 'edd', 'verification'],
  regulation: ['cdd', 'edd', 'methodology'],

  // NRA / professional enablers
  nra: ['nra', 'legal-sector', 'supervision', 'professional-enablers'],
  'national risk assessment': ['nra', 'legal-sector', 'supervision'],
  'professional enabler': ['professional-enablers', 'nra', 'legal-sector'],

  // Scope
  scope: ['scope', 'relevant-person', 'legal-sector'],
  'relevant person': ['scope', 'relevant-person', 'legal-sector'],

  // Offences / enforcement
  offence: ['offence', 'criminal', 'enforcement', 'penalty', 'poca'],
  penalty: ['offence', 'criminal', 'enforcement', 'penalty'],
  enforcement: ['offence', 'enforcement', 'penalty', 'sra'],
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
