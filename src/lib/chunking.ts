/**
 * Splits a document's markdown into chunks for embedding. Chunks end at sentence ends and start at
 * section headings where they can: cut every 800 characters at a space, 93% of chunks ended
 * mid-sentence, and answers showed "…" or "(the rest is not in the excerpt)" (docs/ERRORS.md #30).
 */

/** A markdown heading line ("## Monitoring"); `removeSiteChrome` turns the cheat sheets' "Monitoring¶" into one. */
const HEADING_RE = /^(#{1,6})\s+\S/;
/** End of a sentence: . ! ? and closing quotes or brackets, then whitespace. PDF lines wrap mid-sentence, so a newline alone is not one. */
const SENTENCE_END_RE = /[.!?]["'”’)\]]*(?=\s)/g;
/** Shorter pieces ("2.", "e.g.") join the next sentence instead of standing alone. */
const MIN_SENTENCE = 25;
/** A heading starts a new chunk once the current one has this share of `size`; smaller sections join the next. */
const MIN_FILL = 0.25;
/**
 * Section names that say nothing alone. The PDFs print headings without levels, so such a heading is
 * named after the last specific one: "## Cons" became "## SMS Messages and Phone Calls — Cons", whose
 * chunk "SMS OTP disadvantages" had scored 0.20 while another "Cons" was taken for it (docs/ERRORS.md #33).
 */
const GENERIC_HEADING_RE =
  /^(?:pros|cons|examples?|introduction|references|description|overview|context|approach|summary|background|usage|notes?|do|don'?t|do'?s and don'?ts|recommendations?|mitigations?|remediation|tools|how to test|test objectives|gr[ae]y-box testing|black-box testing|related test cases)$/i;

type Piece = { text: string; sep: string; heading: boolean };

/** Sentences of a paragraph with the whitespace before each; blocks longer than `size` split at a line break or space. */
function sentences(paragraph: string, sep: string, size: number): Piece[] {
  const out: Piece[] = [];
  let from = 0;
  const push = (to: number) => {
    const raw = paragraph.slice(from, to);
    const text = raw.trim();
    if (text) {
      const lead = raw.slice(0, raw.length - raw.trimStart().length);
      out.push({ text, sep: out.length ? lead || " " : sep, heading: false });
    }
    from = to;
  };
  for (const m of paragraph.matchAll(SENTENCE_END_RE)) {
    const end = m.index + m[0].length;
    if (paragraph.slice(from, end).trim().length >= MIN_SENTENCE) push(end);
  }
  push(paragraph.length);
  return out.flatMap((p) => hardSplit(p, size));
}

/** A piece with no sentence end inside `size` (code, tables, lists): cut at the last line break, else space. */
function hardSplit(piece: Piece, size: number): Piece[] {
  const out: Piece[] = [];
  let rest = piece.text;
  let sep = piece.sep;
  while (rest.length > size) {
    const window = rest.slice(0, size);
    const at = [window.lastIndexOf("\n"), window.lastIndexOf(" ")].find((i) => i > size * 0.4) ?? size;
    out.push({ text: rest.slice(0, at).trimEnd(), sep, heading: false });
    sep = rest[at] === "\n" ? "\n" : " ";
    rest = rest.slice(at).trimStart();
  }
  if (rest) out.push({ text: rest, sep, heading: false });
  return out;
}

/** Headings and sentences in order, each with the whitespace that preceded it in the document. */
function pieces(text: string, size: number): Piece[] {
  const out: Piece[] = [];
  let paragraph: string[] = [];
  let sep = "";
  let blank = false;
  const flush = () => {
    if (paragraph.length) out.push(...sentences(paragraph.join("\n"), sep, size));
    paragraph = [];
  };
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      flush();
      blank = true;
      continue;
    }
    const lineSep = out.length || paragraph.length ? (blank ? "\n\n" : "\n") : "";
    if (HEADING_RE.test(line)) {
      flush();
      out.push({ text: line.trim(), sep: lineSep, heading: true });
    } else {
      if (!paragraph.length) sep = lineSep;
      paragraph.push(line);
    }
    blank = false;
  }
  flush();
  return out;
}

const join = (list: Piece[]) => list.map((p, i) => (i ? p.sep : "") + p.text).join("");
const length = (list: Piece[]) => join(list).length;

/**
 * Packs sentences into chunks of at most `size` characters (a single over-long block is cut at a line
 * break). A heading starts a new chunk; a chunk starting inside a section begins with that section's
 * heading, so "A10 Server-Side Request Forgery (SSRF)" stays with its advice. Consecutive chunks of a
 * section share the whole trailing sentences that fit in `overlap` characters.
 */
export function chunkMarkdown(markdown: string, size: number, overlap: number): string[] {
  const text = markdown.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const chunks: string[] = [];
  let current: Piece[] = [];
  /** The section heading in force (not the document title, which every source already shows). */
  let section: Piece | null = null;
  const hasText = () => current.some((p) => !p.heading);
  const emit = () => {
    if (hasText()) chunks.push(join(current));
  };
  /** A heading's text goes on its own line; the first piece of a chunk has no whitespace before it. */
  const append = (piece: Piece) => {
    const prev = current.at(-1);
    const sep = !prev ? "" : prev.heading && !piece.sep.includes("\n") ? "\n" : piece.sep;
    current.push({ ...piece, sep });
  };
  /** A fresh chunk inside the current section: its heading, then `carry`. */
  const restart = (carry: Piece[]) => {
    current = [];
    if (section) append(section);
    carry.forEach(append);
  };

  /** The last specific section heading's text, which a generic one is named after. */
  let parent: string | null = null;

  for (const raw of pieces(text, size)) {
    if (raw.heading) {
      if (hasText() && length(current) >= size * MIN_FILL) {
        emit();
        current = [];
      }
      const [, hashes = "", name = ""] = /^(#{1,6})\s+(.*)$/.exec(raw.text) ?? [];
      let piece = raw;
      if (hashes === "#") {
        parent = null;
      } else if (GENERIC_HEADING_RE.test(name.trim())) {
        if (parent) piece = { ...raw, text: `${hashes} ${parent} — ${name.trim()}` };
      } else {
        parent = name.trim();
      }
      section = hashes === "#" ? null : piece;
      append(piece);
      continue;
    }
    const piece = raw;
    if (hasText() && length([...current, piece]) > size) {
      emit();
      const body = current.filter((p) => !p.heading);
      const carry: Piece[] = [];
      for (let i = body.length - 1; i >= 0 && length([body[i]!, ...carry]) <= overlap; i--) carry.unshift(body[i]!);
      restart(carry);
      if (length([...current, piece]) > size) restart([]);
    }
    append(piece);
  }
  emit();
  return chunks;
}
