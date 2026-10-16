import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkMarkdown } from "./chunking";
import { removeSiteChrome } from "./pdf-cleanup";

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
