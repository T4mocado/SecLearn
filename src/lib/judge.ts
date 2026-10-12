import { getEnv } from "@/lib/env";
import { completeJson } from "@/lib/llm";
import { citedIndexes, parseJudgement, type MessageSource, type SourceJudgement } from "@/lib/sources";

const JUDGE_TIMEOUT_MS = 30_000;

function judgeSystem(locale: string): string {
  return [
    "You evaluate retrieved passages for a cybersecurity tutoring chatbot (RAG).",
    "You get the user's question, the chatbot's answer (it cites passages inline as [n]) and the numbered passages.",
    "Score EVERY passage with two integers from 0 to 100:",
    "- questionRelevance: how directly the passage helps answer the question. 90-100 = answers it directly;",
    "  70-89 = clearly on topic; 40-69 = related topic but only partly useful; 0-39 = off topic.",
    "  Judge the passage itself, not whether the answer used it. Passages may be in another language than the question.",
    "- answerContribution: how much of the answer's content comes from this passage, whether cited or not.",
    "  0 = nothing in the answer comes from it. Citing [n] for content the passage does not contain does not count.",
    `- reason: one short sentence in ${locale === "vi" ? "Vietnamese" : "English"} explaining both scores.`,
    'Reply with JSON only: {"sources": [{"index": 1, "questionRelevance": 0, "answerContribution": 0, "reason": "..."}]}',
  ].join("\n");
}

function judgeUser(question: string, answer: string, sources: MessageSource[]): string {
  const passages = sources.map((s) => `[${s.index}] (${s.documentTitle})\n${s.content}`).join("\n\n");
  return `Question:\n${question}\n\nAnswer:\n${answer}\n\nPassages:\n${passages}`;
}

/** LLM_PROVIDER=mock: deterministic scores so the UI and ordering can be tested without a key. */
function mockJudgement(answer: string, sources: MessageSource[], locale: string): Map<number, SourceJudgement> {
  const cited = citedIndexes(answer, sources.length);
  return new Map(
    sources.map((s) => [
      s.index,
      {
        questionRelevance: s.rerankScore !== undefined ? Math.round(s.rerankScore * 100) : Math.max(5, 100 - s.index * 15),
        answerContribution: cited.has(s.index) ? Math.max(10, 90 - s.index * 10) : 0,
        reason: locale === "vi" ? "Điểm giả lập (LLM_PROVIDER=mock)." : "Mock score (LLM_PROVIDER=mock).",
      },
    ]),
  );
}

/**
 * Asks the chat LLM to score each source against the question and the finished answer, and attaches
 * the result as `judge`. Returns the sources unchanged when judging is off or fails: the answer is
 * already delivered, and the panel then shows the chunks as not judged.
 */
export async function judgeSources(opts: {
  question: string;
  answer: string;
  sources: MessageSource[];
  locale: string;
}): Promise<MessageSource[]> {
  const env = getEnv();
  if (env.RAG_JUDGE === "off" || !opts.sources.length || !opts.answer.trim()) return opts.sources;

  let judged: Map<number, SourceJudgement> | null;
  if (env.LLM_PROVIDER === "mock") {
    judged = mockJudgement(opts.answer, opts.sources, opts.locale);
  } else {
    try {
      const raw = await completeJson({
        system: judgeSystem(opts.locale),
        user: judgeUser(opts.question, opts.answer, opts.sources),
        signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
      });
      judged = parseJudgement(raw, opts.sources.length);
      if (!judged) console.warn("[judge] unusable reply:", raw.slice(0, 200));
    } catch (err) {
      console.warn("[judge] failed:", err instanceof Error ? err.message : err);
      return opts.sources;
    }
  }
  if (!judged) return opts.sources;

  return opts.sources.map((s) => {
    const judge = judged.get(s.index);
    return judge ? { ...s, judge } : s;
  });
}
