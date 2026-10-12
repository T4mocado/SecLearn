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
  /** Post-answer LLM judgement of this chunk. Absent = not judged (judge off, failed, or old message). */
  judge?: SourceJudgement;
};

export type CitationSupport = { claim: string; score: number };

/** LLM-as-judge scores, 0..100 integers. */
export type SourceJudgement = {
  /** How closely the chunk addresses the user's question. */
  questionRelevance: number;
  /** How much of the answer's content comes from this chunk. */
  answerContribution: number;
  /** One sentence explaining the scores, in the chat language. */
  reason: string;
};

export type JudgeVerdict = "relevant" | "partial" | "irrelevant";

/** Verdict thresholds on questionRelevance; derived rather than asked for so label and score never disagree. */
export const RELEVANT_MIN = 70;
export const PARTIAL_MIN = 40;

export function judgeVerdict(j: SourceJudgement): JudgeVerdict {
  if (j.questionRelevance >= RELEVANT_MIN) return "relevant";
  if (j.questionRelevance >= PARTIAL_MIN) return "partial";
  return "irrelevant";
}

const REASON_MAX = 300;

function toScore(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round(Math.min(100, Math.max(0, n)));
}

function toJudgement(value: unknown): SourceJudgement | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const questionRelevance = toScore(v.questionRelevance);
  const answerContribution = toScore(v.answerContribution);
  if (questionRelevance === null || answerContribution === null) return null;
  const reason = typeof v.reason === "string" ? v.reason.trim().slice(0, REASON_MAX) : "";
  return { questionRelevance, answerContribution, reason };
}

/**
 * Parses the judge's reply `{"sources": [{index, questionRelevance, answerContribution, reason}]}`.
 * Tolerates a code fence around the JSON; drops entries with an out-of-range index or non-numeric
 * scores, clamps scores to 0..100 and keeps the first entry for a repeated index.
 * Returns null when the reply is not usable at all.
 */
export function parseJudgement(raw: string, sourceCount: number): Map<number, SourceJudgement> | null {
  const json = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { sources?: unknown } | null)?.sources;
  if (!Array.isArray(list)) return null;
  const out = new Map<number, SourceJudgement>();
  for (const item of list) {
    const index = Number((item as { index?: unknown } | null)?.index);
    if (!Number.isInteger(index) || index < 1 || index > sourceCount || out.has(index)) continue;
    const judgement = toJudgement(item);
    if (judgement) out.set(index, judgement);
  }
  return out.size ? out : null;
}

/**
 * Display priority, most important first: AI answer contribution, then AI question relevance,
 * then cross-encoder relevance, then retrieval order. Judged sources rank above unjudged ones
 * (a partial judge reply), which keeps this a total order instead of mixing score scales.
 */
export function compareByPriority(a: MessageSource, b: MessageSource): number {
  const key = (s: MessageSource) => [
    s.judge ? 1 : 0,
    s.judge?.answerContribution ?? 0,
    s.judge?.questionRelevance ?? 0,
    s.rerankScore ?? -1,
    -s.index,
  ];
  const ka = key(a);
  const kb = key(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return kb[i]! - ka[i]!;
  }
  return 0;
}

export function prioritySources(sources: MessageSource[]): MessageSource[] {
  return [...sources].sort(compareByPriority);
}

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

/** Cited sources first, then the rest; within each group by `compareByPriority`. */
export function orderSources(
  sources: MessageSource[],
  cited: Set<number>,
): { cited: MessageSource[]; unused: MessageSource[] } {
  // Never renumber: `index` is what the answer text cites, only the display order changes.
  const sorted = prioritySources(sources);
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
export type CitationClaim = { index: number; claim: string; at: number };

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
    const clause = previous ? cleanExcerpt(sentence.slice(previous.index + previous[0].length)) : "";
    const claim = (clause.length >= CLAUSE_MIN ? clause : cleanExcerpt(sentence)).slice(0, CLAUSE_MAX);
    if (claim) out.push({ index: n, claim, at: match.index });
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
      const support = s.support === undefined || isSupportList(s.support) ? s.support : undefined;
      const judge = s.judge === undefined ? undefined : (toJudgement(s.judge) ?? undefined);
      if (support === s.support && judge === s.judge) return s;
      return { ...s, support, judge };
    });
}
