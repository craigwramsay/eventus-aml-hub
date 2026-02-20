/**
 * Embeddings Client
 *
 * Generates text embeddings via OpenAI text-embedding-3-small.
 * Uses raw fetch (consistent with existing LLM client pattern).
 */

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

interface EmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface EmbeddingErrorResponse {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

/**
 * Check whether embedding generation is available.
 * Returns true if OPENAI_API_KEY is set in the environment.
 */
export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Generate an embedding vector for the given text.
 *
 * @param text - The text to embed
 * @returns A 1536-dimension float array
 * @throws If the API key is missing or the API call fails
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate embedding for empty text');
  }

  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as EmbeddingErrorResponse;
    throw new Error(
      `OpenAI Embeddings API error: ${errorData.error?.message || response.statusText}`
    );
  }

  const data = (await response.json()) as EmbeddingResponse;

  if (!data.data || data.data.length === 0) {
    throw new Error('OpenAI Embeddings API returned no data');
  }

  return data.data[0].embedding;
}
