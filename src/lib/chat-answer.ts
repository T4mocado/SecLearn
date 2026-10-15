import type { DocVisibility } from "@prisma/client";
import { buildContext, retrieveChunks } from "@/lib/rag";
import { streamChatCompletion, type ChatTurn } from "@/lib/llm";
import { planSearch } from "@/lib/query";
import { fixedAnswer, noSourcesAnswer, withoutRefusals } from "@/lib/grounding";
import { stripCitations, type MessageSource } from "@/lib/sources";

/**
 * Characters of earlier turns sent word for word with a question. Forty messages were ~28k
 * characters, all resent with every question (docs/ERRORS.md #25).
 */
export const HISTORY_CHAR_LIMIT = 12_000;

/**
 * Splits the history into the latest turns that fit `limit` (whole messages, starting at a question,
 * at least the last exchange) and the questions of the turns before them, oldest first.
 */
export function splitHistory(
  history: ChatTurn[],
  limit = HISTORY_CHAR_LIMIT,
): { recent: ChatTurn[]; olderQuestions: string[] } {
  let start = history.length;
  let length = 0;
  while (start > 0) {
    const next = history[start - 1]!.content.length;
    if (history.length - start >= 2 && length + next > limit) break;
    length += next;
    start--;
  }
  while (start < history.length && history[start]!.role !== "user") start++;
  return {
    recent: history.slice(start),
    olderQuestions: history.slice(0, start).filter((m) => m.role === "user").map((m) => m.content),
  };
}

/**
 * Shared by the signed-in and guest chat routes: decides how to answer one question and returns
 * the token stream plus the sources shown with it.
 * - About the conversation itself: answered from the history, no retrieval and no sources.
 * - Otherwise: retrieve; nothing relevant means the fixed reply (no LLM call), since answering
 *   would mean using the model's own knowledge.
 */
export async function answerQuestion(opts: {
  question: string;
  /** Earlier turns as stored, assistant answers still with their [n] markers. */
  history: ChatTurn[];
  visibilities: DocVisibility[];
  locale: string;
  /** Chunks the previous answer cited (signed-in chats, which store sources). */
  carryChunkIds?: string[];
  signal?: AbortSignal;
}): Promise<{ tokens: AsyncGenerator<string, void, unknown>; sources: MessageSource[] }> {
  // Refusals are dropped before the markers are stripped: a short answer with [n] is not one.
  const history = withoutRefusals(opts.history).map((m) =>
    m.role === "assistant" ? { ...m, content: stripCitations(m.content) } : m,
  );
  // The rewrite sees every earlier question; the answer sees the latest turns plus the older
  // questions, so both count "the first topic" over the same conversation.
  const plan = await planSearch(opts.question, history);
  const { recent, olderQuestions } = splitHistory(history);
  const messages: ChatTurn[] = [...recent, { role: "user", content: opts.question }];

  if (plan.intent === "conversation") {
    const tokens = await streamChatCompletion({
      messages,
      olderQuestions,
      context: "",
      locale: opts.locale,
      mode: "conversation",
      signal: opts.signal,
    });
    return { tokens, sources: [] };
  }

  const chunks = await retrieveChunks({
    query: opts.question,
    visibilities: opts.visibilities,
    queries: plan.queries,
    carryChunkIds: history.length ? opts.carryChunkIds : undefined,
  });
  const { context, sources } = buildContext(chunks);
  const tokens = sources.length
    ? await streamChatCompletion({ messages, olderQuestions, context, locale: opts.locale, signal: opts.signal })
    : fixedAnswer(noSourcesAnswer(opts.locale));
  return { tokens, sources };
}
