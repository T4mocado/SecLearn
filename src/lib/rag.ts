import { prisma } from "@/lib/prisma";
import { embedText, vectorLiteral } from "@/lib/embed";
import { getEnv } from "@/lib/env";
import { bestScores, rerankScores, selectByRelevance } from "@/lib/rerank";
import { needsTranslation, searchQueries } from "@/lib/query";
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
 * Keyword candidates per question: half the vector ones. They add to every reranking, which runs one
 * pair at a time (docs/ERRORS.md #31).
 */
const KEYWORD_CANDIDATES = 10;

/** A topic's best chunk is kept outside the top K only when it scores this much (docs/ERRORS.md #29). */
const TOPIC_MIN_RELEVANCE = 0.1;

/** A chunk naming this many cheat sheets is the site's navigation menu (menus name 19-34, contents 1-3). */
const MENU_MIN_NAMES = 10;

/** Cheat-sheet names as the site menu prints them ("Password_Storage_Cheat_Sheet" → "Password Storage"). */
export function menuNames(titles: string[]): string[] {
  return [
    ...new Set(titles.filter((t) => !/^(?:wstg|nist|owasp)/i.test(t)).map((t) => t.replace(/_Cheat_Sheet$/, "").replace(/_/g, " "))),
  ].filter((n) => n.length > 3);
}

/**
 * The PDFs kept the cheat-sheet site's navigation menu, a list of every cheat sheet: 743 of 5684 chunks.
 * Keyword search ranked them high (they name everything) and the model wrote "the documents have a
 * section on…" from them (docs/ERRORS.md #29). Tables of contents ("A10 Server-Side Request Forgery")
 * name few cheat sheets and stay.
 */
export function isSiteMenu(content: string, names: string[], minNames = MENU_MIN_NAMES): boolean {
  let found = 0;
  for (const name of names) if (content.includes(name) && ++found >= minNames) return true;
  return false;
}

let menuNamesCache: { at: number; names: Promise<string[]> } | null = null;
/** Document titles change only on upload or delete: re-read at most once a minute. */
function currentMenuNames(): Promise<string[]> {
  if (!menuNamesCache || Date.now() - menuNamesCache.at > 60_000) {
    const names = prisma.document
      .findMany({ select: { title: true } })
      .then((docs) => menuNames(docs.map((d) => d.title)))
      .catch(() => [] as string[]);
    menuNamesCache = { at: Date.now(), names };
  }
  return menuNamesCache.names;
}

/**
 * Which chunks count as relevant, by the queries that scored them. With an English one (the question
 * was English or translated), chunks under RAG_MIN_RELEVANCE_EN or under RAG_RELATIVE_MIN of the best
 * are dropped: below them, cited chunks drew 2-4x the weak citations (docs/ERRORS.md #31). With only a
 * Vietnamese one (the translation failed), relevant English chunks score ~0.01-0.05 (#10, #17): the
 * lenient floor and RAG_MIN_KEEP stay.
 */
export function relevanceFloor(
  queries: string[],
  env: { RAG_MIN_RELEVANCE: number; RAG_MIN_KEEP: number; RAG_MIN_RELEVANCE_EN: number; RAG_RELATIVE_MIN: number },
): { minRelevance: number; minKeep: number; relativeMin: number } {
  return queries.some((q) => !needsTranslation(q))
    ? { minRelevance: env.RAG_MIN_RELEVANCE_EN, minKeep: 0, relativeMin: env.RAG_RELATIVE_MIN }
    : { minRelevance: env.RAG_MIN_RELEVANCE, minKeep: env.RAG_MIN_KEEP, relativeMin: 0 };
}

/**
 * The words of the English queries ORed for to_tsquery: letters and digits only, so a question's own
 * punctuation can't break the query. Non-English queries are skipped: the index is English.
 */
export function keywordQuery(queries: string[]): string {
  const words = queries
    .filter((q) => !needsTranslation(q))
    .flatMap((q) => q.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => w.length > 1 || /\d/.test(w));
  return [...new Set(words)].join(" | ");
}

/**
 * Fetches RAG_CANDIDATES chunks by cosine for the question and, when it is not English, for its
 * English translation too. Reorders the union by cross-encoder relevance (best score over both
 * queries, so neither English nor Vietnamese chunks are penalised for the language) and keeps the
 * best RAG_TOP_K that pass `relevanceFloor`.
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
  // Several topics: the message plus one rewrite per topic. Each topic gets fewer candidates and the
  // topics alone rerank them: the reranker runs one pair at a time, and four queries over ~100
  // candidates took 2.7-4.2 s (docs/ERRORS.md #29).
  const topics = queries.length > 2 ? queries.slice(1) : [];
  const perQueryLimit = topics.length ? Math.ceil(limit / 2) : limit;
  const names = currentMenuNames();
  const lists = await Promise.all([
    ...queries.map((query) => retrieveCandidates({ query, visibilities: opts.visibilities, limit: perQueryLimit })),
    keywordCandidates(keywordQuery(queries), opts.visibilities, KEYWORD_CANDIDATES),
    fetchChunksById(opts.carryChunkIds ?? [], opts.visibilities, queries.at(-1)!),
  ]);
  const menu = await names;
  const candidates = mergeCandidates(lists).filter((c) => !isSiteMenu(c.content, menu));

  let scores: number[] | null;
  let topicBest: string[] = [];
  const scoring = topics.length ? topics : queries;
  try {
    const perQuery = await Promise.all(scoring.map((q) => rerankScores(q, candidates.map((c) => c.content))));
    scores = perQuery.every((s) => s !== null) ? bestScores(perQuery as number[][]) : null;
    if (scores && topics.length) {
      topicBest = (perQuery as number[][]).map((s) => candidates[s.indexOf(Math.max(...s))]!.id);
    }
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
      ...relevanceFloor(scoring, env),
      topics: { ids: topicBest, minRelevance: TOPIC_MIN_RELEVANCE },
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

/** Chunks written before the keyword index existed (`db push` adds the column empty), filled once per process. */
let searchTextReady: Promise<void> | null = null;
function ensureSearchText(): Promise<void> {
  searchTextReady ??= prisma
    .$executeRawUnsafe(`UPDATE "DocumentChunk" SET "searchText" = to_tsvector('english', "content") WHERE "searchText" IS NULL`)
    .then(() => undefined);
  return searchTextReady;
}

/**
 * Chunks sharing the most words with the English queries (full-text, `searchText`). The vector search
 * ranked "A10 Server-Side Request Forgery (SSRF)" 1376th for an SSRF question, out of the reranker's
 * reach; the words find it (docs/ERRORS.md #29).
 */
async function keywordCandidates(tsquery: string, visibilities: DocVisibility[], limit: number): Promise<RetrievedChunk[]> {
  if (!tsquery) return [];
  try {
    await ensureSearchText();
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; content: string; documentId: string; documentTitle: string; chunkIndex: number; score: number }>
    >(
      `
      SELECT c.id, c.content, c."documentId", d.title AS "documentTitle", c."chunkIndex",
             ts_rank_cd(c."searchText", q, 1)::float8 AS score
      FROM "DocumentChunk" c
      INNER JOIN "Document" d ON d.id = c."documentId",
           to_tsquery('english', $1) q
      WHERE c."searchText" @@ q
        AND d.status = 'ready'
        AND d.visibility::text = ANY($2::text[])
      ORDER BY score DESC
      LIMIT $3
      `,
      tsquery,
      visibilities,
      limit,
    );
    return rows.map((r) => ({ ...r, method: "keyword" as const }));
  } catch (err) {
    searchTextReady = null;
    console.warn("[rag] keyword search failed, using the vector candidates only:", err instanceof Error ? err.message : err);
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
