import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(8),
  AUTH_URL: z.string().optional(),
  /** Default: deepseek (product lock). Use mock only for local smoke without keys. */
  LLM_PROVIDER: z.enum(["mock", "openai", "deepseek"]).default("deepseek"),
  /** Default: OpenAI embeddings (option A). Optional: local MiniLM / mock. */
  EMBED_PROVIDER: z.enum(["mock", "openai", "local", "huggingface"]).default("openai"),
  /** HuggingFace Inference token (EMBED_PROVIDER=huggingface, BKAI vietnamese-bi-encoder, dim 768). */
  HF_TOKEN: z.string().optional().default(""),
  /** Optional override of the HF feature-extraction endpoint (e.g. dedicated Inference Endpoint). */
  HF_EMBED_URL: z.string().optional().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  DEEPSEEK_API_KEY: z.string().optional().default(""),
  /** DeepSeek default: deepseek-flash (current official). OpenAI default: gpt-4o-mini. */
  LLM_MODEL: z.string().optional().default(""),
  /** OpenAI default: text-embedding-3-small. Local: Xenova/all-MiniLM-L6-v2. */
  EMBED_MODEL: z.string().optional().default(""),
  /** Must match Prisma vector(N). OpenAI text-embedding-3-small default = 1536; local MiniLM = 384. */
  EMBED_DIM: z.coerce.number().int().positive().default(1536),
  TRANSFORMERS_CACHE: z.string().optional().default(""),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(6),
  UPLOAD_DIR: z.string().default("./data/uploads"),
  GUEST_QUESTION_LIMIT: z.coerce.number().int().positive().default(10),
  RAG_TOP_K: z.coerce.number().int().positive().default(5),
  /** Cross-encoder endpoint (scripts/embed_server.py /rerank). Empty = rank by cosine only. */
  RERANK_URL: z.string().optional().default(""),
  /** Vector candidates fetched for the reranker to choose RAG_TOP_K from. */
  RAG_CANDIDATES: z.coerce.number().int().positive().default(20),
  /** Reranked chunks scoring below this (0..1) are dropped. Kept low: bge-reranker scores Vietnamese
   *  questions against English chunks far lower (~0.01-0.05 when relevant) than same-language pairs. */
  RAG_MIN_RELEVANCE: z.coerce.number().min(0).max(1).default(0.01),
  /** Rerank keeps at least this many chunks when at least one passes RAG_MIN_RELEVANCE (none pass = off topic). */
  RAG_MIN_KEEP: z.coerce.number().int().min(0).default(2),
  /** Also retrieve with an English translation of a non-English question (one short LLM call). */
  RAG_TRANSLATE_QUERY: z.enum(["on", "off"]).default("on"),
  /** Post-answer LLM judgement of each chunk's relevance (one extra LLM call per answer). */
  RAG_JUDGE: z.enum(["on", "off"]).default("on"),
  CHUNK_SIZE: z.coerce.number().int().positive().default(800),
  CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(80),
  /** Documents ingested at the same time; the embed server must accept that many parallel requests. */
  INGEST_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  /** Chunks embedded and inserted per round trip during ingest. */
  EMBED_BATCH_SIZE: z.coerce.number().int().min(1).max(256).default(32),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  cached = parsed.data;
  return cached;
}

/** Reset cache (tests). */
export function resetEnvCache() {
  cached = null;
}

export function resolveLlmModel(env: AppEnv = getEnv()): string {
  if (env.LLM_MODEL.trim()) return env.LLM_MODEL.trim();
  if (env.LLM_PROVIDER === "deepseek") return "deepseek-flash";
  if (env.LLM_PROVIDER === "openai") return "gpt-4o-mini";
  return "mock";
}

export function resolveEmbedModel(env: AppEnv = getEnv()): string {
  if (env.EMBED_MODEL.trim()) return env.EMBED_MODEL.trim();
  if (env.EMBED_PROVIDER === "local") return "Xenova/all-MiniLM-L6-v2";
  if (env.EMBED_PROVIDER === "huggingface") return "bkai-foundation-models/vietnamese-bi-encoder";
  if (env.EMBED_PROVIDER === "openai") return "text-embedding-3-small";
  return "mock-hash";
}

/**
 * Boot/request validation for locked providers.
 * Does not throw at boot — logs issues so the process can still start for healthchecks.
 * Request paths must call assertLlmConfigured / assertEmbedConfigured which throw AppError.
 */
export function validateProviderConfigAtBoot(): {
  ok: boolean;
  warnings: string[];
} {
  const env = getEnv();
  const warnings: string[] = [];

  if (env.LLM_PROVIDER === "deepseek" && !env.DEEPSEEK_API_KEY.trim()) {
    warnings.push("LLM_PROVIDER=deepseek but DEEPSEEK_API_KEY is empty — chat will fail until set.");
  }
  if (env.LLM_PROVIDER === "openai" && !env.OPENAI_API_KEY.trim()) {
    warnings.push("LLM_PROVIDER=openai but OPENAI_API_KEY is empty — chat will fail until set.");
  }
  if (env.EMBED_PROVIDER === "openai" && !env.OPENAI_API_KEY.trim()) {
    warnings.push("EMBED_PROVIDER=openai but OPENAI_API_KEY is empty — ingest/RAG will fail until set.");
  }
  if (env.EMBED_PROVIDER === "openai" && env.EMBED_DIM !== 1536) {
    warnings.push(
      `EMBED_PROVIDER=openai product default is EMBED_DIM=1536 (text-embedding-3-small); current EMBED_DIM=${env.EMBED_DIM}. Update Prisma vector(N) + reindex if intentional (embedding-3 supports custom dimensions).`,
    );
  }
  if (env.EMBED_PROVIDER === "local" && env.EMBED_DIM !== 384) {
    warnings.push(
      `EMBED_PROVIDER=local expects EMBED_DIM=384 (all-MiniLM-L6-v2); current EMBED_DIM=${env.EMBED_DIM}. Update Prisma vector(N) + reindex if intentional.`,
    );
  }

  for (const w of warnings) {
    console.warn(`[seclearn:env] ${w}`);
  }
  if (!warnings.length) {
    console.info(
      `[seclearn:env] providers ready: LLM=${env.LLM_PROVIDER}/${resolveLlmModel(env)} EMBED=${env.EMBED_PROVIDER}/${resolveEmbedModel(env)} dim=${env.EMBED_DIM} rerank=${env.RERANK_URL.trim() ? "on" : "off"} judge=${env.RAG_JUDGE}`,
    );
  }
  return { ok: warnings.length === 0, warnings };
}

/** Compile-time / schema default for OpenAI text-embedding-3-small. Prefer getEnv().EMBED_DIM at runtime. */
export const EMBED_DIM = 1536;
export const GUEST_COOKIE = "guest_chat_id";
export const MAX_MIGRATE_MESSAGES = 40;
export const MAX_MESSAGE_CHARS = 4000;
