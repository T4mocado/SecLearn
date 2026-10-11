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
