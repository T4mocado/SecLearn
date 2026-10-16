import { prisma } from "@/lib/prisma";
import { embedText, vectorLiteral } from "@/lib/embed";
import { getEnv } from "@/lib/env";
import { bestScores, rerankScores, selectByRelevance } from "@/lib/rerank";
import { searchQueries } from "@/lib/query";
import type { ChatTurn } from "@/lib/llm";
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
 * Carried chunks kept outside the top K: at most this many, only when they still score this much
 * against the question. Without the floor, kept chunks unrelated to the question pushed out better
 * ones and doubled weak citations (docs/ERRORS.md #26).
 */
const CARRY_KEEP = 2;
const CARRY_MIN_RELEVANCE = 0.1;

/**
 * Fetches RAG_CANDIDATES chunks by cosine for the question and, when it is not English, for its
 * English translation too. Reorders the union by cross-encoder relevance (best score over both
 * queries, so neither English nor Vietnamese chunks are penalised for the language) and keeps the
 * best RAG_TOP_K above RAG_MIN_RELEVANCE, at least RAG_MIN_KEEP when any passes.
 */
export async function retrieveChunks(opts: {
  query: string;
  visibilities: DocVisibility[];
  /** Earlier turns, to rewrite a follow-up ("Trả lời ngắn gọn") into a standalone search query. */
  history?: ChatTurn[];
  /** Queries already planned by the caller (`planSearch`); skips the rewrite call. */
  queries?: string[];
  /**
   * Chunks earlier answers cited, added to the candidates: "tell me more about X" must see the
   * passage X came from, which a fresh search may miss (docs/ERRORS.md #22). Reranked like the rest;
   * the best CARRY_KEEP above CARRY_MIN_RELEVANCE stay even outside the top K: when the search missed
   * them, the model cited the new passages for facts from the earlier answers (docs/ERRORS.md #26).
   */
  carryChunkIds?: string[];
}): Promise<RetrievedChunk[]> {
  const env = getEnv();
  const topK = env.RAG_TOP_K;
  const limit = env.RERANK_URL.trim() ? Math.max(env.RAG_CANDIDATES, topK) : topK;
  const queries = opts.queries?.length ? opts.queries : await searchQueries(opts.query, opts.history);
  const candidates = mergeCandidates(
    await Promise.all([
      ...queries.map((query) => retrieveCandidates({ query, visibilities: opts.visibilities, limit })),
      fetchChunksById(opts.carryChunkIds ?? [], opts.visibilities, queries.at(-1)!),
    ]),
  );

  let scores: number[] | null;
  try {
    const perQuery = await Promise.all(queries.map((q) => rerankScores(q, candidates.map((c) => c.content))));
    scores = perQuery.every((s) => s !== null) ? bestScores(perQuery as number[][]) : null;
  } catch (err) {
    // Chat still works on cosine order; the missing rerank score in the sources panel shows it.
    console.warn("[rag] rerank failed, falling back to cosine order:", err instanceof Error ? err.message : err);
    scores = null;
  }
  if (!scores) return candidates.slice(0, topK);

  return selectByRelevance(
    candidates.map((c, i) => ({ ...c, rerankScore: scores[i]! })),
    {
      topK,
      minRelevance: env.RAG_MIN_RELEVANCE,
      minKeep: env.RAG_MIN_KEEP,
      carried: { ids: opts.carryChunkIds ?? [], max: CARRY_KEEP, minRelevance: CARRY_MIN_RELEVANCE },
    },
  );
}

/** Specific chunks (still ready and visible), scored by cosine against `query` like search results. */
async function fetchChunksById(ids: string[], visibilities: DocVisibility[], query: string): Promise<RetrievedChunk[]> {
  if (!ids.length) return [];
  try {
    const lit = vectorLiteral(await embedText(query));
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; content: string; documentId: string; documentTitle: string; chunkIndex: number; score: number }>
    >(
      `
      SELECT c.id, c.content, c."documentId", d.title AS "documentTitle", c."chunkIndex",
             (1 - (c.embedding <=> $1::vector))::float8 AS score
      FROM "DocumentChunk" c
      INNER JOIN "Document" d ON d.id = c."documentId"
      WHERE c.id = ANY($2::text[])
        AND d.status = 'ready'
        AND d.visibility::text = ANY($3::text[])
        AND c.embedding IS NOT NULL
      `,
      lit,
      ids,
      visibilities,
    );
    return rows.map((r) => ({ ...r, method: "vector" as const }));
  } catch (err) {
    console.warn("[rag] could not load the previous answer's chunks:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Union of each query's candidates, best retrieval score per chunk, highest first. */
function mergeCandidates(lists: RetrievedChunk[][]): RetrievedChunk[] {
  const byId = new Map<string, RetrievedChunk>();
  for (const c of lists.flat()) {
    const seen = byId.get(c.id);
    if (!seen || c.score > seen.score) byId.set(c.id, c);
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
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
