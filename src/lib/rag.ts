import { prisma } from "@/lib/prisma";
import { embedTexts, vectorLiteral } from "@/lib/embed";
import { getEnv } from "@/lib/env";
import { bestScores, cellsTopK, rerankPairs, reserveCells, selectByRelevance } from "@/lib/rerank";
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
  /** Comparison cells (`cellLabel`) this chunk scores at least CELL_LABEL_MIN for; shown to the answer model. */
  cells?: string[];
};

/** A cell of a comparison (`SearchPlan.compare`): one item, or one item on one aspect. */
export type CompareCell = { item: string; aspect?: string };
export const cellLabel = (cell: CompareCell) => (cell.aspect ? `${cell.item} — ${cell.aspect}` : cell.item);

/** Upper bound on the context block in the system prompt. */
export const CONTEXT_CHAR_LIMIT = 6000;
/**
 * Context room per chunk for a comparison, which keeps up to 8 chunks: chunks are ~650 characters (p90 777) plus
 * their header, so 6000 could drop the last reserved one (docs/ERRORS.md #36).
 */
const COMPARE_CHARS_PER_CHUNK = 850;
/** A chunk is labelled with, and counts as evidence for, a cell it scores this much for. */
const CELL_LABEL_MIN = 0.3;


/**
 * Keyword candidates per question: half the vector ones. They add to every reranking, which runs one
 * pair at a time (docs/ERRORS.md #31).
 */
const KEYWORD_CANDIDATES = 10;

/**
 * HyDE: a chunk the question scores at least PASSAGE_QUESTION_MIN is kept when the passage scores it at
 * least PASSAGE_MIN, though under the relative floor. The SMS drawbacks scored 0.06-0.09 against the question
 * (floor 0.081) and the STRIDE table 0.09-0.95 against its expansion. At 0.02, chunks scoring 0.04 got in
 * (Secure Cloud, WebSocket for a DDoS question): the passage relaxes the relative floor only, never the
 * absolute one (docs/ERRORS.md #34).
 */
