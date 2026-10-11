import { prisma } from "@/lib/prisma";
import { embedText, vectorLiteral } from "@/lib/embed";
import { getEnv } from "@/lib/env";
import { rerankScores } from "@/lib/rerank";
import type { DocVisibility } from "@prisma/client";
import type { MessageSource } from "@/lib/sources";

export type RetrievedChunk = {
  id: string;
  content: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  /** Cosine similarity (vector) or matched keyword count (keyword). */
  score: number;
  method: "vector" | "keyword";
  /** Cross-encoder relevance 0..1; absent when no reranker is configured or it failed. */
  rerankScore?: number;
};

/** Upper bound on the context block in the system prompt. */
export const CONTEXT_CHAR_LIMIT = 6000;

/**
 * Fetches RAG_CANDIDATES chunks by cosine, reorders them by cross-encoder relevance,
 * drops those below RAG_MIN_RELEVANCE and keeps the best RAG_TOP_K.
 */
export async function retrieveChunks(opts: {
  query: string;
  visibilities: DocVisibility[];
}): Promise<RetrievedChunk[]> {
  const env = getEnv();
  const topK = env.RAG_TOP_K;
  const limit = env.RERANK_URL.trim() ? Math.max(env.RAG_CANDIDATES, topK) : topK;
  const candidates = await retrieveCandidates({ ...opts, limit });

  let scores: number[] | null;
  try {
    scores = await rerankScores(opts.query, candidates.map((c) => c.content));
  } catch (err) {
    // Chat still works on cosine order; the missing rerank score in the sources panel shows it.
    console.warn("[rag] rerank failed, falling back to cosine order:", err instanceof Error ? err.message : err);
    scores = null;
  }
  if (!scores) return candidates.slice(0, topK);

  return candidates
    .map((c, i) => ({ ...c, rerankScore: scores[i]! }))
    .filter((c) => c.rerankScore >= env.RAG_MIN_RELEVANCE)
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, topK);
}

async function retrieveCandidates(opts: {
  query: string;
  visibilities: DocVisibility[];
  limit: number;
}): Promise<RetrievedChunk[]> {
  const embedding = await embedText(opts.query);
  const lit = vectorLiteral(embedding);

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        content: string;
        documentId: string;
        documentTitle: string;
        chunkIndex: number;
        score: number;
      }>
    >(
      `
      SELECT c.id, c.content, c."documentId", d.title AS "documentTitle", c."chunkIndex",
             (1 - (c.embedding <=> $1::vector))::float8 AS score
      FROM "DocumentChunk" c
      INNER JOIN "Document" d ON d.id = c."documentId"
      WHERE d.status = 'ready'
        AND d.visibility::text = ANY($2::text[])
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT $3
      `,
      lit,
      opts.visibilities,
      opts.limit,
    );
    return rows.map((r) => ({ ...r, method: "vector" as const }));
  } catch {
    // Fallback: keyword-ish retrieve without vector if extension/query fails
    const docs = await prisma.document.findMany({
      where: {
        status: "ready",
        visibility: { in: opts.visibilities },
      },
      include: { chunks: { take: 3, orderBy: { chunkIndex: "asc" } } },
      take: 5,
    });
    const q = opts.query.toLowerCase();
    const scored: RetrievedChunk[] = [];
    for (const d of docs) {
      for (const c of d.chunks) {
        const hay = c.content.toLowerCase();
        const score = q.split(/\s+/).filter((w) => w.length > 2 && hay.includes(w)).length;
        scored.push({
          id: c.id,
          content: c.content,
          documentId: d.id,
          documentTitle: d.title,
          chunkIndex: c.chunkIndex,
          score,
          method: "keyword",
        });
      }
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, opts.limit);
  }
}

/**
 * Builds the numbered context block and returns exactly the chunks that made it in whole,
 * so the sources shown to the user match what the model saw.
 */
export function buildContext(chunks: RetrievedChunk[]): { context: string; sources: MessageSource[] } {
  const blocks: string[] = [];
  const sources: MessageSource[] = [];
  let length = 0;
  for (const c of chunks) {
    const index = sources.length + 1;
    const block = `[${index}] (source: ${c.documentTitle})\n${c.content}`;
    const added = (blocks.length ? 2 : 0) + block.length;
    if (length + added > CONTEXT_CHAR_LIMIT) break;
    blocks.push(block);
    length += added;
    sources.push({
      index,
      chunkId: c.id,
      documentId: c.documentId,
      documentTitle: c.documentTitle,
      chunkIndex: c.chunkIndex,
      content: c.content,
      score: c.score,
      method: c.method,
      ...(c.rerankScore !== undefined ? { rerankScore: c.rerankScore } : {}),
    });
  }
  return { context: blocks.join("\n\n"), sources };
}

export function chunkMarkdown(markdown: string, size: number, overlap: number): string[] {
  const text = markdown.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + size);
    let slice = text.slice(i, end);
    if (end < text.length) {
      const lastBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
      if (lastBreak > size * 0.4) {
        slice = slice.slice(0, lastBreak);
      }
    }
    const cleaned = slice.trim();
    if (cleaned) chunks.push(cleaned);
    if (end >= text.length) break;
    i += Math.max(1, cleaned.length - overlap);
  }
  return chunks;
}
