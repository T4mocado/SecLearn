import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { chunkMarkdown } from "@/lib/chunking";
import { randomUUID } from "crypto";
import { assertEmbedConfigured, embedTexts, vectorLiteral } from "@/lib/embed";
import { isAppError } from "@/lib/errors";
import { sanitizeTextForDb } from "@/lib/text-sanitize";
import { removeHeadersFooters, removeSiteChrome } from "@/lib/pdf-cleanup";
import { enqueueDocument } from "@/lib/ingest-queue";

/** Abort ingest when the embed backend looks down (server off, 402/429) instead of trying every chunk. */
const MAX_CONSECUTIVE_CHUNK_FAILURES = 5;

/** One multi-row INSERT (content, vector, keyword index) per batch instead of create + UPDATE per chunk. */
async function insertChunks(
  documentId: string,
  rows: Array<{ content: string; embedding: number[] }>,
  firstChunkIndex: number,
): Promise<void> {
  const params: unknown[] = [];
  const values = rows.map((r, i) => {
    const p = params.length;
    params.push(
      randomUUID(),
      documentId,
      r.content,
      firstChunkIndex + i,
      Math.ceil(r.content.length / 4),
      vectorLiteral(r.embedding),
    );
    return `($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}::vector, to_tsvector('english', $${p + 3}))`;
  });
  await prisma.$executeRawUnsafe(
    `INSERT INTO "DocumentChunk" ("id", "documentId", "content", "chunkIndex", "tokenCount", "embedding", "searchText") VALUES ${values.join(", ")}`,
    ...params,
  );
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  let result: Awaited<ReturnType<InstanceType<typeof import("pdf-parse").PDFParse>["getText"]>>;
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      result = await parser.getText();
    } finally {
      await parser.destroy();
    }
  } catch (err) {
    // Never fall back to reading the binary file as text — that stores compressed PDF bytes as chunks.
    const detail = err instanceof Error ? err.message.slice(0, 200) : String(err);
    console.error("[ingest] pdf-parse failed:", err);
    throw new Error(`PDF parse failed: ${detail} / Không đọc được PDF: ${detail}`);
  }
  if (!result.pages?.length) return sanitizeTextForDb(removeSiteChrome(result.text || ""));
  const { text, removed } = removeHeadersFooters(result.pages.map((p) => p.text));
  if (removed.length) {
    console.info(
      `[ingest] removed ${removed.length} header/footer line(s):`,
      removed.slice(0, 20),
    );
  }
  return sanitizeTextForDb(removeSiteChrome(text));
}

