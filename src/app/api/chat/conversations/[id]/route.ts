import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const authz = await requireUser();
  if (authz.error) return authz.error;
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: authz.user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) return jsonError("Not found", 404, "NOT_FOUND");
  return NextResponse.json({ conversation });
}

export async function DELETE(_req: Request, { params }: Params) {
  const authz = await requireUser();
  if (authz.error) return authz.error;
  const { id } = await params;

  const existing = await prisma.conversation.findFirst({
    where: { id, userId: authz.user.id },
  });
  if (!existing) return jsonError("Not found", 404, "NOT_FOUND");

  await prisma.conversation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
