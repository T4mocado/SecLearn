-- Keyword candidates next to the vector search (docs/ERRORS.md #29): chunks naming "A10 Server-Side Request
-- Forgery" ranked 85-1550 by cosine, outside the 20 candidates the reranker sees.
ALTER TABLE "DocumentChunk" ADD COLUMN "searchText" tsvector;

UPDATE "DocumentChunk" SET "searchText" = to_tsvector('english', "content");

CREATE INDEX "DocumentChunk_searchText_idx" ON "DocumentChunk" USING GIN ("searchText");
