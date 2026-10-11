-- Resize pgvector column for local MiniLM (384-d).
-- Existing embeddings are incompatible; drop + recreate, then reindex all documents.
ALTER TABLE "DocumentChunk" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "DocumentChunk" ADD COLUMN "embedding" vector(384);
