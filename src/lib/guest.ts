import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { GUEST_COOKIE, getEnv } from "@/lib/env";

export async function getOrCreateGuestKey(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(GUEST_COOKIE)?.value;
  if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
    return existing;
  }
  const guestKey = randomUUID();
  jar.set(GUEST_COOKIE, guestKey, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return guestKey;
}

export async function getGuestQuota(guestKey: string) {
  const env = getEnv();
  const limit = env.GUEST_QUESTION_LIMIT;
  let row = await prisma.guestQuota.findUnique({ where: { guestKey } });
  if (!row) {
    row = await prisma.guestQuota.create({
      data: {
        guestKey,
        questionCount: 0,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }
  const remaining = Math.max(0, limit - row.questionCount);
  return { row, limit, remaining, questionCount: row.questionCount };
}

export async function incrementGuestQuota(guestKey: string) {
  const env = getEnv();
  const limit = env.GUEST_QUESTION_LIMIT;
  const current = await getGuestQuota(guestKey);
  if (current.questionCount >= limit) {
    return { ok: false as const, ...current };
  }
  const row = await prisma.guestQuota.update({
    where: { guestKey },
    data: { questionCount: { increment: 1 } },
  });
  const remaining = Math.max(0, limit - row.questionCount);
  return {
    ok: true as const,
    row,
    limit,
    remaining,
    questionCount: row.questionCount,
  };
}

export async function clearGuestQuota(guestKey: string) {
  await prisma.guestQuota.deleteMany({ where: { guestKey } });
  const jar = await cookies();
  jar.delete(GUEST_COOKIE);
}
