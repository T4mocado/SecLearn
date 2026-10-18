import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkMarkdown, chunkMarkdownWithSpans } from "./chunking";
import { addWstgHeadings, removeSiteChrome } from "./pdf-cleanup";

// As pdf-parse extracts an OWASP cheat sheet printed from the website (shortened).
const PRINTED = [
  "Skip to content",
  "logo",
  "OWASP Cheat Sheet Series",
  "Server Side Request Forgery Prevention",
  "Search",
  "Cheatsheets",
  "Abuse Case",
  "Access Control",
  "Server Side Request Forgery Prevention Server Side Request Forgery Prevention",
  "Table of contents",
  "Introduction",
  "Context",
  "gRPC Security",
  "Table of contents",
  "Introduction",
  "Context",
  "Server-Side Request Forgery Prevention Cheat Sheet¶",
  "Introduction¶",
  "The objective of the cheat sheet is to provide advice regarding the protection against SSRF. This talk from",
  "the security researcher Orange Tsai provides techniques.",
  "Context¶",
  "SSRF is an attack vector that abuses an application.",
  "©Copyright 2026 - Cheat Sheets Series Team - This work is licensed under Creative Commons Attribution-",
  "ShareAlike 4.0 International.",
  "Made with Material for MkDocs",
].join("\n");

test("removeSiteChrome drops the site menu and footer and turns ¶ headings into markdown headings", () => {
  // The menu was 743 of 5684 chunks, and 93% of chunks ended mid-sentence (docs/ERRORS.md #30).
  assert.equal(
    removeSiteChrome(PRINTED),
    [
      "## Server-Side Request Forgery Prevention Cheat Sheet",
      "## Introduction",
      "The objective of the cheat sheet is to provide advice regarding the protection against SSRF. This talk from",
      "the security researcher Orange Tsai provides techniques.",
      "## Context",
      "SSRF is an attack vector that abuses an application.",
    ].join("\n"),
  );
});

test("removeSiteChrome leaves other documents alone", () => {
  const book = "4.1 Introduction\nThe tester will start by asking simple questions. Is there a firewall?\nPage text continues.";
  assert.equal(removeSiteChrome(book), book);
  // A ¶ inside a sentence is not a heading.
  assert.equal(removeSiteChrome("Use the ¶ sign. It marks paragraphs."), "Use the ¶ sign. It marks paragraphs.");
});

const sentence = (n: number, words = 12) =>
  `Sentence ${n} ${Array.from({ length: words }, (_, i) => `word${i}`).join(" ")}.`;

test("chunkMarkdown ends chunks at sentence ends, never mid-sentence", () => {
  // PDF lines wrap mid-sentence: a single newline is not a boundary.
  const body = Array.from({ length: 30 }, (_, i) => sentence(i)).join(" ").replace(/ (word6)/g, "\n$1");
  const chunks = chunkMarkdown(`# Doc\n\n## Section\n${body}`, 400, 80);
  assert.ok(chunks.length > 3);
  for (const c of chunks) {
    assert.ok(c.length <= 400 + 60, `too long: ${c.length}`);
    assert.match(c, /\.$/, `ends mid-sentence: …${c.slice(-40)}`);
  }
  // Every sentence is kept whole somewhere.
  for (let i = 0; i < 30; i++) assert.ok(chunks.some((c) => c.replace(/\n/g, " ").includes(sentence(i))), `lost sentence ${i}`);
});

