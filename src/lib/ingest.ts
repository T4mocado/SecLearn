import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { chunkMarkdown } from "@/lib/rag";
import { embedText, vectorLiteral } from "@/lib/embed";

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text || "";
  } catch {
    // Fallback: treat as utf8 text if parse fails
    return buffer.toString("utf8").replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, " ");
  }
}

function toMarkdown(text: string, title: string): string {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `# ${title}\n\n${cleaned}`;
}

export async function processDocument(documentId: string): Promise<void> {
  const env = getEnv();
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return;

  await prisma.document.update({
    where: { id: documentId },
    data: { status: "pending", errorMessage: null },
  });

  try {
    const fs = await import("fs/promises");
    const buffer = await fs.readFile(doc.storagePath);
    const text = await extractPdfText(buffer);
    if (!text.trim()) {
      throw new Error("Could not extract text from PDF");
    }
    const markdown = toMarkdown(text, doc.title);
    const chunks = chunkMarkdown(markdown, env.CHUNK_SIZE, env.CHUNK_OVERLAP);
    if (!chunks.length) {
      throw new Error("No chunks produced from document");
    }

    await prisma.documentChunk.deleteMany({ where: { documentId } });

    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i]!;
      const embedding = await embedText(content);
      const created = await prisma.documentChunk.create({
        data: {
          documentId,
          content,
          chunkIndex: i,
          tokenCount: Math.ceil(content.length / 4),
        },
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2`,
        vectorLiteral(embedding),
        created.id,
      );
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { markdown, status: "ready", errorMessage: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingest failed";
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "failed", errorMessage: message },
    });
  }
}

export async function saveUploadedPdf(opts: {
  file: File;
  title: string;
  visibility: "public" | "authenticated";
  uploadedById: string;
}): Promise<string> {
  const env = getEnv();
  if (opts.file.type !== "application/pdf" && !opts.file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("ONLY_PDF");
  }
  const safeName = path.basename(opts.file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
  const uploadDir = path.resolve(env.UPLOAD_DIR);
  await mkdir(uploadDir, { recursive: true });
  const filename = `${Date.now()}-${safeName}`;
  const storagePath = path.join(uploadDir, filename);
  const buf = Buffer.from(await opts.file.arrayBuffer());
  await writeFile(storagePath, buf);

  const doc = await prisma.document.create({
    data: {
      title: opts.title,
      filename: safeName,
      mimeType: "application/pdf",
      storagePath,
      visibility: opts.visibility,
      status: "pending",
      uploadedById: opts.uploadedById,
    },
  });

  // Fire-and-forget ingest; status tracked in DB
  void processDocument(doc.id);
  return doc.id;
}

export async function deleteDocumentFiles(storagePath: string) {
  try {
    await unlink(storagePath);
  } catch {
    // ignore missing file
  }
}
