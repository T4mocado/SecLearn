/**
 * Retrieval on the 40-question smoke set (data/eval/set-a.jsonl, set-b.jsonl): which gold quotes reach the
 * chunks the answer model would see. No answer is generated.
 * Usage: npm run smoke:retrieval -- --label before          (writes data/eval/results/smoke-before.json)
 *        npm run smoke:retrieval -- --compare before after   (prints both runs side by side)
 * Search plans (the LLM rewrite step) are cached in data/eval/results/smoke-plans.json on the first run and
 * replayed after, so two runs differ only in the corpus. Delete that file to plan again.
 */
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { retrieveForQuestion } from "../src/lib/chat-answer";
import type { SearchPlan } from "../src/lib/query";

const SETS = ["data/eval/set-a.jsonl", "data/eval/set-b.jsonl"];
const OUT_DIR = "data/eval/results";
const PLANS = path.join(OUT_DIR, "smoke-plans.json");
/** A quote half shorter than this is too generic to count as found. */
const MIN_HALF = 30;

type Evidence = { document: string; quote: string };
type SmokeQuestion = {
  id: string;
  question: string;
  level: string;
  turns: Array<{ role: "user" | "assistant"; content: string }>;
  answerable: boolean;
  gold_evidence: Evidence[];
};

type QuestionResult = {
  id: string;
  level: string;
  answerable: boolean;
  gold_quotes: number;
  retrieved: Array<{ doc: string; chunkIndex: number; rerank: number | null }>;
  /** Per gold quote: 1-based rank of the first retrieved chunk holding it, or null. */
  quote_ranks: Array<number | null>;
  /** 1-based rank of the first chunk from a gold document, or null. */
  doc_rank: number | null;
};

/** pdftotext (the smoke quotes) and pdf-parse (the corpus) differ in quotes, dashes and line wraps. */
function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/­/g, "")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/-\s+(?=[a-z])/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * A chunk holds a quote when it contains all of it or either half (split at the middle space): quotes that
 * run across a chunk boundary sit half in each chunk (7 of 82 smoke quotes, docs/EVAL_DATASET_CONSTRUCTION.md).
 */
function holds(chunk: string, quote: string): boolean {
  const c = normalize(chunk);
  const q = normalize(quote);
  if (c.includes(q)) return true;
  const mid = q.indexOf(" ", Math.floor(q.length / 2));
  if (mid < 0) return false;
  const halves = [q.slice(0, mid), q.slice(mid + 1)].filter((h) => h.length >= MIN_HALF);
  return halves.some((h) => c.includes(h));
}

const docName = (s: string) => s.replace(/\.pdf$/i, "").replace(/_Cheat_Sheet$/, "");

async function loadQuestions(): Promise<SmokeQuestion[]> {
  const out: SmokeQuestion[] = [];
  for (const file of SETS) {
    const text = await readFile(file, "utf8");
    for (const line of text.split("\n")) if (line.trim()) out.push(JSON.parse(line) as SmokeQuestion);
  }
  return out;
}

