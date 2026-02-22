import { NextRequest, NextResponse } from 'next/server';
import { getUser, getUserProfile, createClient } from '@/lib/supabase/server';
import { retrieveRelevantSources, retrieveAllSources } from '@/lib/assistant/sources';
import { buildSystemPrompt } from '@/lib/assistant/prompt';
import { isEmbeddingConfigured } from '@/lib/embeddings';
import { getLLMClient, isLLMConfigured, getLLMConfig } from '@/lib/llm';
import type { ChatMessage } from '@/lib/llm';

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 });

  const body = await request.json();
  const testQuestion = body.question || 'What is CDD?';

  const supabase = await createClient();

  // Firm details
  const { data: firmData } = await supabase
    .from('firms')
    .select('name, jurisdiction')
    .eq('id', profile.firm_id)
    .single();

  // Count sources
  const { count } = await supabase
    .from('assistant_sources')
    .select('*', { count: 'exact', head: true })
    .eq('firm_id', profile.firm_id);

  // Retrieve sources
  const relevantSources = await retrieveRelevantSources(profile.firm_id, testQuestion);
  const allSources = await retrieveAllSources(profile.firm_id);

  // Build the actual prompt that would be sent
  const sources = relevantSources.length > 0 ? relevantSources : allSources;
  const systemPrompt = buildSystemPrompt(
    { firmId: profile.firm_id, firmName: firmData?.name || 'AML Hub', jurisdiction: firmData?.jurisdiction },
    sources
  );

  // Try calling the LLM
  let llmResponse = null;
  let llmError = null;
  let llmConfig = null;
  try {
    llmConfig = getLLMConfig();
    const client = getLLMClient();
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: testQuestion },
    ];
    const result = await client.complete({ messages, maxTokens: 1024, temperature: 0.2 });
    llmResponse = {
      content: result.content,
      finishReason: result.finishReason,
      usage: result.usage,
    };
  } catch (err) {
    llmError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    firmId: profile.firm_id,
    firmName: firmData?.name,
    jurisdiction: firmData?.jurisdiction,
    embeddingConfigured: isEmbeddingConfigured(),
    llmConfigured: isLLMConfigured(),
    llmProvider: llmConfig?.provider,
    llmModel: llmConfig?.model,
    sourcesForFirm: count,
    relevantSourcesCount: relevantSources.length,
    allSourcesCount: allSources.length,
    systemPromptLength: systemPrompt.length,
    systemPromptPreview: systemPrompt.substring(0, 500),
    testQuestion,
    llmResponse,
    llmError,
  });
}
