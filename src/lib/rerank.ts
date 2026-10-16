import { getEnv } from "@/lib/env";

/** Posts to the cross-encoder in scripts/embed_server.py; null when no reranker is configured. */
async function postRerank(body: object, expected: number): Promise<number[] | null> {
  const url = getEnv().RERANK_URL.trim();
  if (!url || !expected) return null;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
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
 */
export function selectByRelevance<T extends { id: string; rerankScore: number }>(
  items: T[],
  opts: {
    topK: number;
    minRelevance: number;
    minKeep: number;
    /** Also drop items under this share of the best score. */
    relativeMin?: number;
    topics?: { ids: string[]; minRelevance: number };
    carried?: { ids: string[]; max: number; minRelevance: number };
  },
): T[] {
  const sorted = [...items].sort((a, b) => b.rerankScore - a.rerankScore);
  const floor = Math.max(opts.minRelevance, (opts.relativeMin ?? 0) * (sorted[0]?.rerankScore ?? 0));
  const passing = sorted.filter((c) => c.rerankScore >= floor).length;
  const { topics, carried } = opts;
  const reserved = [
    ...new Set([
      ...(topics ? sorted.filter((c) => topics.ids.includes(c.id) && c.rerankScore >= topics.minRelevance) : []),
      ...(carried?.max
        ? sorted.filter((c) => carried.ids.includes(c.id) && c.rerankScore >= carried.minRelevance).slice(0, carried.max)
        : []),
    ]),
  ].slice(0, opts.topK);
  // Nothing passes: off topic, unless reserved chunks have no floor (a REFORMAT request's previous passages).
  if (!passing && !reserved.length) return [];
  const selected = passing ? sorted.slice(0, Math.min(opts.topK, Math.max(passing, opts.minKeep))) : [];
  if (reserved.every((c) => selected.includes(c))) return selected;
  const others = selected.filter((c) => !reserved.includes(c));
  const kept = new Set([...reserved, ...others.slice(0, Math.max(0, opts.topK - reserved.length))]);
  return sorted.filter((c) => kept.has(c));
}
