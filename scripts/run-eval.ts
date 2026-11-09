/**
 * Runs the app itself on an eval-set question file and writes the run directory `seclearn-eval score --run` reads
 * (ticket 14): the chunks the answer model would see (`run.trec`), the candidates before reranking
 * (`candidates.trec`), the search plans, and with --mode answer K answers per question (`answers.jsonl`).
 * Usage: npm run eval:run -- --questions Dataset/questions/v1.0/test.jsonl --out Dataset/runs/seclearn-baseline
 *        [--snapshot Dataset/corpus/2026-10-18-owasp] [--mode retrieval|answer] [--limit 20] [--replay-plans <run_dir>]
 * Every question in --questions is run: pass a file holding only the questions to score.
 * Refuses to run when the database is not the snapshot the qrels were built on (`snapshotProblems`). One process
 * per configuration: `getEnv()` reads the environment once, so compare configurations with separate .env files.
 * Results are cached per question under <out>/cache/ (`cacheKey`); the cache is not read while the tree is dirty.
 */
import { execSync } from "child_process";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { DocVisibility } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { getEnv, resolveEmbedModel, resolveLlmModel } from "../src/lib/env";
import { CHUNKER_VERSION } from "../src/lib/chunking";
import { answerQuestion, retrieveForQuestion } from "../src/lib/chat-answer";
import type { RetrievedChunk } from "../src/lib/rag";
import type { SearchPlan } from "../src/lib/query";
import {
  answerLine,
  cacheKey,
  configHash,
  runLines,
  snapshotProblems,
  type AnswerLine,
  type RunConfig,
  type SnapshotIndex,
} from "../src/lib/eval-run";

/** K answers per question (`ANSWER_RUNS` in Dataset/src/seclearn_eval/schema.py). */
const ANSWER_RUNS = 3;
const VISIBILITIES: DocVisibility[] = ["public", "authenticated"];

type Turn = { role: "user" | "assistant"; content: string };
type EvalQuestion = { id: string; question: string; language: string; turns: Turn[] };
type Ranked = Pick<RetrievedChunk, "documentId" | "chunkIndex" | "score" | "rerankScore">;
/** What one question's retrieval left, cached as JSON. */
type Retrieval = { plan: SearchPlan; chunks: Ranked[]; candidates: Ranked[] };

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const git = (cmd: string) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
const ranked = (c: RetrievedChunk): Ranked => ({
  documentId: c.documentId,
  chunkIndex: c.chunkIndex,
  score: c.score,
  ...(c.rerankScore === undefined ? {} : { rerankScore: c.rerankScore }),
});