const PASSAGE_MIN = 0.5;
const PASSAGE_QUESTION_MIN = 0.05;

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
   * Chunks earlier answers cited, added to the candidates: "tell me more about X" must see the passage X
   * came from, which a fresh search may miss (docs/ERRORS.md #22). Reranked like the rest; up to `max`
   * scoring at least `minRelevance` stay even outside the top K (`carryFor`, docs/ERRORS.md #26, #32).
   */
  carry?: { ids: string[]; max: number; minRelevance: number; inOrder?: boolean };
  /**
   * HyDE passage (`SearchPlan.passage`): searched by vector only, and scored to rank chunks; whether a chunk is
   * relevant is still decided against the question (`selectByRelevance`, docs/ERRORS.md #34). Keyword search
   * with it matched broad words (security, attack, data) and kept unrelated chunks.
   */
  passage?: string;
  /**
   * The cells of a comparison, one per query after the message (`compareQueries`). Each gets its own chunks
   * (`reserveCells`), the top K grows with them (`cellsTopK`) and chunks are labelled and grouped by cell.
   */
  cells?: CompareCell[];
}): Promise<RetrievedChunk[]> {
  const env = getEnv();
  const queries = opts.queries?.length ? opts.queries : await searchQueries(opts.query, opts.history);
  // Cells only line up with planned queries: the message plus one per cell, two cells at least.
  const cells = opts.queries?.length && opts.cells && opts.cells.length >= 2 && opts.cells.length === queries.length - 1 ? opts.cells : null;
  const topK = cells ? cellsTopK(cells.length, env.RAG_TOP_K) : env.RAG_TOP_K;
  const limit = env.RERANK_URL.trim() ? Math.max(env.RAG_CANDIDATES, topK) : topK;
  // Several topics: the message plus one rewrite per topic. Each topic gets fewer candidates and the
  // topics alone rerank them: the reranker runs one pair at a time, and four queries over ~100
  // candidates took 2.7-4.2 s (docs/ERRORS.md #29).
  const topics = queries.length > 2 ? queries.slice(1) : [];
  const perQueryLimit = topics.length ? Math.ceil(limit / 2) : limit;
  const names = currentMenuNames();
  // One embedding request for every query: nine parallel ones (six comparison cells, the message, HyDE, carried
  // chunks) made the local embed server drop three, and the question failed (docs/ERRORS.md #35).
  const vectorTexts = [...queries, ...(opts.passage ? [opts.passage] : [])];
  const vectors = await embedTexts(vectorTexts);
  const lists = await Promise.all([
    ...vectors.map((embedding, i) =>
      retrieveCandidates({ query: vectorTexts[i]!, embedding, visibilities: opts.visibilities, limit: perQueryLimit }),
    ),
    keywordCandidates(keywordQuery(queries), opts.visibilities, KEYWORD_CANDIDATES),
    fetchChunksById(opts.carry?.ids ?? [], opts.visibilities, vectors[queries.length - 1]!),
  ]);
  const menu = await names;
  const candidates = mergeCandidates(lists).filter((c) => !isSiteMenu(c.content, menu));

  let scores: number[] | null;
  let passageScores: number[] | null = null;
  let topicBest: string[] = [];
  let cellScores: number[][] | null = null;
  const scoring = topics.length ? topics : queries;
  try {
    const contents = candidates.map((c) => c.content);
    // Every query (and the HyDE passage) against every candidate in one request: seven parallel ones for a
    // six-cell comparison went over the embed server's connection backlog and failed (docs/ERRORS.md #35).
    const texts = [...scoring, ...(opts.passage ? [opts.passage] : [])];
    const flat = await rerankPairs(texts.flatMap((q) => contents.map((d): [string, string] => [q, d])));
    const perText = flat ? texts.map((_, t) => flat.slice(t * contents.length, (t + 1) * contents.length)) : null;
    const perQuery = perText?.slice(0, scoring.length) ?? null;
    passageScores = perText && opts.passage ? perText[scoring.length]! : null;
    scores = perQuery ? bestScores(perQuery) : null;
    if (scores && perQuery && cells) {
      cellScores = perQuery;
      topicBest = reserveCells(perQuery, candidates.map((c) => c.id), { minFirst: TOPIC_MIN_RELEVANCE, minNext: CELL_LABEL_MIN });
    } else if (scores && perQuery && topics.length) {
      topicBest = perQuery.map((s) => candidates[s.indexOf(Math.max(...s))]!.id);
    }
  } catch (err) {
    // Chat still works on cosine order; the missing rerank score in the sources panel shows it.
    console.warn("[rag] rerank failed, falling back to cosine order:", err instanceof Error ? err.message : err);
    scores = null;
  }
  if (!scores) return candidates.slice(0, topK);

  const selected = selectByRelevance(
    candidates.map((c, i) => ({ ...c, rerankScore: scores[i]!, ...(passageScores ? { passageScore: passageScores[i]! } : {}) })),
    {
      topK,
      ...relevanceFloor(scoring, env),
      topics: { ids: topicBest, minRelevance: TOPIC_MIN_RELEVANCE },
      carried: opts.carry,
      ...(passageScores ? { passage: { min: PASSAGE_MIN, questionMin: PASSAGE_QUESTION_MIN } } : {}),
    },
  );
  if (!cells || !cellScores) return selected;
  return labelByCell(selected, candidates, cellScores, cells, topicBest);
}

/**
 * A comparison's chunks labelled with the cells they score at least CELL_LABEL_MIN for, the reserved ones first in
 * cell order (`reserveCells`), so the answer model sees which passage covers which cell and a context cut at its
 * limit drops a chunk that was not reserved.
 */
