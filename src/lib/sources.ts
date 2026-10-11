/** A retrieved chunk as shown to the model, snapshotted so it survives document reindex/deletion. */
export type MessageSource = {
  /** 1-based number the model cites as [n]. */
  index: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  score: number;
  method: "vector" | "keyword";
  /** Cross-encoder relevance 0..1; absent on old messages or when reranking was off. */
  rerankScore?: number;
  /** Post-answer check: how well this chunk backs each answer clause citing it (0..1). Absent = not checked. */
  support?: CitationSupport[];
};

export type CitationSupport = { claim: string; score: number };

/**
 * Cross-encoder score from which a cited clause counts as backed by its chunk. On 13 real pairs, backed
 * clauses scored ≥0.063 (short subject-less ones lowest) and made-up or wrong-chunk ones ≤0.031.
 * The gap is narrow: recalibrate on the evaluation set (docs/ERRORS.md #12).
 */
export const SUPPORT_THRESHOLD = 0.05;

export function isSupported(score: number): boolean {
  return score >= SUPPORT_THRESHOLD;
}

const CITATION_RE = /\[(\d{1,2})\]/g;

export function citedIndexes(content: string, sourceCount: number): Set<number> {
  const cited = new Set<number>();
  for (const match of content.matchAll(CITATION_RE)) {
    const n = Number(match[1]);
    if (n >= 1 && n <= sourceCount) cited.add(n);
  }
  return cited;
}

/** Cited sources first, then the rest; within each group by relevance (rerank score, else retrieval order). */
export function orderSources(
  sources: MessageSource[],
  cited: Set<number>,
): { cited: MessageSource[]; unused: MessageSource[] } {
  // Never renumber: `index` is what the answer text cites, only the display order changes.
  const byRelevance = (a: MessageSource, b: MessageSource) =>
    a.rerankScore !== undefined && b.rerankScore !== undefined && a.rerankScore !== b.rerankScore
      ? b.rerankScore - a.rerankScore
      : a.index - b.index;
  const sorted = [...sources].sort(byRelevance);
  return {
    cited: sorted.filter((s) => cited.has(s.index)),
    unused: sorted.filter((s) => !cited.has(s.index)),
  };
}

const TRAILING_CITATIONS_RE = /(\s*\[\d{1,2}\])+\s*$/;
const SENTENCE_END_RE = /[.!?](?=\s)|\n/g;
const EXCERPT_MAX = 240;
const CLAUSE_MAX = 1000;
/** Shorter clauses ("và FIDO2") read as fragments, so the whole sentence is shown instead. */
const CLAUSE_MIN = 20;

function cleanExcerpt(text: string): string {
  return stripCitations(text)
    .replace(/^[\s,;:–—-]+/, "")
    .replace(/^(?:[*+]|\d+\.)\s+/, "")
    .replace(/\*\*/g, "")
    .trim();
}

/** One valid `[n]` marker in an answer, with the clause it backs. */
/**
 * One valid `[n]` marker in an answer. `claim` is the text scored against the chunk; `start`..`at` is
 * the raw span of the marker's own clause (never overlaps another marker's span), used for hover.
 */
export type CitationClaim = { index: number; claim: string; start: number; at: number };

/** Leading separators and list bullets that should not be highlighted as part of a clause. */
const LEADING_JUNK_RE = /^[\s,;:–—-]*(?:(?:[*+]|\d+\.)\s+)?/;

/**
 * Every valid `[n]` marker with the answer text it cites, without citation markers.
 * Handles both "Sentence [1]." and "Sentence. [1]" and grouped markers like "[2][3]".
 * With several markers in one sentence ("A [1], B [2]"), each marker gets only its own clause.
 * Shared by the server-side check and the sources panel, so both see the same claims.
 */
export function citationClaims(content: string, sourceCount: number): CitationClaim[] {
  const out: CitationClaim[] = [];
  for (const match of content.matchAll(CITATION_RE)) {
    const n = Number(match[1]);
    if (n < 1 || n > sourceCount) continue;
    // Text before this marker, minus markers right before it ("[2][3]") and the sentence's own terminator.
    const head = content
      .slice(0, match.index)
      .replace(TRAILING_CITATIONS_RE, "")
      .trimEnd()
      .replace(/[.!?]$/, "");
    let start = 0;
    for (const end of head.matchAll(SENTENCE_END_RE)) start = end.index + 1;
    const sentence = head.slice(start);
    const previous = [...sentence.matchAll(CITATION_RE)].at(-1);
    const clauseFrom = start + (previous ? previous.index + previous[0].length : 0);
    const clause = previous ? cleanExcerpt(sentence.slice(previous.index + previous[0].length)) : "";
    const claim = (clause.length >= CLAUSE_MIN ? clause : cleanExcerpt(sentence)).slice(0, CLAUSE_MAX);
    // The hover span always starts after the previous marker, even when the scored claim falls back to the sentence.
    const spanStart = clauseFrom + LEADING_JUNK_RE.exec(content.slice(clauseFrom, head.length))![0].length;
    if (claim) out.push({ index: n, claim, start: Math.min(spanStart, match.index), at: match.index });
  }
  return out;
}

/** Distinct claims per cited source, in answer order. */
export function claimsBySource(claims: CitationClaim[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const { index, claim } of claims) {
    const list = out.get(index) ?? [];
    if (!list.includes(claim)) list.push(claim);
    out.set(index, list);
  }
  return out;
}

export function truncateClaim(claim: string): string {
  return claim.length > EXCERPT_MAX ? `${claim.slice(0, EXCERPT_MAX).trimEnd()}…` : claim;
}

export function supportScore(source: MessageSource | undefined, claim: string): number | undefined {
  return source?.support?.find((s) => s.claim === claim)?.score;
}

/** Check results sent after the answer (`verification` SSE event) without resending chunk text. */
export type SupportPatch = { index: number; support: CitationSupport[] };

export function supportPatch(sources: MessageSource[]): SupportPatch[] {
  return sources.flatMap((s) => (s.support ? [{ index: s.index, support: s.support }] : []));
}

export function parseSupportPatch(value: unknown): SupportPatch[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (p): p is SupportPatch =>
      !!p && typeof p === "object" && typeof (p as SupportPatch).index === "number" && isSupportList((p as SupportPatch).support),
  );
}

export function applySupportPatch(sources: MessageSource[], patch: SupportPatch[]): MessageSource[] {
  if (!patch.length) return sources;
  return sources.map((s) => {
    const support = patch.find((p) => p.index === s.index)?.support;
    return support ? { ...s, support } : s;
  });
}

/** Old answers cite numbers from their own context; drop them so the model doesn't mix them up with the new one. */
export function stripCitations(content: string): string {
  return content.replace(CITATION_RE, "").replace(/[ \t]+([.,;:!?])/g, "$1");
}

function isSupportList(value: unknown): value is CitationSupport[] {
  return (
    Array.isArray(value) &&
    value.every(
      (s) =>
        !!s &&
        typeof s === "object" &&
        typeof (s as CitationSupport).claim === "string" &&
        typeof (s as CitationSupport).score === "number",
    )
  );
}

export function parseSources(value: unknown): MessageSource[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter(
      (s): s is MessageSource =>
        !!s &&
        typeof s === "object" &&
        typeof (s as MessageSource).index === "number" &&
        typeof (s as MessageSource).content === "string" &&
        typeof (s as MessageSource).documentTitle === "string",
    )
    .map((s) => {
      // Drafts live in localStorage; a malformed check result must not crash the panel.
      if (s.support === undefined || isSupportList(s.support)) return s;
      return { ...s, support: undefined };
    });
}