function toMarkdown(text: string, title: string): string {
  const cleaned = sanitizeTextForDb(text)
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const safeTitle = sanitizeTextForDb(title).trim() || "Document";
  return `# ${safeTitle}\n\n${cleaned}`;
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
    assertEmbedConfigured();
    // Optional demo delay so UI can show pending/processing state (screenshots / UX QA)
    const slowMs = Number(process.env.DEMO_SLOW_INGEST_MS || "0");
    if (Number.isFinite(slowMs) && slowMs > 0) {
      await new Promise((r) => setTimeout(r, slowMs));
    }
    let markdown: string;
    if (doc.mimeType === "text/markdown" && doc.markdown?.trim()) {
      // Seeded markdown documents have no file on disk (storagePath "seed://...").
      markdown = doc.markdown;
    } else {
      const fs = await import("fs/promises");
      const buffer = await fs.readFile(doc.storagePath);
      const text = await extractPdfText(buffer);
      if (!text.trim()) {
        throw new Error(
          "Could not extract text from PDF / Không trích xuất được chữ từ PDF",
        );
      }
      markdown = toMarkdown(text, doc.title);
    }
    const rawChunks = chunkMarkdown(markdown, env.CHUNK_SIZE, env.CHUNK_OVERLAP)
      .map((c) => sanitizeTextForDb(c).trim())
      .filter((c) => c.length > 0);
    if (!rawChunks.length) {
      throw new Error("No chunks produced from document / Không tạo được chunk");
    }

    await prisma.documentChunk.deleteMany({ where: { documentId } });

    let saved = 0;
    let skipped = 0;
    let consecutiveFailures = 0;
    const skipReasons: string[] = [];
    const startedAt = Date.now();

    const skip = (index: number, err: unknown) => {
      skipped += 1;
      consecutiveFailures += 1;
      const reason = err instanceof Error ? err.message.slice(0, 160) : "unknown error";
      skipReasons.push(`#${index}: ${reason}`);
      console.warn(`[ingest] skip chunk ${index} of document ${documentId}:`, reason);
      if (consecutiveFailures >= MAX_CONSECUTIVE_CHUNK_FAILURES) {
        throw new Error(
          `Stopped after ${consecutiveFailures} consecutive chunk failures (saved ${saved}/${rawChunks.length}). Last: ${reason} / Dừng sau ${consecutiveFailures} chunk lỗi liên tiếp — kiểm tra server embedding rồi Reindex`,
        );
      }
    };

    for (let start = 0; start < rawChunks.length; start += env.EMBED_BATCH_SIZE) {
      const batch = rawChunks.slice(start, start + env.EMBED_BATCH_SIZE);

      let rows: Array<{ index: number; content: string; embedding: number[] }>;
      try {
        const vectors = await embedTexts(batch);
        rows = batch.map((content, j) => ({ index: start + j, content, embedding: vectors[j]! }));
      } catch (batchErr) {
        // Retry one by one so a single bad chunk does not drop the whole batch.
        console.warn(
          `[ingest] batch ${start}-${start + batch.length - 1} failed, retrying per chunk:`,
          batchErr instanceof Error ? batchErr.message.slice(0, 160) : batchErr,
        );
        rows = [];
        for (let j = 0; j < batch.length; j++) {
          try {
            const [embedding] = await embedTexts([batch[j]!]);
            rows.push({ index: start + j, content: batch[j]!, embedding: embedding! });
            consecutiveFailures = 0;
          } catch (chunkErr) {
            skip(start + j, chunkErr);
          }
        }
      }
      if (!rows.length) continue;

      try {
        await insertChunks(documentId, rows, saved);
        saved += rows.length;
        consecutiveFailures = 0;
      } catch (dbErr) {
        for (const r of rows) skip(r.index, dbErr);
      }
    }

    console.info(
      `[ingest] document ${documentId}: saved ${saved}/${rawChunks.length} chunk(s) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    );

    if (saved === 0) {
      throw new Error(
        `All ${rawChunks.length} chunks failed (embed/create). Last: ${skipReasons.at(-1) || "n/a"} / Tất cả chunk thất bại`,
      );
    }

    const softWarning =
      skipped > 0
        ? `Skipped ${skipped}/${rawChunks.length} bad chunk(s); saved ${saved}. / Đã bỏ ${skipped} chunk lỗi; lưu ${saved}.`
        : null;

    await prisma.document.updateMany({
      where: { id: documentId },
      data: {
        markdown,
        status: "ready",
        // Soft warning only — document is still usable
        errorMessage: softWarning,
      },
    });
  } catch (err) {
    const message = isAppError(err)
      ? `${err.messageEn} / ${err.messageVi}`
      : err instanceof Error
        ? err.message
        : "Ingest failed / Ingest thất bại";
    // updateMany: the document may have been deleted while ingest was running.
    await prisma.document.updateMany({
      where: { id: documentId },
      data: { status: "failed", errorMessage: message.slice(0, 1000) },
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
  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
  const storagePath = path.join(uploadDir, filename);
  const buf = Buffer.from(await opts.file.arrayBuffer());
  await writeFile(storagePath, buf);

  const doc = await prisma.document.create({
    data: {
      title: sanitizeTextForDb(opts.title).trim() || safeName,
      filename: safeName,
      mimeType: "application/pdf",
      storagePath,
      visibility: opts.visibility,
      status: "pending",
      uploadedById: opts.uploadedById,
    },
  });

  enqueueDocument(doc.id);
  return doc.id;
}

export async function deleteDocumentFiles(storagePath: string) {
  try {
    await unlink(storagePath);
  } catch {
    // ignore missing file
  }
}
