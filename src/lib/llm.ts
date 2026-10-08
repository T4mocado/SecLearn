import OpenAI from "openai";
import { getEnv } from "@/lib/env";

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
    ? `Dựa trên tài liệu SecLearn:\n\n${snippet}\n\nTóm lại: đây là kiến thức bảo mật cơ bản liên quan câu hỏi của bạn. (Chế độ demo — chưa cấu hình API key LLM.)`
    : `Based on SecLearn materials:\n\n${snippet}\n\nIn short: this covers beginner cybersecurity related to your question. (Demo mode — LLM API key not configured.)`;
}

export async function streamChatCompletion(opts: {
  messages: ChatTurn[];
  context: string;
  locale: string;
  signal?: AbortSignal;
}): Promise<AsyncGenerator<string, void, unknown>> {
  const env = getEnv();
  const system = [
    "You are SecLearn, a friendly beginner cybersecurity tutor.",
    "Answer clearly using the retrieved context when relevant.",
    "If context is insufficient, say so and give safe general guidance.",
    "Never invent CVE numbers or claim private data access.",
    `Prefer language: ${opts.locale === "vi" ? "Vietnamese" : "English"}.`,
    opts.context
      ? `Retrieved context:\n---\n${opts.context.slice(0, 6000)}\n---`
      : "No retrieved context.",
  ].join("\n");

  const provider =
    env.LLM_PROVIDER === "mock" ||
    (env.LLM_PROVIDER === "openai" && !env.OPENAI_API_KEY) ||
    (env.LLM_PROVIDER === "deepseek" && !env.DEEPSEEK_API_KEY)
      ? "mock"
      : env.LLM_PROVIDER;

  if (provider === "mock") {
    return mockStream(buildMockAnswer(opts.messages, opts.context, opts.locale));
  }

  const client =
    provider === "deepseek"
      ? new OpenAI({
          apiKey: env.DEEPSEEK_API_KEY,
          baseURL: "https://api.deepseek.com",
        })
      : new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const model = provider === "deepseek" ? "deepseek-chat" : "gpt-4o-mini";

  try {
    const stream = await client.chat.completions.create(
      {
        model,
        stream: true,
        messages: [{ role: "system", content: system }, ...opts.messages.filter((m) => m.role !== "system")],
        temperature: 0.4,
      },
      { signal: opts.signal },
    );

    async function* gen() {
      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content;
        if (token) yield token;
      }
    }
    return gen();
  } catch {
    return mockStream(buildMockAnswer(opts.messages, opts.context, opts.locale));
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

  const provider =
    env.LLM_PROVIDER === "mock" ||
    (env.LLM_PROVIDER === "openai" && !env.OPENAI_API_KEY) ||
    (env.LLM_PROVIDER === "deepseek" && !env.DEEPSEEK_API_KEY)
      ? "mock"
      : env.LLM_PROVIDER;

  if (provider === "mock") return fallback;

  const client =
    provider === "deepseek"
      ? new OpenAI({ apiKey: env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" })
      : new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = provider === "deepseek" ? "deepseek-chat" : "gpt-4o-mini";

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
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as typeof fallback;
    if (!Array.isArray(parsed.questions) || parsed.questions.length < 3) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}
