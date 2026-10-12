import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError } from "@/lib/session";
import { getEnv } from "@/lib/env";
import { documentFileResponse } from "@/lib/document-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Opens an uploaded document in the browser (admin only): the PDF itself, or a seeded doc's Markdown. */
export async function GET(_req: Request, { params }: Params) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;
  const { id } = await params;

  const doc = await prisma.document.findUnique({
    where: { id },
    select: { id: true, title: true, filename: true, storagePath: true, markdown: true },
  });
  if (!doc) return jsonError("Not found", 404, "NOT_FOUND");
  return (await documentFileResponse(doc, getEnv().UPLOAD_DIR)) ?? jsonError("File not found", 404, "FILE_MISSING");
}
