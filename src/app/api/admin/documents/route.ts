import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError } from "@/lib/session";
import { saveUploadedPdf } from "@/lib/ingest";
import { z } from "zod";

export async function GET() {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;

  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { chunks: true } } },
  });
  return NextResponse.json({
    documents: documents.map((d) => ({
      id: d.id,
      title: d.title,
      filename: d.filename,
      visibility: d.visibility,
      status: d.status,
      errorMessage: d.errorMessage,
      chunkCount: d._count.chunks,
      createdAt: d.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;

  try {
    const form = await req.formData();
    const file = form.get("file");
    const title = String(form.get("title") || "").trim();
    const visibilityRaw = String(form.get("visibility") || "public");
    const visibilityParsed = z.enum(["public", "authenticated"]).safeParse(visibilityRaw);
    if (!(file instanceof File)) return jsonError("Missing file", 400, "VALIDATION");
    if (!title) return jsonError("Title required", 400, "VALIDATION");
    if (!visibilityParsed.success) return jsonError("Invalid visibility", 400, "VALIDATION");

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return jsonError("Only PDF uploads are accepted", 415, "ONLY_PDF");
    }

    const id = await saveUploadedPdf({
      file,
      title,
      visibility: visibilityParsed.data,
      uploadedById: authz.user.id,
    });

    const document = await prisma.document.findUnique({ where: { id } });
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "ONLY_PDF") {
      return jsonError("Only PDF uploads are accepted", 415, "ONLY_PDF");
    }
    return jsonError("Upload failed", 500, "SERVER");
  }
}
