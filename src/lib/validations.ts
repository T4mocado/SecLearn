import { z } from "zod";

export const localeSchema = z.enum(["vi", "en"]);

export const chatMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  locale: localeSchema.optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(8000),
      }),
    )
    .max(40)
    .optional(),
});

export const migrateSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().trim().min(1).max(8000),
      }),
    )
    .min(1)
    .max(40),
  locale: localeSchema.optional(),
  title: z.string().trim().max(120).optional(),
});

/**
 * Registration password rules, shared by the register form (live checklist) and the API.
 * Letters are Unicode-aware, so Vietnamese "Ă"/"ă" count as upper/lower case.
 * Login keeps its own looser schema so accounts created before these rules can still sign in.
 */
export const PASSWORD_RULES = [
  { key: "length", test: (p: string) => p.length >= 8 },
  { key: "upper", test: (p: string) => /\p{Lu}/u.test(p) },
  { key: "lower", test: (p: string) => /\p{Ll}/u.test(p) },
  { key: "digit", test: (p: string) => /\p{Nd}/u.test(p) },
  { key: "special", test: (p: string) => /[^\p{L}\p{N}\s]/u.test(p) },
] as const;

export type PasswordRule = (typeof PASSWORD_RULES)[number]["key"];

export function failedPasswordRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.key);
}

export const strongPasswordSchema = z
  .string()
  .max(128)
  .refine((p) => failedPasswordRules(p).length === 0, { message: "WEAK_PASSWORD" });

export const registerSchema = z.object({
  email: z.string().email().max(200),
  password: strongPasswordSchema,
  name: z.string().trim().min(1).max(80).optional(),
  preferredLocale: localeSchema.optional(),
});

export const createConversationSchema = z.object({
  title: z.string().trim().max(120).optional(),
  locale: localeSchema.optional(),
});

export const generateQuizSchema = z.object({
  locale: localeSchema.optional(),
  conversationId: z.string().cuid().optional(),
  topicHint: z.string().trim().max(200).optional(),
});

export const attemptSchema = z.object({
  answers: z.record(z.string(), z.string()),
  mode: z.literal("review").default("review"),
});

export const adminUserPatchSchema = z.object({
  role: z.enum(["learner", "admin"]).optional(),
  disabled: z.boolean().optional(),
  preferredLocale: localeSchema.optional(),
});

export const documentPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  visibility: z.enum(["public", "authenticated"]).optional(),
});

export const lessonUpsertSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
  order: z.number().int().optional(),
  published: z.boolean().optional(),
  vi: z.object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(500),
    content: z.string().trim().min(1).max(50000),
  }),
  en: z.object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(500),
    content: z.string().trim().min(1).max(50000),
  }),
});
