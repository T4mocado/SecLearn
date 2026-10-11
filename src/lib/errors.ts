export type AppLocale = "vi" | "en";

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly messageVi: string;
  readonly messageEn: string;

  constructor(opts: {
    code: string;
    status?: number;
    messageVi: string;
    messageEn: string;
  }) {
    super(opts.messageEn);
    this.name = "AppError";
    this.code = opts.code;
    this.status = opts.status ?? 503;
    this.messageVi = opts.messageVi;
    this.messageEn = opts.messageEn;
  }

  messageFor(locale?: string | null): string {
    return locale?.startsWith("vi") ? this.messageVi : this.messageEn;
  }

  toJSON(locale?: string | null) {
    return {
      error: this.messageFor(locale),
      code: this.code,
      messageVi: this.messageVi,
      messageEn: this.messageEn,
    };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function missingLlmKeyError(provider: "openai" | "deepseek"): AppError {
  if (provider === "deepseek") {
    return new AppError({
      code: "LLM_KEY_MISSING",
      status: 503,
      messageVi:
        "Chưa cấu hình DEEPSEEK_API_KEY. Thêm key vào file .env rồi khởi động lại server.",
      messageEn:
        "DEEPSEEK_API_KEY is missing. Add it to your .env file and restart the server.",
    });
  }
  return new AppError({
    code: "LLM_KEY_MISSING",
    status: 503,
    messageVi:
      "Chưa cấu hình OPENAI_API_KEY cho chat. Thêm key vào file .env rồi khởi động lại server.",
    messageEn:
      "OPENAI_API_KEY is missing for chat. Add it to your .env file and restart the server.",
  });
}

export function llmApiError(detail?: string): AppError {
  const suffix = detail ? ` (${detail})` : "";
  return new AppError({
    code: "LLM_API_ERROR",
    status: 502,
    messageVi: `Không gọi được API LLM${suffix}. Kiểm tra key, model (LLM_MODEL) và kết nối mạng.`,
    messageEn: `LLM API request failed${suffix}. Check your API key, LLM_MODEL, and network.`,
  });
}

export function missingEmbedKeyError(): AppError {
  return new AppError({
    code: "EMBED_KEY_MISSING",
    status: 503,
    messageVi:
      "Chưa cấu hình OPENAI_API_KEY cho embeddings. Thêm key vào .env (mặc định EMBED_PROVIDER=openai), hoặc đặt EMBED_PROVIDER=local / mock.",
    messageEn:
      "OPENAI_API_KEY is missing for embeddings. Add it to .env (default EMBED_PROVIDER=openai), or set EMBED_PROVIDER=local / mock.",
  });
}

export function embedApiError(detail?: string): AppError {
  const suffix = detail ? ` (${detail})` : "";
  return new AppError({
    code: "EMBED_API_ERROR",
    status: 502,
    messageVi: `Embedding thất bại${suffix}. Kiểm tra OPENAI_API_KEY / EMBED_MODEL; với EMBED_PROVIDER=local lần đầu có thể cần tải model (disk/RAM).`,
    messageEn: `Embedding failed${suffix}. Check OPENAI_API_KEY / EMBED_MODEL; with EMBED_PROVIDER=local the first run may download model weights (disk/RAM).`,
  });
}
