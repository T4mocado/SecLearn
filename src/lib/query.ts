import { getEnv } from "@/lib/env";
import { completeText } from "@/lib/llm";

const TRANSLATE_TIMEOUT_MS = 8_000;
const TRANSLATE_MAX_TOKENS = 120;
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

function cleanTranslation(raw: string): string {
  return raw
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .split("\n")[0]!
    .trim();
}

/**
 * Queries to retrieve with: the question itself, plus its English translation when it is not
 * English. One short LLM call (~100 tokens); any failure just means searching with the original.
 */
export async function searchQueries(query: string): Promise<string[]> {
  const env = getEnv();
  if (env.RAG_TRANSLATE_QUERY === "off" || env.LLM_PROVIDER === "mock" || !needsTranslation(query)) return [query];
  try {
    const raw = await completeText({
      system:
        "Translate the user's question into English for searching cybersecurity documentation. " +
        "Keep technical terms, acronyms and product names. Do not answer it. Reply with the English question only.",
      user: query,
      maxTokens: TRANSLATE_MAX_TOKENS,
      signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS),
    });
    const english = cleanTranslation(raw);
    return english && english.toLowerCase() !== query.trim().toLowerCase() ? [query, english] : [query];
  } catch (err) {
    console.warn("[query] translation failed, searching with the original:", err instanceof Error ? err.message : err);
    return [query];
  }
}
