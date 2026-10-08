import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError } from "@/lib/session";
import { processDocument } from "@/lib/ingest";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;
  const { id } = await params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) return jsonError("Not found", 404, "NOT_FOUND");

  await prisma.document.update({
    where: { id },
    data: { status: "pending", errorMessage: null },
  });
  void processDocument(id);

  return NextResponse.json({ ok: true, status: "pending" });
}
