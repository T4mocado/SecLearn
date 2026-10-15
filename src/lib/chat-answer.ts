import type { DocVisibility } from "@prisma/client";
import { buildContext, retrieveChunks } from "@/lib/rag";
import { streamChatCompletion, type ChatTurn } from "@/lib/llm";
import { planSearch } from "@/lib/query";
import { fixedAnswer, noSourcesAnswer, withoutRefusals } from "@/lib/grounding";
import { stripCitations, type MessageSource } from "@/lib/sources";

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
  const messages: ChatTurn[] = [...history, { role: "user", content: opts.question }];
  const plan = await planSearch(opts.question, history);

  if (plan.intent === "conversation") {
    const tokens = await streamChatCompletion({
      messages,
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
    ? await streamChatCompletion({ messages, context, locale: opts.locale, signal: opts.signal })
    : fixedAnswer(noSourcesAnswer(opts.locale));
  return { tokens, sources };
}
