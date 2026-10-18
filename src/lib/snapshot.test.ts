import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { chunkMarkdownWithSpans } from "./chunking";
import { buildSnapshot, docKey, SnapshotRefused, type SnapshotChunk, type SnapshotDocument } from "./snapshot";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

const OPTS = {
  snapshotId: "2026-10-18-test",
  date: "2026-10-18",
  version: "1.0.0",
  gitCommit: "abc1234",
  gitDirty: false,
  chunker: { version: "sentence-v2", size: 120, overlap: 30 },
  canary: "canary-guid",
};

const sentence = (n: number) => `Sentence ${n} says something useful about sessions and cookies.`;

function doc(id: string, storagePath: string, markdown: string, extra: Partial<SnapshotDocument> = {}): SnapshotDocument {
  return {
    id,
    title: id,
    filename: storagePath,
    storagePath,
    status: "ready",
    errorMessage: null,
    markdown,
    createdAt: new Date("2026-10-10T08:00:00Z"),
    sourceSha256: "f".repeat(64),
    ...extra,
  };
}

/** Chunks as ingest stores them: offsets in metadata, numbered from 0. */
function chunksOf(d: SnapshotDocument): SnapshotChunk[] {
  const md = d.markdown!;
  return chunkMarkdownWithSpans(md, OPTS.chunker.size, OPTS.chunker.overlap).map((c, i) => ({
    id: `${d.id}-c${i}`,
    documentId: d.id,
    chunkIndex: i,
    content: c.text,
    metadata: { char_start: c.charStart, char_end: c.charEnd, md_sha256: sha256(md), chunker_version: OPTS.chunker.version },
  }));
}

const MD_A = `# Session Management\n\n## Cookies\n${Array.from({ length: 6 }, (_, i) => sentence(i)).join(" ")}`;
const MD_B = `# wstg-v4.2\n\n## WSTG-SESS-01 Testing for Session Management Schema\n${sentence(9)} ${sentence(10)}`;
const DOCS = [
  doc("a", "F:\\app\\data\\uploads\\1791629933697-74ec4d39-Session_Management_Cheat_Sheet.pdf", MD_A),
  doc("b", "F:\\app\\data\\uploads\\1791642614658-490fb354-wstg-v4.2.pdf", MD_B),
];
const CHUNKS = DOCS.flatMap(chunksOf);

test("docKey drops the upload prefix and extension", () => {
  assert.equal(docKey("F:\\x\\data\\uploads\\1791642614658-490fb354-wstg-v4.2.pdf"), "wstg-v4.2");
  assert.equal(docKey("/srv/data/uploads/1791627900007-Abuse_Case_Cheat_Sheet.pdf"), "Abuse_Case_Cheat_Sheet");
  assert.equal(docKey("seed://intro.md"), "intro");
});

test("buildSnapshot writes markdown, a manifest whose hashes and counts match, and keyed chunks", () => {
  const files = buildSnapshot(DOCS, CHUNKS, OPTS);
  const manifest = JSON.parse(files["manifest.json"]!);
  assert.equal(manifest.snapshot_id, "2026-10-18-test");
  assert.equal(manifest.chunker.version, "sentence-v2");
  assert.equal(manifest.canary, "canary-guid");
  assert.deepEqual(
    manifest.documents.map((d: { doc_key: string }) => d.doc_key),
    ["Session_Management_Cheat_Sheet", "wstg-v4.2"],
  );
  for (const d of manifest.documents) {
    const md = files[d.md_path]!;
    assert.equal(d.md_sha256, sha256(md));
    assert.equal(d.chars, md.length);
    assert.match(d.source_file, /^data\/uploads\//);
  }
  assert.equal(manifest.documents[0].source_url, "https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html");

  const lines = files[manifest.chunks_path]!.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, CHUNKS.length);
  for (const d of manifest.documents) assert.equal(lines.filter((l) => l.doc_key === d.doc_key).length, d.chunks);
  for (const l of lines) {
    const md = files[`md/${l.doc_key}.md`]!;
    assert.equal(l.chunk_key, `${l.doc_key}#${l.chunk_index}`);
    assert.ok(0 <= l.char_start && l.char_start < l.char_end && l.char_end <= md.length);
  }
});

test("buildSnapshot refuses a corpus that is not fully ingested", () => {
  const refused = (docs: SnapshotDocument[], chunks: SnapshotChunk[]) => {
    try {
      buildSnapshot(docs, chunks, OPTS);
    } catch (err) {
      assert.ok(err instanceof SnapshotRefused);
      return err.problems.join("\n");
    }
    assert.fail("not refused");
  };
  assert.match(refused([{ ...DOCS[0]!, status: "pending" }, DOCS[1]!], CHUNKS), /status is pending/);
  assert.match(refused([{ ...DOCS[0]!, errorMessage: "Skipped 1/7 bad chunk(s)" }, DOCS[1]!], CHUNKS), /ingest warning/);
  assert.match(refused(DOCS, CHUNKS.map((c) => ({ ...c, metadata: null }))), /no offsets/);
  assert.match(refused([{ ...DOCS[0]!, markdown: `${MD_A} Edited.` }, DOCS[1]!], CHUNKS), /other markdown/);
  assert.match(refused(DOCS, CHUNKS.filter((c) => c.id !== "a-c1")), /expected chunk index 1/);
});
