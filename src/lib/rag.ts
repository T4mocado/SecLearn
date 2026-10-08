import { prisma } from "@/lib/prisma";
import { embedText, vectorLiteral } from "@/lib/embed";
import { getEnv } from "@/lib/env";
import type { DocVisibility } from "@prisma/client";

export type RetrievedChunk = {
  id: string;
  content: string;
  documentId: string;
  score: number;
};

export async function retrieveChunks(opts: {
  query: string;
  visibilities: DocVisibility[];
}): Promise<RetrievedChunk[]> {
  const env = getEnv();
  const embedding = await embedText(opts.query);
  const lit = vectorLiteral(embedding);
  const topK = env.RAG_TOP_K;

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; content: string; documentId: string; score: number }>
    >(
      `
      SELECT c.id, c.content, c."documentId",
             (1 - (c.embedding <=> $1::vector))::float8 AS score
      FROM "DocumentChunk" c
      INNER JOIN "Document" d ON d.id = c."documentId"
      WHERE d.status = 'ready'
        AND d.visibility::text = ANY($2::text[])
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT $3
      `,
      lit,
      opts.visibilities,
      topK,
    );
    return rows;
  } catch {
    // Fallback: keyword-ish retrieve without vector if extension/query fails
    const docs = await prisma.document.findMany({
      where: {
        status: "ready",
        visibility: { in: opts.visibilities },
      },
      include: { chunks: { take: 3, orderBy: { chunkIndex: "asc" } } },
      take: 5,
    });
    const q = opts.query.toLowerCase();
    const scored: RetrievedChunk[] = [];
    for (const d of docs) {
      for (const c of d.chunks) {
        const hay = c.content.toLowerCase();
        const score = q.split(/\s+/).filter((w) => w.length > 2 && hay.includes(w)).length;
        scored.push({ id: c.id, content: c.content, documentId: d.id, score });
      }
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

export function formatContext(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return "";
  return chunks
    .map((c, i) => `[${i + 1}] (score=${c.score.toFixed(3)})\n${c.content}`)
    .join("\n\n");
}

export function chunkMarkdown(markdown: string, size: number, overlap: number): string[] {
  const text = markdown.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + size);
    let slice = text.slice(i, end);
    if (end < text.length) {
      const lastBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
      if (lastBreak > size * 0.4) {
        slice = slice.slice(0, lastBreak);
      }
    }
    const cleaned = slice.trim();
    if (cleaned) chunks.push(cleaned);
    if (end >= text.length) break;
    i += Math.max(1, cleaned.length - overlap);
  }
  return chunks;
}
