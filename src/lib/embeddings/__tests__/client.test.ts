import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateEmbedding, isEmbeddingConfigured } from '../client';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Embeddings Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isEmbeddingConfigured', () => {
    it('returns true when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';
      expect(isEmbeddingConfigured()).toBe(true);
    });

    it('returns false when OPENAI_API_KEY is not set', () => {
      delete process.env.OPENAI_API_KEY;
      expect(isEmbeddingConfigured()).toBe(false);
    });

    it('returns false when OPENAI_API_KEY is empty string', () => {
      process.env.OPENAI_API_KEY = '';
      expect(isEmbeddingConfigured()).toBe(false);
    });
  });

  describe('generateEmbedding', () => {
    const mockEmbedding = Array.from({ length: 1536 }, (_, i) => i * 0.001);

    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'sk-test-key';
    });

    it('returns embedding vector on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object: 'list',
          data: [{ object: 'embedding', index: 0, embedding: mockEmbedding }],
          model: 'text-embedding-3-small',
          usage: { prompt_tokens: 10, total_tokens: 10 },
        }),
      });

      const result = await generateEmbedding('What is CDD?');

      expect(result).toEqual(mockEmbedding);
      expect(result).toHaveLength(1536);
    });

    it('sends correct request to OpenAI', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }],
        }),
      });

      await generateEmbedding('test text');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer sk-test-key',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: 'test text',
            dimensions: 1536,
          }),
        })
      );
    });

    it('throws when OPENAI_API_KEY is not set', async () => {
      delete process.env.OPENAI_API_KEY;

      await expect(generateEmbedding('test')).rejects.toThrow(
        'OPENAI_API_KEY is not configured'
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws for empty text', async () => {
      await expect(generateEmbedding('')).rejects.toThrow(
        'Cannot generate embedding for empty text'
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws for whitespace-only text', async () => {
      await expect(generateEmbedding('   ')).rejects.toThrow(
        'Cannot generate embedding for empty text'
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws on API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({
          error: {
            message: 'Invalid API key',
            type: 'authentication_error',
            code: 'invalid_api_key',
          },
        }),
      });

      await expect(generateEmbedding('test')).rejects.toThrow(
        'OpenAI Embeddings API error: Invalid API key'
      );
    });

    it('throws when API returns empty data array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [],
        }),
      });

      await expect(generateEmbedding('test')).rejects.toThrow(
        'OpenAI Embeddings API returned no data'
      );
    });

    it('throws on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(generateEmbedding('test')).rejects.toThrow('Network error');
    });
  });
});