function labelByCell(
  selected: RetrievedChunk[],
  candidates: RetrievedChunk[],
  cellScores: number[][],
  cells: CompareCell[],
  reserved: string[],
): RetrievedChunk[] {
  const index = new Map(candidates.map((c, i) => [c.id, i]));
  const labelled = selected.map((c) => {
    const i = index.get(c.id)!;
    const labels = cells.filter((_, j) => cellScores[j]![i]! >= CELL_LABEL_MIN).map(cellLabel);
    return labels.length ? { ...c, cells: labels } : c;
  });
  const rank = (c: RetrievedChunk) => (reserved.includes(c.id) ? reserved.indexOf(c.id) : reserved.length);
  return labelled.map((c, k) => [c, k] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([c]) => c);
}

/** Specific chunks (still ready and visible), scored by cosine against `embedding` (the last query's) like search results. */
async function fetchChunksById(ids: string[], visibilities: DocVisibility[], embedding: number[]): Promise<RetrievedChunk[]> {
  if (!ids.length) return [];
  try {
    const lit = vectorLiteral(embedding);
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

/**
 * Whether any visible chunk has every word of one of the entity's spellings (full-text, `searchText`).
 * 25 of 26 probe entities were told apart: STRIDE, OAuth 2.0, PKCE, WPA3 found; CVE-2021-44228,
 * "Vietnam Cybersecurity Law", "Kubernetes 1.31", Bitcoin not (docs/ERRORS.md #34). Fails open.
 */
export async function entityInDocuments(spellings: string[], visibilities: DocVisibility[]): Promise<boolean> {
  try {
    await ensureSearchText();
    const rows = await prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
      `
      SELECT EXISTS (
        SELECT 1 FROM "DocumentChunk" c
        INNER JOIN "Document" d ON d.id = c."documentId",
             unnest($1::text[]) AS s(spelling)
        WHERE numnode(plainto_tsquery('english', s.spelling)) > 0
          AND c."searchText" @@ plainto_tsquery('english', s.spelling)
          AND d.status = 'ready'
          AND d.visibility::text = ANY($2::text[])
      ) AS found
      `,
      spellings,
      visibilities,
    );
    return rows[0]?.found ?? true;
  } catch (err) {
    console.warn("[rag] entity check failed, searching anyway:", err instanceof Error ? err.message : err);
    return true;
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
  /** The query's vector, embedded with the others of the question (`retrieveChunks`). */
  embedding: number[];
  visibilities: DocVisibility[];
  limit: number;
}): Promise<RetrievedChunk[]> {
  const lit = vectorLiteral(opts.embedding);

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
 * `cells` (a comparison's `cellLabel`s): room for COMPARE_CHARS_PER_CHUNK per chunk, each chunk's header names the
 * cells it covers, and a last line names the cells no chunk shown covers, so the model knows which part is missing
 * rather than guessing it (docs/ERRORS.md #36).
 */
export function buildContext(chunks: RetrievedChunk[], opts: { cells?: string[] } = {}): { context: string; sources: MessageSource[] } {
  const blocks: string[] = [];
  const sources: MessageSource[] = [];
  const limit = opts.cells?.length ? Math.max(CONTEXT_CHAR_LIMIT, chunks.length * COMPARE_CHARS_PER_CHUNK) : CONTEXT_CHAR_LIMIT;
  const covered = new Set<string>();
  let length = 0;
  for (const c of chunks) {
    const index = sources.length + 1;
    const labels = opts.cells?.length && c.cells?.length ? `; for: ${c.cells.join("; ")}` : "";
    const block = `[${index}] (source: ${c.documentTitle}${labels})\n${c.content}`;
    const added = (blocks.length ? 2 : 0) + block.length;
    if (length + added > limit) break;
    c.cells?.forEach((label) => covered.add(label));
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
  const missing = (opts.cells ?? []).filter((label) => !covered.has(label));
  if (blocks.length && missing.length) blocks.push(`No passage found for: ${missing.join("; ")}`);
  return { context: blocks.join("\n\n"), sources };
}
