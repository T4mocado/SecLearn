/**
 * Picks the chunk sentence that best matches an answer clause by shared words, in the browser and for free
 * (no model call). Vietnamese answers over English chunks mostly share technical terms (U2F, CAPTCHA, npm),
 * so a zero overlap is common there: the excerpt then starts at the chunk's beginning with nothing marked.
 */

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}_\-/.]*[\p{L}\p{N}]|[\p{L}\p{N}]/gu;
const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "are", "from", "can", "not", "use", "used",
  "của", "và", "các", "là", "có", "cho", "được", "một", "những", "trong", "không", "này", "để", "với",
  "khi", "từ", "theo", "như", "bạn", "nên", "người", "dùng",
]);

function words(text: string): Set<string> {
  const out = new Set<string>();
  for (const [w] of text.toLowerCase().matchAll(WORD_RE)) {
    if ((w.length >= 3 || /\d/.test(w)) && !STOP.has(w)) out.add(w);
  }
  return out;
}

export type ChunkExcerpt = { before: string; match: string; after: string };

const squash = (s: string) => s.replace(/\s+/g, " ");

export function chunkExcerpt(chunk: string, claim: string, max = 300): ChunkExcerpt {
  const wanted = words(claim);
  let best = { start: 0, end: 0, score: 0 };
  // PDF chunks wrap lines mid-sentence, so a single "\n" is not a boundary; "¶" ends cheat-sheet headings.
  const boundary = /[.!?¶](?=\s)|\n\s*\n/g;
  let start = 0;
  const consider = (end: number) => {
    const sentence = chunk.slice(start, end);
    let score = 0;
    for (const w of words(sentence)) if (wanted.has(w)) score += /\d/.test(w) || w.length >= 6 ? 2 : 1;
    // On a tie prefer the longer sentence: a bare heading ("CAPTCHA¶") says less than the sentence after it.
    if (score > best.score || (score && score === best.score && end - start > best.end - best.start)) {
      best = { start, end, score };
    }
  };
  for (const m of chunk.matchAll(boundary)) {
    consider(m.index + m[0].length);
    start = m.index + m[0].length;
  }
  consider(chunk.length);

  if (!best.score) {
    return { before: "", match: "", after: squash(chunk.slice(0, max)).trim() + (chunk.length > max ? "…" : "") };
  }
  const to = best.end;
  let from = best.start;
  while (from < to && /\s/.test(chunk[from]!)) from++;
  if (to - from >= max) return { before: "", match: squash(chunk.slice(from, from + max)).trim() + "…", after: "" };

  // Spend the remaining budget on context around the match, snapped to word boundaries.
  const room = max - (to - from);
  let left = Math.max(0, from - Math.floor(room / 2));
  let right = Math.min(chunk.length, to + (room - (from - left)));
  if (left > 0) left = chunk.indexOf(" ", left) + 1 || from;
  if (right < chunk.length) right = Math.max(to, chunk.lastIndexOf(" ", right));
  return {
    before: (left > 0 ? "…" : "") + squash(chunk.slice(left, from)).trimStart(),
    match: squash(chunk.slice(from, to)),
    after: squash(chunk.slice(to, right)).trimEnd() + (right < chunk.length ? "…" : ""),
  };
}
