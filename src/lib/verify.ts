import { rerankPairs } from "@/lib/rerank";
import { citationClaims, claimsBySource, supportPatch, type MessageSource } from "@/lib/sources";

/**
 * Checks each cited clause of a finished answer against the chunk it cites and attaches the
 * scores as `support`. Returns the sources unchanged when nothing is cited or no reranker is set.
 */
export async function verifyCitations(answer: string, sources: MessageSource[]): Promise<MessageSource[]> {
  const bySource = claimsBySource(citationClaims(answer, sources.length));
  const items = sources.flatMap((s) => (bySource.get(s.index) ?? []).map((claim) => ({ source: s, claim })));
  if (!items.length) return sources;

  let scores: number[] | null;
  try {
    scores = await rerankPairs(items.map(({ source, claim }) => [claim, source.content]));
  } catch (err) {
    // The answer is already delivered; without scores the panel just shows no check marks.
    console.warn("[verify] citation check failed:", err instanceof Error ? err.message : err);
    return sources;
  }
  if (!scores) return sources;

  return sources.map((s) => {
    const support = items.flatMap((item, i) => (item.source === s ? [{ claim: item.claim, score: scores[i]! }] : []));
    return support.length ? { ...s, support } : s;
  });
}

/** SSE event carrying only the check results, so chunk text is not sent a second time. */
export function verificationEvent(sources: MessageSource[]): { event: string; data: unknown } | null {
  const verification = supportPatch(sources);
  return verification.length ? { event: "verification", data: { verification } } : null;
}
