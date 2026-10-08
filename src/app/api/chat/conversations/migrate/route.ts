import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/session";
import { migrateSchema } from "@/lib/validations";
import { clearGuestQuota, getOrCreateGuestKey } from "@/lib/guest";
import { cookies } from "next/headers";
import { GUEST_COOKIE } from "@/lib/env";

export async function POST(req: Request) {
  const authz = await requireUser();
  if (authz.error) return authz.error;

  try {
    const body = await req.json();
    const parsed = migrateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid draft to migrate", 400, "VALIDATION");
    }

    const messages = parsed.data.messages.filter((m) => m.role === "user" || m.role === "assistant");
    if (!messages.length) {
      return jsonError("No messages to migrate", 400, "VALIDATION");
    }

    const title =
      parsed.data.title ||
      messages.find((m) => m.role === "user")?.content.slice(0, 60) ||
      "Migrated chat";

    const conversation = await prisma.conversation.create({
      data: {
        userId: authz.user.id,
        title,
        locale: parsed.data.locale ?? authz.user.preferredLocale,
        migratedFromGuest: true,
        messages: {
          create: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
      },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    const jar = await cookies();
    const guestKey = jar.get(GUEST_COOKIE)?.value;
    if (guestKey) {
      await clearGuestQuota(guestKey);
    } else {
      try {
        const key = await getOrCreateGuestKey();
        await clearGuestQuota(key);
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ conversation });
  } catch {
    return jsonError("Migrate failed", 500, "SERVER");
  }
}
