import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError } from "@/lib/session";
import { documentPatchSchema } from "@/lib/validations";
import { deleteDocumentFiles } from "@/lib/ingest";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;
  const { id } = await params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: { _count: { select: { chunks: true } } },
  });
  if (!document) return jsonError("Not found", 404, "NOT_FOUND");
  return NextResponse.json({ document });
}

export async function PATCH(req: Request, { params }: Params) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;
  const { id } = await params;

  try {
    const body = await req.json();
    const parsed = documentPatchSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid patch", 400, "VALIDATION");

    const document = await prisma.document.update({
      where: { id },
      data: {
        title: parsed.data.title,
        visibility: parsed.data.visibility,
      },
    });
    return NextResponse.json({ document });
  } catch {
    return jsonError("Update failed", 500, "SERVER");
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;
  const { id } = await params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) return jsonError("Not found", 404, "NOT_FOUND");

  await prisma.document.delete({ where: { id } });
  await deleteDocumentFiles(document.storagePath);
  return NextResponse.json({ ok: true });
}
