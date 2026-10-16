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

/** A heading as the cheat-sheet site prints it: "Monitoring¶". */
const PILCROW_HEADING_RE = /^(\S.{0,150}?)\s*¶\s*$/;
const FOOTER_START_RE = /^©Copyright \d{4} - Cheat Sheets Series Team/;
const FOOTER_END_RE = /Made with Material for MkDocs/;

/**
 * OWASP cheat sheets printed from the website start with the site's chrome: "Skip to content", the menu
 * listing every cheat sheet, and two tables of contents before the first "Title¶" heading; they end with
 * the site footer. The menu alone was 743 of 5684 chunks (docs/ERRORS.md #29, #30). Drops both and turns
 * "Heading¶" lines into "## Heading", so chunks can start at sections. Other documents keep their text.
 */
export function removeSiteChrome(text: string): string {
  let lines = text.split("\n");
  const printedSite = lines.slice(0, 5).some((l) => l.trim() === "Skip to content") && text.includes("OWASP Cheat Sheet Series");
  if (printedSite) {
    const first = lines.findIndex((l) => PILCROW_HEADING_RE.test(l.trim()));
    if (first > 0) lines = lines.slice(first);
    const footer = lines.findIndex((l) => FOOTER_START_RE.test(l.trim()));
    if (footer >= 0) {
      const end = lines.findIndex((l, i) => i >= footer && FOOTER_END_RE.test(l));
      lines = [...lines.slice(0, footer), ...(end >= 0 ? lines.slice(end + 1) : [])];
    }
  }
  return lines
    .map((l) => {
      const heading = PILCROW_HEADING_RE.exec(l.trim());
      return heading ? `## ${heading[1]}` : l;
    })
    .join("\n")
    .trim();
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
