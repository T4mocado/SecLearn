import { judgeSources } from "@/lib/judge";
import { rerankPairs } from "@/lib/rerank";
import {
  citationClaims,
  claimsBySource,
  splitSentences,
  type CitationSupport,
  type MessageSource,
} from "@/lib/sources";

/**
 * Checks each cited clause of a finished answer against the chunk it cites and attaches the
 * scores as `support`, with the chunk sentence that best matches the clause as `evidence` (shown
 * when hovering the clause). Claim/chunk and claim/sentence pairs go to the cross-encoder in one
 * request; no LLM tokens. Returns the sources unchanged when nothing is cited or no reranker is set.
 */
export async function verifyCitations(answer: string, sources: MessageSource[]): Promise<MessageSource[]> {
  const bySource = claimsBySource(citationClaims(answer, sources.length));
  const items = sources.flatMap((s) => (bySource.get(s.index) ?? []).map((claim) => ({ source: s, claim })));
  if (!items.length) return sources;

  // A one-sentence chunk is its own evidence: highlighting all of it adds nothing.
  const sentences = new Map(sources.map((s) => [s, splitSentences(s.content)]));
  const evidencePairs = items.flatMap(({ source, claim }, item) => {
    const ranges = sentences.get(source)!;
    return ranges.length < 2
      ? []
      : ranges.map((range) => ({ item, range, pair: [claim, source.content.slice(range.start, range.end)] as [string, string] }));
  });

  let scores: number[] | null;
  try {
    scores = await rerankPairs([
      ...items.map(({ source, claim }): [string, string] => [claim, source.content]),
      ...evidencePairs.map((e) => e.pair),
    ]);
  } catch (err) {
    // The answer is already delivered; without scores the panel just shows no check marks.
    console.warn("[verify] citation check failed:", err instanceof Error ? err.message : err);
    return sources;
  }
  if (!scores) return sources;

  const evidence = new Map<number, { range: CitationSupport["evidence"]; score: number }>();
  evidencePairs.forEach(({ item, range }, i) => {
    const score = scores[items.length + i]!;
    const best = evidence.get(item);
    if (!best || score > best.score) evidence.set(item, { range, score });
  });

  return sources.map((s) => {
    const support = items.flatMap((item, i): CitationSupport[] => {
      if (item.source !== s) return [];
      const range = evidence.get(i)?.range;
      return [{ claim: item.claim, score: scores[i]!, ...(range ? { evidence: range } : {}) }];
    });
    return support.length ? { ...s, support } : s;
  });
}

/**
 * Post-answer checks in order of speed. Yields the sources after each step, so the panel shows the
 * citation check while the slower LLM judgement is still running; the last value is the one to store.
 */
export async function* finalizeSources(opts: {
  question: string;
  answer: string;
  sources: MessageSource[];
  locale: string;
}): AsyncGenerator<MessageSource[], void, unknown> {
  const verified = await verifyCitations(opts.answer, opts.sources);
  yield verified;
  const judged = await judgeSources({ ...opts, sources: verified });
  if (judged !== verified) yield judged;
}