async function readJsonl<T>(file: string): Promise<T[]> {
  const text = await readFile(file, "utf8");
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

async function loadSnapshot(dir: string): Promise<{ id: string; index: SnapshotIndex }> {
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
  const chunks = await readJsonl<{ chunk_key: string; content_sha1: string }>(path.join(dir, manifest.chunks_path));
  return { id: manifest.snapshot_id, index: { chunkerVersion: manifest.chunker.version, documents: manifest.documents, chunks } };
}

function runConfig(snapshotId: string, mode: string, dirty: boolean): RunConfig {
  const env = getEnv();
  return {
    mode,
    snapshot_id: snapshotId,
    git_commit: git("rev-parse --short HEAD"),
    git_dirty: dirty,
    chunker_version: CHUNKER_VERSION,
    LLM_PROVIDER: env.LLM_PROVIDER,
    llm_model: resolveLlmModel(env),
    EMBED_PROVIDER: env.EMBED_PROVIDER,
    embed_model: resolveEmbedModel(env),
    EMBED_DIM: env.EMBED_DIM,
    RERANK_URL: env.RERANK_URL,
    RAG_TOP_K: env.RAG_TOP_K,
    RAG_CANDIDATES: env.RAG_CANDIDATES,
    RAG_MIN_RELEVANCE: env.RAG_MIN_RELEVANCE,
    RAG_MIN_KEEP: env.RAG_MIN_KEEP,
    RAG_MIN_RELEVANCE_EN: env.RAG_MIN_RELEVANCE_EN,
    RAG_RELATIVE_MIN: env.RAG_RELATIVE_MIN,
    RAG_TRANSLATE_QUERY: env.RAG_TRANSLATE_QUERY,
  };
}

/** A cached value, or `make()` written to the cache; nothing is read from the cache while the tree is dirty. */
async function cached<T>(dir: string, key: string, readCache: boolean, make: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const file = path.join(dir, `${key}.json`);
  if (readCache && existsSync(file)) return { value: JSON.parse(await readFile(file, "utf8")) as T, hit: true };
  const value = await make();
  await writeFile(file, JSON.stringify(value) + "\n", "utf8");
  return { value, hit: false };
}

/**
 * The reranker failing falls back to cosine order silently (rag.ts); a run measured that way is a different system.
 * Checked on each answer too: `answerQuestion` retrieves again, so its sources can come from a failed rerank.
 */
function assertReranked(qid: string, chunks: Array<{ rerankScore?: number }>) {
  if (getEnv().RERANK_URL.trim() && chunks.some((c) => c.rerankScore === undefined)) {
    throw new Error(`${qid}: chunks without a rerank score, the reranker failed (is ${getEnv().RERANK_URL} up?)`);
  }
}

async function retrieve(q: EvalQuestion, plan: SearchPlan | undefined): Promise<Retrieval> {
  let candidates: Ranked[] = [];
  const out = await retrieveForQuestion({
    question: q.question,
    history: q.turns,
    visibilities: VISIBILITIES,
    ...(plan ? { plan } : {}),
    onCandidates: (cs) => (candidates = cs.map(ranked)),
  });
  const chunks = out.chunks.map(ranked);
  assertReranked(q.id, chunks);
  return { plan: out.plan, chunks, candidates };
}

async function answer(q: EvalQuestion, plan: SearchPlan): Promise<{ text: string; sources: Array<{ index: number; documentId: string; chunkIndex: number }> }> {
  const { tokens, sources } = await answerQuestion({
    question: q.question,
    history: q.turns,
    visibilities: VISIBILITIES,
    locale: q.language === "en" ? "en" : "vi",
    plan,
  });
  assertReranked(q.id, sources);
  let text = "";
  for await (const t of tokens) text += t;
  return { text, sources: sources.map((s) => ({ index: s.index, documentId: s.documentId, chunkIndex: s.chunkIndex })) };
}

async function main() {
  const questionsFile = arg("--questions");
  const outDir = arg("--out");
  if (!questionsFile || !outDir) throw new Error("--questions and --out are required");
  const mode = arg("--mode") ?? "retrieval";
  if (mode !== "retrieval" && mode !== "answer") throw new Error(`--mode is retrieval or answer, not ${mode}`);
  const limit = arg("--limit") === undefined ? undefined : Number(arg("--limit"));
  if (limit !== undefined && !(Number.isInteger(limit) && limit >= 0)) throw new Error(`--limit is a whole number, not ${arg("--limit")}`);
  const runId = path.basename(path.resolve(outDir));

  const snapshot = await loadSnapshot(arg("--snapshot") ?? "Dataset/corpus/2026-10-18-owasp");
  // Every document, whatever its status: the check names one the snapshot holds that is not ready.
  const documents = await prisma.document.findMany({
    where: { visibility: { in: VISIBILITIES } },
    select: { id: true, storagePath: true, markdown: true, status: true },
  });
  const dbChunks = await prisma.documentChunk.findMany({
    where: { documentId: { in: documents.map((d) => d.id) } },
    select: { documentId: true, chunkIndex: true, content: true, metadata: true },
  });
  const problems = snapshotProblems(snapshot.index, documents, dbChunks);
  if (problems.length) {
    throw new Error(
      `the database is not snapshot ${snapshot.id} (${problems.length} problem(s)); export a new snapshot and rebuild the qrels, ` +
        `or reindex back to it:\n- ${problems.slice(0, 20).join("\n- ")}${problems.length > 20 ? "\n- …" : ""}`,
    );
  }
  const paths = new Map(documents.map((d) => [d.id, d.storagePath]));

  const all = (await readJsonl<EvalQuestion & { _meta?: unknown }>(questionsFile)).filter((q) => !q._meta);
  const questions = limit === undefined ? all : all.slice(0, limit);
  const replayDir = arg("--replay-plans");
  const replay = new Map<string, SearchPlan>();
  if (replayDir) for (const p of await readJsonl<{ qid: string; plan: SearchPlan }>(path.join(replayDir, "plans.jsonl"))) replay.set(p.qid, p.plan);

  const dirty = git("status --porcelain --untracked-files=no") !== "";
  const config = { ...runConfig(snapshot.id, mode, dirty), replay_plans: replayDir ? path.basename(path.resolve(replayDir)) : null };
  const hash = configHash(config);
  const cacheDir = path.join(outDir, "cache");
  await mkdir(cacheDir, { recursive: true });
  if (dirty) console.warn("[run-eval] uncommitted changes: the cache is written but not read");

  const run: string[] = [];
  const candidateRun: string[] = [];
  const plans: string[] = [];
  const answers: AnswerLine[] = [];
  let fresh = 0;
  for (const [i, q] of questions.entries()) {
    const planned = replay.get(q.id);
    if (replayDir && !planned) throw new Error(`${q.id}: no plan in ${replayDir}/plans.jsonl`);
    const r = await cached(cacheDir, cacheKey(q.id, hash, snapshot.id, 0), !dirty, () => retrieve(q, planned));
    fresh += r.hit ? 0 : 1;
    run.push(...runLines(q.id, r.value.chunks, paths, runId));
    candidateRun.push(...runLines(q.id, r.value.candidates, paths, runId));
    plans.push(JSON.stringify({ qid: q.id, plan: r.value.plan }));
    if (mode === "answer") {
      for (let k = 0; k < ANSWER_RUNS; k++) {
        const a = await cached(cacheDir, cacheKey(q.id, hash, snapshot.id, k + 1), !dirty, () => answer(q, r.value.plan));
        fresh += a.hit ? 0 : 1;
        answers.push(answerLine(q.id, k, a.value.text, a.value.sources, paths));
      }
    }
    console.log(`${i + 1}/${questions.length} ${q.id}: ${r.value.chunks.length} chunks${r.hit ? " (cache)" : ""}`);
  }

  await writeFile(path.join(outDir, "run.trec"), run.join("\n") + "\n", "utf8");
  await writeFile(path.join(outDir, "candidates.trec"), candidateRun.join("\n") + "\n", "utf8");
  await writeFile(path.join(outDir, "plans.jsonl"), plans.join("\n") + "\n", "utf8");
  if (mode === "answer") await writeFile(path.join(outDir, "answers.jsonl"), answers.map((a) => JSON.stringify(a)).join("\n") + "\n", "utf8");
  await writeFile(path.join(outDir, "config.json"), JSON.stringify({ run_id: runId, config_hash: hash, ...config }, null, 2) + "\n", "utf8");
  console.log(`${questions.length} questions (${fresh} computed, the rest from cache) → ${outDir}`);
  if (limit !== undefined && limit < all.length) {
    const perQuestion = mode === "answer" ? 1 + ANSWER_RUNS : 1;
    console.log(`all ${all.length} questions: about ${all.length * perQuestion} app runs, each with at least one LLM call (the search plan)`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