test("chunkMarkdown starts a chunk at a heading and repeats the section heading on later chunks", () => {
  const md = [
    "# DotNet Security",
    "",
    "## Monitoring",
    Array.from({ length: 6 }, (_, i) => sentence(i)).join(" "),
    "## A10 Server-Side Request Forgery (SSRF)",
    "DO: Validate and sanitize all user input before using it to make a request.",
    Array.from({ length: 8 }, (_, i) => sentence(100 + i)).join(" "),
  ].join("\n");
  const chunks = chunkMarkdown(md, 400, 0);
  const a10 = chunks.findIndex((c) => c.startsWith("## A10 Server-Side Request Forgery (SSRF)\nDO: Validate"));
  assert.ok(a10 > 0, "the A10 section starts its own chunk");
  // A chunk that starts inside a section carries its heading, so "A10 …" stays with its facts.
  for (const c of chunks.slice(a10 + 1)) assert.ok(c.startsWith("## A10 Server-Side Request Forgery (SSRF)\n"), c.slice(0, 60));
  assert.ok(chunks.every((c) => c.trim().length > 0));
});

test("chunkMarkdown hard-splits only a block with no sentence end, at a line break", () => {
  const code = Array.from({ length: 60 }, (_, i) => `const value${i} = compute(${i})`).join("\n");
  const chunks = chunkMarkdown(`## Code\n${code}`, 300, 0);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(c.length <= 300 + 40);
    // Cut at a line break: every line is a whole statement.
    for (const line of c.split("\n").filter((l) => !l.startsWith("## "))) assert.match(line, /^const value\d+ = compute\(\d+\)$/);
  }
});

test("chunkMarkdown overlaps by whole trailing sentences that fit the overlap", () => {
  const short = (n: number) => `Short ${n}.`;
  const md = `## S\n${Array.from({ length: 80 }, (_, i) => short(i)).join(" ")}`;
  const [first, second] = chunkMarkdown(md, 200, 30);
  // "Short 17. Short 18. Short 19." is 29 characters: the last three sentences fit the overlap.
  const tail = first!.split(/(?<=\.) /).slice(-3).join(" ");
  assert.equal(tail.length <= 30, true);
  assert.ok(second!.startsWith(`## S\n${tail} `), second!.slice(0, 60));
});

test("chunkMarkdown keeps a short document whole and drops nothing for empty input", () => {
  assert.deepEqual(chunkMarkdown("# T\n\nOne sentence.", 800, 80), ["# T\n\nOne sentence."]);
  assert.deepEqual(chunkMarkdown("   \n", 800, 80), []);
});