async function run(label: string) {
  const questions = await loadQuestions();
  const plans: Record<string, SearchPlan> = existsSync(PLANS) ? JSON.parse(await readFile(PLANS, "utf8")) : {};
  const results: QuestionResult[] = [];
  for (const q of questions) {
    const { plan, chunks } = await retrieveForQuestion({
      question: q.question,
      history: q.turns,
      visibilities: ["public", "authenticated"],
      plan: plans[q.id],
    });
    plans[q.id] = plan;
    const golds = q.gold_evidence.map((e) => docName(e.document));
    const quoteRanks = q.gold_evidence.map((e) => {
      const i = chunks.findIndex((c) => holds(c.content, e.quote));
      return i < 0 ? null : i + 1;
    });
    const docIndex = chunks.findIndex((c) => golds.includes(docName(c.documentTitle)));
    results.push({
      id: q.id,
      level: q.level,
      answerable: q.answerable,
      gold_quotes: q.gold_evidence.length,
      retrieved: chunks.map((c) => ({ doc: c.documentTitle, chunkIndex: c.chunkIndex, rerank: c.rerankScore ?? null })),
      quote_ranks: quoteRanks,
      doc_rank: docIndex < 0 ? null : docIndex + 1,
    });
    const found = quoteRanks.filter((r) => r !== null).length;
    console.log(`${q.id} ${q.level} quotes ${found}/${quoteRanks.length} doc@${docIndex < 0 ? "-" : docIndex + 1} (${chunks.length} chunks)`);
  }
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(PLANS, JSON.stringify(plans, null, 2) + "\n", "utf8");
  const file = path.join(OUT_DIR, `smoke-${label}.json`);
  await writeFile(file, JSON.stringify({ label, ranAt: new Date().toISOString(), summary: summarize(results), results }, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(summarize(results), null, 2));
  console.log(`→ ${file}`);
}

type Summary = Record<string, number>;

/** Over questions with gold quotes: hit (any quote in the chunks), quote recall, MRR, doc hit; L6 without gold apart. */
function summarize(results: QuestionResult[]): Record<string, Summary> {
  const groups = new Map<string, QuestionResult[]>();
  for (const r of results.filter((r) => r.gold_quotes > 0)) {
    for (const key of ["all", r.level]) groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: Record<string, Summary> = {};
  for (const [key, rs] of [...groups].sort()) {
    const firsts = rs.map((r) => Math.min(...r.quote_ranks.map((x) => x ?? Infinity)));
    const quotes = rs.flatMap((r) => r.quote_ranks);
    out[key] = {
      questions: rs.length,
      hit: round(firsts.filter(Number.isFinite).length / rs.length),
      hit_at_1: round(firsts.filter((f) => f === 1).length / rs.length),
      quote_recall: round(quotes.filter((x) => x !== null).length / quotes.length),
      mrr: round(firsts.reduce((s, f) => s + (Number.isFinite(f) ? 1 / f : 0), 0) / rs.length),
      doc_hit: round(rs.filter((r) => r.doc_rank !== null).length / rs.length),
    };
  }
  const noGold = results.filter((r) => r.gold_quotes === 0);
  out.no_gold = {
    questions: noGold.length,
    with_chunks: noGold.filter((r) => r.retrieved.length > 0).length,
    mean_chunks: round(noGold.reduce((s, r) => s + r.retrieved.length, 0) / Math.max(1, noGold.length)),
  };
  return out;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

async function compare(a: string, b: string) {
  const load = async (l: string) => JSON.parse(await readFile(path.join(OUT_DIR, `smoke-${l}.json`), "utf8"));
  const [ra, rb] = [await load(a), await load(b)];
  const keys = [...new Set([...Object.keys(ra.summary), ...Object.keys(rb.summary)])];
  console.log(`| group | metric | ${a} | ${b} | Δ |\n|---|---|---|---|---|`);
  for (const k of keys) {
    for (const m of Object.keys(ra.summary[k] ?? rb.summary[k])) {
      const x = ra.summary[k]?.[m] ?? NaN;
      const y = rb.summary[k]?.[m] ?? NaN;
      console.log(`| ${k} | ${m} | ${x} | ${y} | ${round(y - x)} |`);
    }
  }
  console.log("\nQuestions whose quotes found changed:");
  const byId = new Map<string, QuestionResult>(rb.results.map((r: QuestionResult) => [r.id, r]));
  for (const r of ra.results as QuestionResult[]) {
    const s = byId.get(r.id);
    if (!s || JSON.stringify(r.quote_ranks) === JSON.stringify(s.quote_ranks)) continue;
    console.log(`- ${r.id} ${r.level}: ${JSON.stringify(r.quote_ranks)} → ${JSON.stringify(s.quote_ranks)}`);
  }
}

async function main() {
  const i = process.argv.indexOf("--compare");
  if (i >= 0) return compare(process.argv[i + 1]!, process.argv[i + 2]!);
  const l = process.argv.indexOf("--label");
  if (l < 0 || !process.argv[l + 1]) throw new Error("--label <name> or --compare <a> <b>");
  await run(process.argv[l + 1]!);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
