-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to assistant_sources (nullable — sources work without embeddings)
ALTER TABLE assistant_sources
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW index for fast approximate nearest-neighbour search
CREATE INDEX IF NOT EXISTS idx_assistant_sources_embedding
  ON assistant_sources
  USING hnsw (embedding vector_cosine_ops);

-- RPC function: find semantically similar sources for a firm
-- Uses SECURITY INVOKER so existing RLS policies enforce firm isolation automatically
CREATE OR REPLACE FUNCTION match_assistant_sources(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  firm_id uuid,
  source_type text,
  source_name text,
  section_ref text,
  topics text[],
  content text,
  effective_date date,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    s.id,
    s.firm_id,
    s.source_type::text,
    s.source_name,
    s.section_ref,
    s.topics,
    s.content,
    s.effective_date,
    s.created_at,
    s.updated_at,
    1 - (s.embedding <=> query_embedding) AS similarity
  FROM assistant_sources s
  WHERE s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> query_embedding) > match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
$$;
