import OpenAI from "openai";
import {
  getEnv,
  resolveLlmModel,
} from "@/lib/env";
import {
  AppError,
  isAppError,
  llmApiError,
  missingLlmKeyError,
} from "@/lib/errors";
import { CONTEXT_CHAR_LIMIT } from "@/lib/rag";
import { citationReminder, conversationSystemPrompt, groundedSystemPrompt } from "@/lib/grounding";

export type ChatTurn = { role: "user" | "assistant" | "system"; content: string };

function mockStream(answer: string): AsyncGenerator<string, void, unknown> {
  async function* gen() {
    const parts = answer.match(/.{1,12}/g) ?? [answer];
    for (const part of parts) {
      yield part;
      await new Promise((r) => setTimeout(r, 12));
    }
  }
  return gen();
}

function buildMockAnswer(messages: ChatTurn[], context: string, locale: string): string {
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const vi = locale.startsWith("vi");
  if (!context.trim()) {
    return vi
      ? `Mình chưa tìm thấy tài liệu liên quan trong kho RAG công khai. Bạn hỏi: "${last.slice(0, 160)}". Hãy thử diễn đạt lại hoặc đăng nhập để truy cập thêm tài liệu.`
      : `I could not find related documents in the public RAG corpus. You asked: "${last.slice(0, 160)}". Try rephrasing, or sign in for authenticated materials.`;
  }
  const snippet = context.slice(0, 500).replace(/\s+/g, " ");
  return vi
    ? `Dựa trên tài liệu SecLearn:\n\n${snippet}\n\nTóm lại: đây là kiến thức bảo mật cơ bản liên quan câu hỏi của bạn. (Chế độ mock — LLM_PROVIDER=mock.)`
    : `Based on SecLearn materials:\n\n${snippet}\n\nIn short: this covers beginner cybersecurity related to your question. (Mock mode — LLM_PROVIDER=mock.)`;
}

export function assertLlmConfigured(): void {
  const env = getEnv();
  if (env.LLM_PROVIDER === "mock") return;
  if (env.LLM_PROVIDER === "deepseek" && !env.DEEPSEEK_API_KEY.trim()) {
    throw missingLlmKeyError("deepseek");
  }
  if (env.LLM_PROVIDER === "openai" && !env.OPENAI_API_KEY.trim()) {
    throw missingLlmKeyError("openai");
  }
}

function createLlmClient() {
  const env = getEnv();
  assertLlmConfigured();
  if (env.LLM_PROVIDER === "deepseek") {
    return new OpenAI({
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    });
  }
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

type ChatRequest = {
  messages: ChatTurn[];
  context: string;
  locale: string;
  /** `documents` (default): grounded in `context`. `conversation`: about the chat itself, no passages. */
  mode?: "documents" | "conversation";
};

/** System prompt plus turns as sent to the model; the citation reminder rides on the latest question. */
export function chatRequestMessages(opts: ChatRequest): ChatTurn[] {
  const turns = opts.messages.filter((m) => m.role !== "system");
  if (opts.mode === "conversation") {
    return [{ role: "system", content: conversationSystemPrompt(opts.locale) }, ...turns];
  }
  // Callers answer an empty context with noSourcesAnswer() instead of calling the model.
  const system = groundedSystemPrompt(opts.context.slice(0, CONTEXT_CHAR_LIMIT), opts.locale);
  const last = turns.at(-1);
  if (turns.length > 1 && last?.role === "user") {
    turns[turns.length - 1] = { ...last, content: last.content + citationReminder(opts.locale) };
  }
  return [{ role: "system", content: system }, ...turns];
}

export async function streamChatCompletion(
  opts: ChatRequest & { signal?: AbortSignal },
): Promise<AsyncGenerator<string, void, unknown>> {
  const env = getEnv();
  const messages = chatRequestMessages(opts);

  // Mock ONLY when explicitly configured — never silent fallback for deepseek/openai.
  if (env.LLM_PROVIDER === "mock") {
    return mockStream(buildMockAnswer(opts.messages, opts.context, opts.locale));
  }

  assertLlmConfigured();
  const client = createLlmClient();
  const model = resolveLlmModel(env);

  try {
    const stream = await client.chat.completions.create(
      {
        model,
        stream: true,
        messages,
        temperature: 0.2,
        // DeepSeek-flash defaults to thinking mode; disable for snappy tutor replies.
        ...(env.LLM_PROVIDER === "deepseek"
          ? ({ thinking: { type: "disabled" } } as Record<string, unknown>)
          : {}),
      } as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
      { signal: opts.signal },
    );

    async function* gen() {
      try {
        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content;
          if (token) yield token;
        }
      } catch (err) {
        if (isAppError(err)) throw err;
        const detail = err instanceof Error ? err.message : "stream error";
        throw llmApiError(detail);
      }
    }
    return gen();
  } catch (err) {
    if (isAppError(err)) throw err;
    const detail = err instanceof Error ? err.message : "request failed";
    throw llmApiError(detail);
  }
}

