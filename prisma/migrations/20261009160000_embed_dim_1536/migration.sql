-- Resize pgvector column back to OpenAI text-embedding-3-small default (1536-d).
-- Existing 384-d (local MiniLM) embeddings are incompatible; drop + recreate, then reindex all documents.
ALTER TABLE "DocumentChunk" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "DocumentChunk" ADD COLUMN "embedding" vector(1536);
