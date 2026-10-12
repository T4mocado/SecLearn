import { getEnv } from "@/lib/env";
import { completeText, type ChatTurn } from "@/lib/llm";
import { stripCitations } from "@/lib/sources";

const REWRITE_TIMEOUT_MS = 8_000;
const REWRITE_MAX_TOKENS = 120;
/** Turns of conversation sent for rewriting a follow-up, and characters kept from each message. */
const HISTORY_MESSAGES = 4;
const HISTORY_CHARS = 300;
/** The rewrite model's answer when a message has nothing to search for. */
const NO_TOPIC = "NONE";
/** A letter outside ASCII (Vietnamese diacritics, other scripts): the question is not plain English. */
const NON_ENGLISH_RE = /(?![\u0000-\u007f])\p{L}/u;

/**
 * Most of the corpus is English, and the cross-encoder scores a Vietnamese question against an
 * English chunk ~100x lower than the same question in English (docs/ERRORS.md #10, #17), so
 * retrieval also searches with an English version of a non-English question.
 * Unaccented Vietnamese ("phong chong xss") looks like English and is not translated.
 */
export function needsTranslation(query: string): boolean {
  return NON_ENGLISH_RE.test(query);
}

function cleanRewrite(raw: string): string {
  return raw
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .split("\n")[0]!
    .trim();
}

/** The last turns, shortened: enough to resolve "it" or "shorter", cheap in tokens. */
export function historyForRewrite(history: ChatTurn[]): string {
  return history
    .filter((m) => m.role !== "system")
    .slice(-HISTORY_MESSAGES)
    .map((m) => {
      const text = stripCitations(m.content).replace(/\s+/g, " ").trim();
      const short = text.length > HISTORY_CHARS ? `${text.slice(0, HISTORY_CHARS)}…` : text;
      return `${m.role === "user" ? "User" : "Assistant"}: ${short}`;
    })
    .join("\n");
}

/**
 * With a conversation, "shorter" or "explain more" is about the previous question's topic; without
 * one it has no topic, and the model must say so rather than invent one (it once turned
 * "Trả lời ngắn gọn" into "what is the NIST Cybersecurity Framework").
 */
export function rewritePrompt(hasConversation: boolean): string {
  return [
    hasConversation
      ? "Rewrite the user's latest message as one standalone English search query for cybersecurity documentation."
      : "Translate the user's message into one English search query for cybersecurity documentation.",
    "Keep technical terms, acronyms and product names. Do not answer it. Reply with the query only.",
    hasConversation
      ? "Use the conversation to resolve what the message refers to. If it only asks to change the previous answer " +
        "(shorter, more detail, an example, simpler), reply with a query for the topic of the previous question. " +
        `Reply exactly ${NO_TOPIC} only for greetings or thanks.`
      : `If the message has no topic to search for (a greeting, thanks, or an instruction like "shorter" or "explain more"), ` +
        `reply exactly ${NO_TOPIC}. Never invent a topic.`,
  ].join(" ");
}

/**
 * Queries to retrieve with: the message itself, plus one standalone English search query when the
 * message is not English or follows earlier turns ("Trả lời ngắn gọn" alone finds nothing).
 * One short LLM call (~100-150 tokens); any failure just means searching with the original.
 */
export async function searchQueries(query: string, history: ChatTurn[] = []): Promise<string[]> {
  const env = getEnv();
  const context = historyForRewrite(history);
  if (env.RAG_TRANSLATE_QUERY === "off" || env.LLM_PROVIDER === "mock") return [query];
  if (!context && !needsTranslation(query)) return [query];
  try {
    const raw = await completeText({
      system: rewritePrompt(!!context),
      user: context ? `Conversation:\n${context}\n\nLatest message: ${query}` : query,
      maxTokens: REWRITE_MAX_TOKENS,
      signal: AbortSignal.timeout(REWRITE_TIMEOUT_MS),
    });
    const rewritten = cleanRewrite(raw);
    // No topic: search with the message alone, which finds nothing and gets the fixed reply.
    if (!rewritten || rewritten.toUpperCase().replace(/\W/g, "") === NO_TOPIC) return [query];
    return rewritten.toLowerCase() !== query.trim().toLowerCase() ? [query, rewritten] : [query];
  } catch (err) {
    console.warn("[query] rewrite failed, searching with the original:", err instanceof Error ? err.message : err);
    return [query];
  }
}
