import { maskCode, type TextRange } from "@/lib/sources";

/**
 * Answers come only from the uploaded documents. These helpers enforce that around the LLM:
 * the system prompt, the fixed reply when retrieval finds nothing (no LLM call), and spotting
 * answer sentences that state something without citing a passage.
 */

const TOPICS_VI = "mật khẩu mạnh, xác thực đa yếu tố (MFA), SQL injection, XSS, quản lý phiên đăng nhập";
const TOPICS_EN = "strong passwords, multi-factor authentication (MFA), SQL injection, XSS, session management";

/** Reply when no chunk is relevant: answering anyway could only come from the model's own knowledge. */
export function noSourcesAnswer(locale: string): string {
  return locale === "vi"
    ? "Mình không tìm thấy nội dung liên quan trong tài liệu SecLearn nên không thể trả lời câu này. " +
        "SecLearn chỉ trả lời dựa trên các tài liệu đã được tải lên.\n\n" +
        `Bạn có thể hỏi về các chủ đề có trong tài liệu, ví dụ: ${TOPICS_VI}.`
    : "I could not find anything related in the SecLearn documents, so I can't answer this. " +
        "SecLearn only answers from the uploaded documents.\n\n" +
        `You can ask about topics the documents cover, for example: ${TOPICS_EN}.`;
}

/** The fixed reply as a token stream, so routes handle it like an LLM answer. */
export async function* fixedAnswer(text: string): AsyncGenerator<string, void, unknown> {
  yield text;
}

export function groundedSystemPrompt(context: string, locale: string): string {
  return [
    "You are SecLearn, a beginner cybersecurity tutor. You answer ONLY from the numbered SecLearn document passages below.",
    "Rules:",
    "1. Use only facts stated in the passages. Do not add facts, examples, numbers, tools or advice from your own knowledge, even when you are sure they are correct.",
    "2. Cite every sentence that states a fact right after it, e.g. [1] or [2][3]. Only cite numbers that appear below, and do not add a separate reference list.",
    `3. If the passages cover only part of the question, answer that part and say plainly which part the documents do not cover (e.g. "${locale === "vi" ? "Tài liệu không đề cập đến" : "The documents do not cover"} ..."). If they do not answer it at all, say so in one or two sentences and stop.`,
    "4. You may rephrase, translate, summarise and structure the passages (headings, lists). Passages may be in English.",
    "5. Earlier answers in this conversation were also based on the documents; you may refer to them, but do not add facts that are not in the passages below.",
    "6. Never invent CVE numbers or claim access to private data.",
    `Answer in ${locale === "vi" ? "Vietnamese" : "English"}.`,
    `Passages:\n---\n${context}\n---`,
  ].join("\n");
}

const CITATION_RE = /\[(\d{1,2})\]/g;
/**
 * A sentence ends at ., ! or ? followed by a space or the line end ("99.9%" and "v4.2" don't end
 * one); citation markers right after the end ("Sentence. [1]") stay in that sentence.
 */
const SENTENCE_RE = /(?:[^.!?]|[.!?](?!\s|$))+(?:[.!?]+(?=\s|$)(?:\s*\[\d{1,2}\])*)?/g;
const UNCITED_MIN = 25;
/** Sentences that state nothing to cite: saying the documents lack something, or asking back. */
const NO_CLAIM_RE =
  /tài liệu (?:\S+ ){0,3}(?:không|chưa)|không (?:đề cập|có thông tin|nêu)|documents? (?:\S+ ){0,3}(?:do(?:es)? not|don't|doesn't)|not (?:mentioned|covered)|\?\s*$/i;

/**
 * Answer sentences that make a statement without a valid `[n]` citation, as ranges in `content`.
 * Skips code, headings, table rows, short fragments, lead-ins ending with ":" and sentences that
 * only say the documents lack something. Nothing is flagged when there are no sources.
 */
export function uncitedSentences(content: string, sourceCount: number): TextRange[] {
  if (!sourceCount) return [];
  const masked = maskCode(content);
  const out: TextRange[] = [];
  let lineStart = 0;
  for (const line of masked.split("\n")) {
    const offset = lineStart;
    lineStart += line.length + 1;
    if (/^\s*(?:#{1,6}\s|\|)/.test(line)) continue;
    for (const m of line.matchAll(SENTENCE_RE)) {
      const raw = m[0];
      const cited = [...raw.matchAll(CITATION_RE)].some((c) => {
        const n = Number(c[1]);
        return n >= 1 && n <= sourceCount;
      });
      if (cited) continue;
      const lead = raw.length - raw.trimStart().length;
      const start = offset + m.index + lead;
      const end = offset + m.index + raw.trimEnd().length;
      const text = content
        .slice(start, end)
        .replace(/^(?:[-*+]|\d+\.)\s+/, "")
        .replace(/[*_`]/g, "")
        .trim();
      if (text.length < UNCITED_MIN || text.endsWith(":") || NO_CLAIM_RE.test(text)) continue;
      // Skip the list marker so only the sentence itself is underlined.
      const marker = /^(?:[-*+]|\d+\.)\s+/.exec(content.slice(start, end))?.[0].length ?? 0;
      out.push({ start: start + marker, end });
    }
  }
  return out;
}
