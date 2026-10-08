import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/session";
import { createConversationSchema } from "@/lib/validations";

export async function GET() {
  const authz = await requireUser();
  if (authz.error) return authz.error;

  const conversations = await prisma.conversation.findMany({
    where: { userId: authz.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      locale: true,
      migratedFromGuest: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ conversations });
}

export async function POST(req: Request) {
  const authz = await requireUser();
  if (authz.error) return authz.error;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = createConversationSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid conversation", 400, "VALIDATION");

    const conversation = await prisma.conversation.create({
      data: {
        userId: authz.user.id,
        title: parsed.data.title || "New chat",
        locale: parsed.data.locale ?? authz.user.preferredLocale,
      },
    });
    return NextResponse.json({ conversation }, { status: 201 });
  } catch {
    return jsonError("Could not create conversation", 500, "SERVER");
  }
}
