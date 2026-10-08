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

export const registerSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(128),
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