type CompletionOptions = {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

/**
 * One non-streaming JSON-mode completion; returns the raw reply text. Callers parse and validate it.
 * Not for mock mode: callers must handle LLM_PROVIDER=mock themselves.
 */
export function completeJson(opts: CompletionOptions): Promise<string> {
  return complete(opts, true);
}

/** One short non-streaming plain-text completion. Not for mock mode, like `completeJson`. */
export function completeText(opts: CompletionOptions): Promise<string> {
  return complete(opts, false);
}

async function complete(opts: CompletionOptions, json: boolean): Promise<string> {
  const env = getEnv();
  const client = createLlmClient();
  try {
    const res = await client.chat.completions.create(
      {
        model: resolveLlmModel(env),
        temperature: opts.temperature ?? 0,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(json ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        ...(env.LLM_PROVIDER === "deepseek"
          ? ({ thinking: { type: "disabled" } } as Record<string, unknown>)
          : {}),
      } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
      { signal: opts.signal },
    );
    return res.choices[0]?.message?.content ?? "";
  } catch (err) {
    if (isAppError(err)) throw err;
    throw llmApiError(err instanceof Error ? err.message : "request failed");
  }
}

export async function generateQuizJson(opts: {
  locale: string;
  topicHint?: string;
  conversationSnippet?: string;
}): Promise<{
  titleVi: string;
  titleEn: string;
  description: string;
  questions: Array<{
    prompt: string;
    options: Array<{ id: string; text: string }>;
    correctOptionId: string;
  }>;
}> {
  const env = getEnv();
  const fallback = {
    titleVi: "Ôn tập bảo mật cơ bản",
    titleEn: "Basic security review",
    description: opts.topicHint || "Review quiz from SecLearn",
    questions: [
      {
        prompt:
          opts.locale === "vi"
            ? "Mật khẩu mạnh nên có đặc điểm nào?"
            : "Which trait makes a password stronger?",
        options: [
          { id: "a", text: opts.locale === "vi" ? "Dài, ngẫu nhiên, không tái sử dụng" : "Long, random, not reused" },
          { id: "b", text: opts.locale === "vi" ? "Chỉ gồm ngày sinh" : "Only your birthday" },
          { id: "c", text: opts.locale === "vi" ? "Giống mọi tài khoản" : "Same on every account" },
          { id: "d", text: opts.locale === "vi" ? "Viết trên màn hình" : "Written on the monitor" },
        ],
        correctOptionId: "a",
      },
      {
        prompt:
          opts.locale === "vi"
            ? "Phishing thường cố gắng làm gì?"
            : "What does phishing usually try to do?",
        options: [
          { id: "a", text: opts.locale === "vi" ? "Lừa lấy thông tin đăng nhập" : "Trick you into giving credentials" },
          { id: "b", text: opts.locale === "vi" ? "Tăng tốc mạng" : "Speed up your network" },
          { id: "c", text: opts.locale === "vi" ? "Sao lưu dữ liệu tự động" : "Auto-backup data" },
          { id: "d", text: opts.locale === "vi" ? "Cập nhật phần mềm hợp pháp" : "Install legitimate updates" },
        ],
        correctOptionId: "a",
      },
      {
        prompt:
          opts.locale === "vi"
            ? "2FA / MFA giúp gì?"
            : "What does 2FA / MFA help with?",
        options: [
          { id: "a", text: opts.locale === "vi" ? "Thêm lớp xác thực ngoài mật khẩu" : "Add a factor beyond the password" },
          { id: "b", text: opts.locale === "vi" ? "Thay thế antivirus" : "Replace antivirus" },
          { id: "c", text: opts.locale === "vi" ? "Ẩn IP công khai" : "Hide your public IP" },
          { id: "d", text: opts.locale === "vi" ? "Tăng dung lượng ổ cứng" : "Increase disk space" },
        ],
        correctOptionId: "a",
      },
      {
        prompt:
          opts.locale === "vi"
            ? "Khi nhận email khả nghi bạn nên?"
            : "If you get a suspicious email you should?",
        options: [
          {
            id: "a",
            text:
              opts.locale === "vi"
                ? "Kiểm tra người gửi, không bấm link lạ"
                : "Check the sender and avoid odd links",
          },
          { id: "b", text: opts.locale === "vi" ? "Gửi mật khẩu để xác minh" : "Send your password to verify" },
          { id: "c", text: opts.locale === "vi" ? "Tải mọi tệp đính kèm" : "Download every attachment" },
          { id: "d", text: opts.locale === "vi" ? "Chia sẻ cho cả nhóm ngay" : "Forward it to the whole team" },
        ],
        correctOptionId: "a",
      },
      {
        prompt:
          opts.locale === "vi"
            ? "Cập nhật phần mềm quan trọng vì?"
            : "Why is software updating important?",
        options: [
          {
            id: "a",
            text:
              opts.locale === "vi"
                ? "Vá lỗ hổng bảo mật đã biết"
                : "It patches known security holes",
          },
          { id: "b", text: opts.locale === "vi" ? "Làm chậm thiết bị cố ý" : "It intentionally slows devices" },
          { id: "c", text: opts.locale === "vi" ? "Xóa hết dữ liệu an toàn" : "It deletes all safe data" },
          { id: "d", text: opts.locale === "vi" ? "Thay thế mật khẩu" : "It replaces passwords" },
        ],
        correctOptionId: "a",
      },
    ],
  };

  if (env.LLM_PROVIDER === "mock") return fallback;

  assertLlmConfigured();
  const client = createLlmClient();
  const model = resolveLlmModel(env);

  try {
    const res = await client.chat.completions.create({
      model,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return JSON with titleVi, titleEn, description, questions[{prompt,options[{id,text}],correctOptionId}]. Exactly 5 MCQs for beginner cybersecurity review (Ôn tập). Options ids a-d.",
        },
        {
          role: "user",
          content: JSON.stringify({
            locale: opts.locale,
            topicHint: opts.topicHint,
            conversationSnippet: opts.conversationSnippet?.slice(0, 2000),
          }),
        },
      ],
      ...(env.LLM_PROVIDER === "deepseek"
        ? ({ thinking: { type: "disabled" } } as Record<string, unknown>)
        : {}),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);

    const raw = res.choices[0]?.message?.content;
    if (!raw) {
      throw new AppError({
        code: "LLM_EMPTY",
        status: 502,
        messageVi: "LLM không trả về nội dung quiz. Thử lại hoặc đổi LLM_MODEL.",
        messageEn: "LLM returned an empty quiz payload. Retry or change LLM_MODEL.",
      });
    }
    const parsed = JSON.parse(raw) as typeof fallback;
    if (!Array.isArray(parsed.questions) || parsed.questions.length < 3) {
      throw new AppError({
        code: "LLM_INVALID_QUIZ",
        status: 502,
        messageVi: "LLM trả JSON quiz không hợp lệ. Thử lại.",
        messageEn: "LLM returned an invalid quiz JSON payload. Please retry.",
      });
    }
    return parsed;
  } catch (err) {
    if (isAppError(err)) throw err;
    if (err instanceof SyntaxError) {
      throw new AppError({
        code: "LLM_INVALID_QUIZ",
        status: 502,
        messageVi: "Không parse được JSON quiz từ LLM.",
        messageEn: "Could not parse quiz JSON from the LLM.",
      });
    }
    const detail = err instanceof Error ? err.message : "request failed";
    throw llmApiError(detail);
  }
}
