import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError } from "@/lib/session";
import { enqueueDocument, isDocumentQueued } from "@/lib/ingest-queue";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;
  const { id } = await params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) return jsonError("Not found", 404, "NOT_FOUND");

  if (isDocumentQueued(id)) {
    return jsonError("Document is already being processed", 409, "BUSY", {
      messageEn: "Document is already being processed",
      messageVi: "Tài liệu đang được xử lý, vui lòng đợi",
    });
  }

  await prisma.document.update({
    where: { id },
    data: { status: "pending", errorMessage: null },
  });
  enqueueDocument(id);

  return NextResponse.json({ ok: true, status: "pending" });
}
