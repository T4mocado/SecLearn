-- Resize pgvector column for BKAI vietnamese-bi-encoder (768-d).
-- Old embeddings are incompatible; drop + recreate, then Reindex all documents.
ALTER TABLE "DocumentChunk" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "DocumentChunk" ADD COLUMN "embedding" vector(768);
