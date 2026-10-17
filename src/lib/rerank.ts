import { getEnv } from "@/lib/env";

/** Posts to the cross-encoder in scripts/embed_server.py; null when no reranker is configured. */
async function postRerank(body: object, expected: number): Promise<number[] | null> {
  const url = getEnv().RERANK_URL.trim();
  if (!url || !expected) return null;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // One request may now hold every query of a comparison against every candidate (~700 pairs).
    signal: AbortSignal.timeout(15_000 + expected * 20),
  });
  if (!res.ok) throw new Error(`rerank ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const scores = (await res.json()) as unknown;
  if (
    !Array.isArray(scores) ||
    scores.length !== expected ||
    !scores.every((s) => typeof s === "number" && Number.isFinite(s))
  ) {
    throw new Error(`rerank returned ${Array.isArray(scores) ? scores.length : 0} scores for ${expected} inputs`);
  }
  return scores as number[];
}

/** Relevance (0..1) of each document to one query. */
export function rerankScores(query: string, documents: string[]): Promise<number[] | null> {
  return postRerank({ query, documents }, documents.length);
}

/** Score (0..1) of each (query, document) pair; needs an embed server that accepts `pairs`. */
export function rerankPairs(pairs: Array<[string, string]>): Promise<number[] | null> {
  return postRerank({ pairs }, pairs.length);
}

/** Chunks kept per comparison question at most, and per cell when it has at most CELLS_TWO_EACH cells. */
const CELLS_TOP_K_MAX = 8;
const CELLS_TWO_EACH = 3;

/**
 * Chunks to keep for a comparison of `cells` (item, aspect) cells: room for each cell's reserved chunks (two each up
 * to three cells, one each beyond) and one more, never fewer than `topK`, at most CELLS_TOP_K_MAX. Five chunks for six
 * cells left the CSRF and SQL injection defences out (docs/ERRORS.md #36).
 */
export function cellsTopK(cells: number, topK: number): number {
  const reserved = cells <= CELLS_TWO_EACH ? 2 * cells : cells;
  return Math.min(CELLS_TOP_K_MAX, Math.max(topK, reserved + 1));
}

/**
 * Chunks reserved for the cells of a comparison, grouped by cell in cell order. Round by round, each cell takes the
 * candidate it scores highest that no cell took yet, at least `minFirst` in the first round and `minNext` after; the
 * second round only runs for at most CELLS_TWO_EACH cells. Taking each topic's best alone, "XSS attack mechanism" and
 * "XSS prevention" both took the definition chunk (1.00 for both) and no cell got a defence (docs/ERRORS.md #36).
 * `scores[cell][candidate]`, `ids[candidate]`.
 */
export function reserveCells(scores: number[][], ids: string[], opts: { minFirst: number; minNext: number }): string[] {
  const rounds = scores.length <= CELLS_TWO_EACH ? 2 : 1;
  const taken = new Set<number>();
  const byCell: number[][] = scores.map(() => []);
  for (let round = 0; round < rounds; round++) {
    const min = round === 0 ? opts.minFirst : opts.minNext;
    scores.forEach((cell, j) => {
      let best = -1;
      cell.forEach((s, i) => {
        if (!taken.has(i) && s >= min && (best < 0 || s > cell[best]!)) best = i;
      });
      if (best >= 0) {
        taken.add(best);
        byCell[j]!.push(best);
      }
    });
  }
  return byCell.flat().map((i) => ids[i]!);
}

/** Element-wise best score of each document over several queries (original + translated question). */
export function bestScores(perQuery: number[][]): number[] {
  return perQuery[0]!.map((_, i) => Math.max(...perQuery.map((scores) => scores[i]!)));
}

/**
 * Highest-scoring items first, those below `minRelevance` dropped, at most `topK`. When at least one
 * item passes, at least `minKeep` are kept: cross-lingual scores sit far below the threshold even for
 * relevant chunks. When none pass, the question is off topic and nothing is kept. `relativeMin` also drops
 * items under that share of the best score.
 * `topics`: the best chunk of each topic of a several-topic question, kept when it scores at least
 * `minRelevance`: one topic's chunks filled the top K and the others went uncited (docs/ERRORS.md #29).
 * `carried`: up to `max` of these ids scoring at least `minRelevance` are kept even when outside the
 * top K. Both take the place of the lowest-scoring others, topics first.
 * `passage` (HyDE): items are ranked by the better of `rerankScore` (against the question) and
 * `passageScore` (against the HyDE passage), but relevance is still decided by `rerankScore`: an item
 * passes the floor, or scores at least `questionMin` with a `passageScore` of at least `min`. Scored by the
 * passage alone, questions outside the documents kept 3-5 unrelated chunks (docs/ERRORS.md #34).
 */
export function selectByRelevance<T extends { id: string; rerankScore: number; passageScore?: number }>(
  items: T[],
  opts: {
    topK: number;
    minRelevance: number;
    minKeep: number;
    /** Also drop items under this share of the best score. */
    relativeMin?: number;
    topics?: { ids: string[]; minRelevance: number };
    /** `inOrder`: keep them by their order in `ids` (priority) instead of by score. */
    carried?: { ids: string[]; max: number; minRelevance: number; inOrder?: boolean };
    passage?: { min: number; questionMin: number };
  },
): T[] {
  const { passage } = opts;
  const rank = (c: T) => (passage ? Math.max(c.rerankScore, c.passageScore ?? 0) : c.rerankScore);
  const sorted = [...items].sort((a, b) => rank(b) - rank(a));
  const bestQuestion = Math.max(0, ...items.map((c) => c.rerankScore));
  const floor = Math.max(opts.minRelevance, (opts.relativeMin ?? 0) * bestQuestion);
  const passes = (c: T) =>
    c.rerankScore >= floor || (!!passage && c.rerankScore >= passage.questionMin && (c.passageScore ?? 0) >= passage.min);
  // Passing items first (they are the best ranked when ranking by the question), then the rest for `minKeep`.
  const ordered = [...sorted.filter(passes), ...sorted.filter((c) => !passes(c))];
  const passing = sorted.filter(passes).length;
  const { topics, carried } = opts;
  const reserved = [
    ...new Set([
      ...(topics ? sorted.filter((c) => topics.ids.includes(c.id) && c.rerankScore >= topics.minRelevance) : []),
      ...(carried?.max
        ? sorted
            .filter((c) => carried.ids.includes(c.id) && c.rerankScore >= carried.minRelevance)
            .sort((a, b) => (carried.inOrder ? carried.ids.indexOf(a.id) - carried.ids.indexOf(b.id) : 0))
            .slice(0, carried.max)
        : []),
    ]),
  ].slice(0, opts.topK);
  // Nothing passes: off topic, unless reserved chunks have no floor (a REFORMAT request's previous passages).
  if (!passing && !reserved.length) return [];
  const selected = passing ? ordered.slice(0, Math.min(opts.topK, Math.max(passing, opts.minKeep))) : [];
  if (reserved.every((c) => selected.includes(c))) return selected;
  const others = selected.filter((c) => !reserved.includes(c));
  const kept = new Set([...reserved, ...others.slice(0, Math.max(0, opts.topK - reserved.length))]);
  return sorted.filter((c) => kept.has(c));
}
