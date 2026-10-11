/** Lines near the top/bottom of each page that are checked for header/footer. */
const EDGE_LINES = 3;
/** A line is header/footer when it appears on at least this share of pages (even/odd layouts ≈ 50%). */
const REPEAT_RATIO = 0.4;
const MIN_PAGES = 3;
const MAX_LINE_CHARS = 160;

const PAGE_NUMBER_RE =
  /^(?:trang|page|tr\.?|p\.?)?\s*[-–—]?\s*\d{1,4}\s*(?:(?:\/|of|trên|\|)\s*\d{1,4})?\s*[-–—]?$/i;

function normalizeLine(line: string): string {
  return line
    .toLowerCase()
    .normalize("NFC")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "")
    .trim();
}

function splitLines(pageText: string): string[] {
  return pageText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Edge line positions tagged by side; top and bottom zones never overlap so body text stays out. */
function edgeIndexes(count: number): Array<{ i: number; side: "top" | "bottom" }> {
  const k = Math.min(EDGE_LINES, Math.floor(count / 3));
  const out: Array<{ i: number; side: "top" | "bottom" }> = [];
  for (let i = 0; i < k; i++) {
    out.push({ i, side: "top" });
    out.push({ i: count - 1 - i, side: "bottom" });
  }
  return out;
}

/**
 * Removes running headers/footers (book/chapter titles, organisation names, URLs, page numbers)
 * by finding edge lines that repeat across many pages. Body text is never touched.
 */
export function removeHeadersFooters(pages: string[]): { text: string; removed: string[] } {
  const pageLines = pages.map(splitLines);
  const pageCount = pageLines.filter((l) => l.length > 0).length;

  const pagesPerKey = new Map<string, number>();
  for (const lines of pageLines) {
    const keys = new Set<string>();
    for (const { i, side } of edgeIndexes(lines.length)) {
      const line = lines[i]!;
      if (line.length > MAX_LINE_CHARS) continue;
      const key = normalizeLine(line);
      if (key) keys.add(`${side}:${key}`);
    }
    for (const key of keys) pagesPerKey.set(key, (pagesPerKey.get(key) ?? 0) + 1);
  }

  const threshold = Math.max(2, Math.ceil(pageCount * REPEAT_RATIO));
  const repeated = new Set<string>();
  if (pageCount >= MIN_PAGES) {
    for (const [key, n] of pagesPerKey) if (n >= threshold) repeated.add(key);
  }

  const removed = new Set<string>();
  const cleanedPages = pageLines.map((lines) => {
    const drop = new Set<number>();
    for (const { i, side } of edgeIndexes(lines.length)) {
      const line = lines[i]!;
      if (line.length > MAX_LINE_CHARS) continue;
      if (PAGE_NUMBER_RE.test(line) || repeated.has(`${side}:${normalizeLine(line)}`)) {
        drop.add(i);
        removed.add(line);
      }
    }
    return lines.filter((_, i) => !drop.has(i)).join("\n");
  });

  return { text: cleanedPages.join("\n\n"), removed: [...removed] };
}
