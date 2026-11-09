import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { answerLine, cacheKey, configHash, runLines, snapshotProblems } from "./eval-run";

const chunk = (documentId: string, chunkIndex: number, score: number, rerankScore?: number) => ({
  documentId,
  chunkIndex,
  score,
  ...(rerankScore === undefined ? {} : { rerankScore }),
});

test("run lines are TREC lines keyed by the snapshot's document key, in the app's order", () => {
  const paths = new Map([
    ["d1", "data/uploads/1791627900007-Abuse_Case_Cheat_Sheet.pdf"],
    ["d2", "data/uploads/1791642614658-490fb354-wstg-v4.2.pdf"],
  ]);
  // A comparison puts a reserved cell chunk first though it reranks lower: scorers sort by score, so the score
  // must follow the app's order, not the rerank score.
  const lines = runLines("test-001", [chunk("d2", 41, 0.62, 0.3), chunk("d1", 3, 0.7, 0.9), chunk("d1", 4, 0.5)], paths, "seclearn-baseline");
  assert.deepEqual(lines, [
    "test-001 Q0 wstg-v4.2#41 1 3 seclearn-baseline",
    "test-001 Q0 Abuse_Case_Cheat_Sheet#3 2 2 seclearn-baseline",
    "test-001 Q0 Abuse_Case_Cheat_Sheet#4 3 1 seclearn-baseline",
  ]);
});

test("config hash ignores key order and changes with any value", () => {
  const a = configHash({ RAG_TOP_K: 5, RERANK_URL: "http://127.0.0.1:8008/rerank", git_dirty: false });
  const b = configHash({ git_dirty: false, RERANK_URL: "http://127.0.0.1:8008/rerank", RAG_TOP_K: 5 });
  assert.equal(a, b);
  assert.equal(
    a,
    createHash("sha256").update('{"RAG_TOP_K":5,"RERANK_URL":"http://127.0.0.1:8008/rerank","git_dirty":false}').digest("hex"),
  );
  assert.notEqual(a, configHash({ RAG_TOP_K: 10, RERANK_URL: "http://127.0.0.1:8008/rerank", git_dirty: false }));
});

test("cache key is sha256 of qid, config hash, snapshot id and k", () => {
  assert.equal(cacheKey("test-001", "abc", "2026-10-18-owasp", 0), createHash("sha256").update("test-001\nabc\n2026-10-18-owasp\n0").digest("hex"));
  assert.notEqual(cacheKey("test-001", "abc", "2026-10-18-owasp", 0), cacheKey("test-001", "abc", "2026-10-18-owasp", 1));
});

const source = (index: number, documentId: string, chunkIndex: number) => ({ index, documentId, chunkIndex });
const PATHS = new Map([["d1", "data/uploads/1791627900007-Abuse_Case_Cheat_Sheet.pdf"]]);

test("an answer citing its sources is not refused and lists the chunks it cites", () => {
  const line = answerLine("test-001", 1, "Dùng HttpOnly [2], kèm SameSite [1].", [source(1, "d1", 3), source(2, "d1", 7)], PATHS);
  assert.deepEqual(line, {
    qid: "test-001",
    k: 1,
    answer: "Dùng HttpOnly [2], kèm SameSite [1].",
    refused: false,
    cited_chunks: ["Abuse_Case_Cheat_Sheet#3", "Abuse_Case_Cheat_Sheet#7"],
  });
});

test("no sources (the fixed reply) or a short uncited refusal counts as refused", () => {
  assert.equal(answerLine("l6-001", 0, "Mình không tìm thấy nội dung liên quan trong tài liệu SecLearn.", [], PATHS).refused, true);
  assert.equal(answerLine("l6-002", 0, "Tài liệu không đề cập đến CVE này.", [source(1, "d1", 3)], PATHS).refused, true);
  assert.equal(answerLine("l6-002", 0, "Tài liệu không đề cập đến CVE này.", [source(1, "d1", 3)], PATHS).cited_chunks.length, 0);
});

const sha = (alg: "sha1" | "sha256", s: string) => createHash(alg).update(s, "utf8").digest("hex");
const MD = "# Abuse Case\n\nFirst part.\n\nSecond part.";
const snapshot = {
  chunkerVersion: "sentence-v2",
  documents: [{ doc_key: "Abuse_Case_Cheat_Sheet", md_sha256: sha("sha256", MD), chunks: 2 }],
  chunks: [
    { chunk_key: "Abuse_Case_Cheat_Sheet#0", content_sha1: sha("sha1", "First part.") },
    { chunk_key: "Abuse_Case_Cheat_Sheet#1", content_sha1: sha("sha1", "Second part.") },
  ],
};
const dbDoc = (markdown = MD) => ({ id: "d1", storagePath: "data/uploads/1791627900007-Abuse_Case_Cheat_Sheet.pdf", markdown, status: "ready" });
const dbChunk = (chunkIndex: number, content: string, chunker = "sentence-v2") => ({
  documentId: "d1",
  chunkIndex,
  content,
  metadata: { chunker_version: chunker },
});

test("a database holding the snapshot's documents and chunks passes the check", () => {
  assert.deepEqual(snapshotProblems(snapshot, [dbDoc()], [dbChunk(0, "First part."), dbChunk(1, "Second part.")]), []);
});

test("the check names every way the database drifted from the snapshot", () => {
  const extra = { id: "d2", storagePath: "data/uploads/1791627900008-New_Cheat_Sheet.pdf", markdown: "# New", status: "ready" };
  const problems = snapshotProblems(snapshot, [dbDoc(MD + " edited"), extra], [dbChunk(0, "First part!", "sentence-v1")]);
  assert.deepEqual(problems, [
    "Abuse_Case_Cheat_Sheet: markdown differs from the snapshot (md_sha256)",
    "Abuse_Case_Cheat_Sheet: 1 chunk(s) in the database, 2 in the snapshot",
    "Abuse_Case_Cheat_Sheet#0: chunker sentence-v1, snapshot has sentence-v2",
    "Abuse_Case_Cheat_Sheet#0: text differs from the snapshot",
    "New_Cheat_Sheet: in the database, not in the snapshot (its chunks would be retrieved but never judged)",
  ]);
  assert.deepEqual(snapshotProblems(snapshot, [], []), ["Abuse_Case_Cheat_Sheet: in the snapshot, not in the database"]);
});

test("the check names a document that is not ready and two documents sharing a key", () => {
  const chunks = [dbChunk(0, "First part."), dbChunk(1, "Second part.")];
  assert.deepEqual(snapshotProblems(snapshot, [{ ...dbDoc(), status: "processing" }], chunks), [
    "Abuse_Case_Cheat_Sheet: status processing, not ready",
  ]);
  const copy = { id: "d9", storagePath: "data/uploads/1791700000000-Abuse_Case_Cheat_Sheet.pdf", markdown: MD, status: "ready" };
  assert.deepEqual(snapshotProblems(snapshot, [{ ...dbDoc(), status: "ready" }, copy], chunks), [
    "Abuse_Case_Cheat_Sheet: 2 documents in the database share this key (d1, d9)",
  ]);
});
