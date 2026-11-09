/**
 * Pure half of `scripts/run-eval.ts` (ticket 14): turns what the app retrieved and answered into the files the
 * eval-set project scores (`runs/<run_id>/run.trec`, `answers.jsonl`). Chunk keys are the snapshot's
 * (`docKey(storagePath)#chunkIndex`), so the run lines up with qrels built from that snapshot (ADR 0004).
 */
import { createHash } from "crypto";
import { isRefusal } from "./grounding";
import { docKey } from "./snapshot";
import { citedIndexes } from "./sources";

type RankedChunk = { documentId: string; chunkIndex: number };

/** `documentId` → the document's `storagePath`. */
export type StoragePaths = Map<string, string>;

export function chunkKey(chunk: { documentId: string; chunkIndex: number }, paths: StoragePaths): string {
  const storagePath = paths.get(chunk.documentId);
  if (storagePath === undefined) throw new Error(`document ${chunk.documentId} has no storage path`);
  return `${docKey(storagePath)}#${chunk.chunkIndex}`;
}

/**
 * TREC lines `qid Q0 chunk_key rank score tag`, in the order the app gave them. The score counts down from the
 * number of chunks: scorers (ranx, trec_eval) sort by score, and the app's order is not always by rerank score
 * (comparison cells and carried chunks go first).
 */
export function runLines(qid: string, chunks: RankedChunk[], paths: StoragePaths, tag: string): string[] {
  return chunks.map((c, i) => `${qid} Q0 ${chunkKey(c, paths)} ${i + 1} ${chunks.length - i} ${tag}`);
}

/** What a run was measured with; two runs with the same hash are comparable. */
export type RunConfig = Record<string, string | number | boolean | null>;

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** sha256 of the config as JSON with sorted keys, so the order variables were read in does not matter. */
export function configHash(config: RunConfig): string {
  const sorted = Object.fromEntries(Object.entries(config).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return sha256(JSON.stringify(sorted));
}

/** One cached result: question, config, snapshot and which of the K answers (0 in retrieval mode). */
export function cacheKey(qid: string, configHashValue: string, snapshotId: string, k: number): string {
  return sha256([qid, configHashValue, snapshotId, k].join("\n"));
}

/** One line of `answers.jsonl` (`AnswerLine` in the eval-set project); the graded fields are filled there later. */
export type AnswerLine = { qid: string; k: number; answer: string; refused: boolean; cited_chunks: string[] };

type AnswerSource = { index: number; documentId: string; chunkIndex: number };

/**
 * Refused: the fixed reply (no sources: nothing relevant, or the entity check failed) or a short uncited answer
 * saying the documents do not cover it (`isRefusal`, the same test the chat uses on stored turns).
 */
export function answerLine(qid: string, k: number, answer: string, sources: AnswerSource[], paths: StoragePaths): AnswerLine {
  const cited = citedIndexes(answer, sources.length);
  return {
    qid,
    k,
    answer,
    refused: sources.length === 0 || isRefusal(answer),
    cited_chunks: sources.filter((s) => cited.has(s.index)).map((s) => chunkKey(s, paths)),
  };
}

/** The parts of a snapshot (`manifest.json`, `chunks.<chunker>.jsonl`) the check compares the database with. */
export type SnapshotIndex = {
  chunkerVersion: string;
  documents: Array<{ doc_key: string; md_sha256: string; chunks: number }>;
  chunks: Array<{ chunk_key: string; content_sha1: string }>;
};

type DbDocument = { id: string; storagePath: string; markdown: string | null; status: string };
type DbChunk = { documentId: string; chunkIndex: number; content: string; metadata: unknown };

const sha1 = (s: string) => createHash("sha1").update(s, "utf8").digest("hex");

/**
 * Every way the database differs from the snapshot the qrels were built on; empty when a run's chunk keys mean
 * the same text as the qrels' do. A document only in the database counts too: its chunks would be retrieved
 * and scored as not relevant without anyone judging them. So does a key two documents share (a re-upload):
 * both would be retrieved under one chunk key.
 */
export function snapshotProblems(snapshot: SnapshotIndex, documents: DbDocument[], chunks: DbChunk[]): string[] {
  const problems: string[] = [];
  const byKey = new Map<string, DbDocument[]>();
  for (const d of documents) byKey.set(docKey(d.storagePath), [...(byKey.get(docKey(d.storagePath)) ?? []), d]);
  const sha1Of = new Map(snapshot.chunks.map((c) => [c.chunk_key, c.content_sha1]));
  for (const want of snapshot.documents) {
    const docs = byKey.get(want.doc_key) ?? [];
    const doc = docs[0];
    if (!doc) {
      problems.push(`${want.doc_key}: in the snapshot, not in the database`);
      continue;
    }
    if (docs.length > 1) {
      problems.push(`${want.doc_key}: ${docs.length} documents in the database share this key (${docs.map((d) => d.id).join(", ")})`);
      continue;
    }
    if (doc.status !== "ready") {
      problems.push(`${want.doc_key}: status ${doc.status}, not ready`);
      continue;
    }
    if (sha256(doc.markdown ?? "") !== want.md_sha256) problems.push(`${want.doc_key}: markdown differs from the snapshot (md_sha256)`);
    const own = chunks.filter((c) => c.documentId === doc.id).sort((a, b) => a.chunkIndex - b.chunkIndex);
    if (own.length !== want.chunks) problems.push(`${want.doc_key}: ${own.length} chunk(s) in the database, ${want.chunks} in the snapshot`);
    for (const c of own) {
      const key = `${want.doc_key}#${c.chunkIndex}`;
      const chunker = (c.metadata as { chunker_version?: unknown } | null)?.chunker_version;
      if (chunker !== snapshot.chunkerVersion) problems.push(`${key}: chunker ${String(chunker)}, snapshot has ${snapshot.chunkerVersion}`);
      if (sha1(c.content) !== sha1Of.get(key)) problems.push(`${key}: text differs from the snapshot`);
    }
  }
  const known = new Set(snapshot.documents.map((d) => d.doc_key));
  for (const [key, docs] of [...byKey].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (known.has(key) || !docs.some((d) => d.status === "ready")) continue;
    problems.push(`${key}: in the database, not in the snapshot (its chunks would be retrieved but never judged)`);
  }
  return problems;
}
