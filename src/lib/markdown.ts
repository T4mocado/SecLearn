/**
 * Minimal Markdown parser for chat answers. Every text node keeps its offsets into the raw answer, so the
 * renderer can highlight a cited clause (CitationClaim.start..at) even when it crosses **bold** or *italic*.
 * Supports paragraphs, headings, "-" and "1." lists, ``` code blocks, **bold**, *italic* or _italic_, `code` and [n].
 * Produces data only; rendering builds React elements, never HTML strings.
 */

export type InlineNode =
  | { type: "text"; start: number; end: number }
  | { type: "code"; start: number; end: number }
  | { type: "strong" | "em"; children: InlineNode[] }
  | { type: "cite"; index: number; start: number; end: number };

export type ListItem = { indent: number; children: InlineNode[] };

export type Block =
  | { type: "p"; lines: InlineNode[][] }
  | { type: "h"; level: number; children: InlineNode[] }
  | { type: "ul" | "ol"; items: ListItem[] }
  | { type: "code"; text: string };

const HEADING_RE = /^(#{1,6})\s+/;
const UL_RE = /^(\s*)[-*+]\s+/;
const OL_RE = /^(\s*)\d{1,3}[.)]\s+/;
const CITE_RE = /^\[(\d{1,2})\]/;
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;

const isWordChar = (c: string | undefined) => !!c && WORD_CHAR_RE.test(c);
const isSpace = (c: string | undefined) => !c || /\s/.test(c);

/** Closing `*`/`_` for an emphasis opened at `open`, or -1. Rejects snake_case and "2 * 3 * 4". */
function findEmphasisClose(src: string, open: number, end: number): number {
  const mark = src[open]!;
  if (isSpace(src[open + 1]) || src[open + 1] === mark || isWordChar(src[open - 1])) return -1;
  for (let j = open + 2; j < end; j++) {
    if (src[j] !== mark || src[j + 1] === mark || src[j - 1] === mark) continue;
    if (!isSpace(src[j - 1]) && !isWordChar(src[j + 1])) return j;
  }
  return -1;
}

export function parseInline(src: string, start: number, end: number): InlineNode[] {
  const out: InlineNode[] = [];
  let textStart = start;
  let i = start;
  const flush = (to: number) => {
    if (to > textStart) out.push({ type: "text", start: textStart, end: to });
  };
  while (i < end) {
    const ch = src[i];
    if (ch === "`") {
      const close = src.indexOf("`", i + 1);
      if (close !== -1 && close < end) {
        flush(i);
        out.push({ type: "code", start: i + 1, end: close });
        i = textStart = close + 1;
        continue;
      }
    } else if (ch === "*" && src[i + 1] === "*") {
      const close = src.indexOf("**", i + 2);
      if (close > i + 2 && close + 2 <= end) {
        flush(i);
        out.push({ type: "strong", children: parseInline(src, i + 2, close) });
        i = textStart = close + 2;
        continue;
      }
      i += 2; // unmatched "**" stays literal; skip both so the second star does not open italic
      continue;
    } else if (ch === "*" || ch === "_") {
      const close = findEmphasisClose(src, i, end);
      if (close !== -1) {
        flush(i);
        out.push({ type: "em", children: parseInline(src, i + 1, close) });
        i = textStart = close + 1;
        continue;
      }
    } else if (ch === "[") {
      const m = CITE_RE.exec(src.slice(i, Math.min(end, i + 4)));
      if (m) {
        flush(i);
        out.push({ type: "cite", index: Number(m[1]), start: i, end: i + m[0].length });
        i = textStart = i + m[0].length;
        continue;
      }
    }
    i++;
  }
  flush(end);
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: InlineNode[][] | null = null;
  let list: { type: "ul" | "ol"; items: ListItem[] } | null = null;
  const flush = () => {
    if (para) blocks.push({ type: "p", lines: para });
    if (list) blocks.push(list);
    para = null;
    list = null;
  };

  const lines = src.split("\n");
  let offset = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    const lineStart = offset;
    offset += line.length + 1;
    // Strip a trailing "\r" from the content range only; offsets stay on the raw string.
    const lineEnd = lineStart + line.replace(/\r$/, "").length;

    if (line.trimStart().startsWith("```")) {
      flush();
      const code: string[] = [];
      while (++li < lines.length && !lines[li]!.trimStart().startsWith("```")) {
        code.push(lines[li]!);
        offset += lines[li]!.length + 1;
      }
      if (li < lines.length) offset += lines[li]!.length + 1; // closing fence
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flush();
      blocks.push({
        type: "h",
        level: heading[1]!.length,
        children: parseInline(src, lineStart + heading[0].length, lineEnd),
      });
      continue;
    }
    const ul = UL_RE.exec(line);
    const ol = ul ? null : OL_RE.exec(line);
    const bullet = ul ?? ol;
    if (bullet) {
      const type = ul ? "ul" : "ol";
      if (para || (list && list.type !== type)) flush();
      list ??= { type, items: [] };
      list.items.push({
        indent: bullet[1]!.length,
        children: parseInline(src, lineStart + bullet[0].length, lineEnd),
      });
      continue;
    }
    if (list) flush();
    para ??= [];
    para.push(parseInline(src, lineStart, lineEnd));
  }
  flush();
  return blocks;
}
