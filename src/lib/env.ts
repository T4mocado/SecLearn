import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(8),
  AUTH_URL: z.string().optional(),
  LLM_PROVIDER: z.enum(["mock", "openai", "deepseek"]).default("mock"),
  EMBED_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
  OPENAI_API_KEY: z.string().optional().default(""),
  DEEPSEEK_API_KEY: z.string().optional().default(""),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(6),
  UPLOAD_DIR: z.string().default("./data/uploads"),
  GUEST_QUESTION_LIMIT: z.coerce.number().int().positive().default(10),
  RAG_TOP_K: z.coerce.number().int().positive().default(5),
  CHUNK_SIZE: z.coerce.number().int().positive().default(800),
  CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(80),
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

export const EMBED_DIM = 1536;
export const GUEST_COOKIE = "guest_chat_id";
export const MAX_MIGRATE_MESSAGES = 40;
export const MAX_MESSAGE_CHARS = 4000;