test("chunkMarkdown names a generic heading after its parent section", () => {
  // "## Cons" alone: the SMS drawbacks scored 0.20 for "SMS OTP disadvantages" and another "Cons" (hardware tokens)
  // was taken for them (ERRORS.md #33).
  const md = [
    "# Multifactor Authentication",
    "",
    "## Multifactor Authentication Cheat Sheet",
    "## Introduction",
    sentence(1),
    "## SMS Messages and Phone Calls",
    sentence(2),
    "## Pros",
    sentence(3),
    "## Cons",
    Array.from({ length: 8 }, (_, i) => sentence(10 + i)).join(" "),
    "## Hardware Tokens",
    sentence(4),
  ].join("\n");
  const chunks = chunkMarkdown(md, 300, 0);
  const joined = chunks.join("\n\n");
  assert.match(joined, /## Multifactor Authentication Cheat Sheet — Introduction\n/);
  assert.match(joined, /## SMS Messages and Phone Calls — Pros\n/);
  // A chunk starting inside the Cons section repeats the full heading too.
  const cons = chunks.filter((c) => c.startsWith("## SMS Messages and Phone Calls — Cons\n"));
  assert.ok(cons.length >= 2, chunks.map((c) => c.slice(0, 50)).join(" | "));
  // Specific headings stay as they are.
  assert.match(joined, /## Hardware Tokens\n/);
  assert.doesNotMatch(joined, /— Hardware Tokens/);
});

test("removeSiteChrome drops the '## Sheet' left by a wrapped 'Cheat Sheet¶'", () => {
  const text = "Skip to content\nOWASP Cheat Sheet Series\nIDOR Prevention Cheat\nSheet¶\nIntroduction¶\nIDOR is a vulnerability.";
  assert.equal(removeSiteChrome(text), "## Introduction\nIDOR is a vulnerability.");
});

// As the WSTG text reaches ingest (shortened): a test case's name may wrap over two lines.
const WSTG = [
  "4.1 Information Gathering",
  "4.1.1 Conduct Search Engine Discovery Reconnaissance for Information Leakage",
  "",
  "Conduct Search Engine Discovery Reconnaissance for",
  "Information Leakage",
  "ID",
  "WSTG-INFO-01",
  "Summary",
  "In order for search engines to work, computer programs regularly fetch data.",
  "",
  "Testing for Buffer Overflow",
  "ID",
  "WSTG-INPV-13",
  "This content has been removed",
  "",
  "Testing for Format String Injection",
  "ID",
  "WSTG-INPV-13",
  "Summary",
  "A format string is a null-terminated character sequence.",
].join("\n");

test("addWstgHeadings turns each test case into a '## WSTG-XXXX-NN <name>' section", () => {
  assert.equal(
    addWstgHeadings(WSTG),
    [
      "4.1 Information Gathering",
      "4.1.1 Conduct Search Engine Discovery Reconnaissance for Information Leakage",
      "",
      "## WSTG-INFO-01 Conduct Search Engine Discovery Reconnaissance for Information Leakage",
      "Summary",
      "In order for search engines to work, computer programs regularly fetch data.",
      "",
      "## WSTG-INPV-13 Testing for Format String Injection",
      "Summary",
      "A format string is a null-terminated character sequence.",
    ].join("\n"),
  );
});

test("addWstgHeadings leaves other documents alone", () => {
  const text = "## Introduction\nThe ID of a session is random.\nID\nnot a test case";
  assert.equal(addWstgHeadings(text), text);
});

/** Text without heading lines (the chunker renames generic ones) and with whitespace collapsed. */
const comparable = (s: string) =>
  s
    .split("\n")
    .filter((l) => !/^#{1,6}\s/.test(l.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/** The invariant gold spans rely on: the markdown under each chunk's span is that chunk's body. */
function assertSpans(markdown: string, size: number, overlap: number) {
  const spans = chunkMarkdownWithSpans(markdown, size, overlap);
  assert.deepEqual(
    spans.map((s) => s.text),
    chunkMarkdown(markdown, size, overlap),
  );
  for (const s of spans) {
    assert.ok(0 <= s.charStart && s.charStart < s.charEnd && s.charEnd <= markdown.length, `${s.charStart}-${s.charEnd}`);
    assert.equal(comparable(markdown.slice(s.charStart, s.charEnd)), comparable(s.text), s.text.slice(0, 60));
  }
  return spans;
}

test("chunkMarkdownWithSpans: a chunk's span starts at its first sentence, overlap included, not at the heading put back", () => {
  const body = Array.from({ length: 40 }, (_, i) => sentence(i)).join(" ").replace(/ (word6)/g, "\n$1");
  const md = `# Doc\n\n## Section\n${body}\n\n## Cons\n${body}`;
  const spans = assertSpans(md, 400, 200);
  const later = spans.find((s, i) => i > 0 && s.text.startsWith("## Section\n"))!;
  const firstSentence = later.text.slice("## Section\n".length).split("\n")[0]!;
  assert.ok(md.slice(later.charStart).startsWith(firstSentence), firstSentence);
  assert.ok(spans[1]!.charStart < spans[0]!.charEnd, "overlap: the next span starts inside the previous one");
});

test("chunkMarkdownWithSpans: hard-split blocks, WSTG sections, CRLF and leading whitespace", () => {
  const code = Array.from({ length: 60 }, (_, i) => `const value${i} = compute(${i})`).join("\n");
  assert.ok(assertSpans(`## Code\n${code}`, 300, 0).length > 1);
  assertSpans(`# wstg-v4.2\n\n${addWstgHeadings(WSTG)}`, 120, 30);
  const crlf = `  \r\n# T\r\n\r\n## A\r\n${Array.from({ length: 20 }, (_, i) => sentence(i)).join("\r\n")}`;
  assert.ok(assertSpans(crlf, 300, 60).length > 1);
});
