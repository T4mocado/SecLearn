/**
 * Re-ingest every document (re-parse PDF, re-chunk, re-embed).
 * Usage: npm run db:reindex            (all documents)
 *        npm run db:reindex -- --pending   (only documents stuck in `pending`)
 * Stop `npm run dev` first so its boot recovery does not process the same documents in parallel.
 * The embed server (python scripts/embed_server.py) must be running.
 */
import { prisma } from "../src/lib/prisma";
import { getEnv } from "../src/lib/env";
import { processDocument } from "../src/lib/ingest";

async function main() {
  const onlyPending = process.argv.includes("--pending");
  const docs = await prisma.document.findMany({
    where: onlyPending ? { status: "pending" } : undefined,
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" },
  });
  const concurrency = getEnv().INGEST_CONCURRENCY;
  console.log(`Reindexing ${docs.length} document(s), ${concurrency} at a time...`);

  const startedAt = Date.now();
  let next = 0;
  let done = 0;
  const failed: string[] = [];

  const worker = async () => {
    while (next < docs.length) {
      const doc = docs[next++]!;
      const t = Date.now();
      await processDocument(doc.id);
      const after = await prisma.document.findUnique({
        where: { id: doc.id },
        select: { status: true, errorMessage: true, _count: { select: { chunks: true } } },
      });
      done += 1;
      const secs = ((Date.now() - t) / 1000).toFixed(1);
      console.log(
        `[${done}/${docs.length}] ${after?.status} ${after?._count.chunks ?? 0} chunks ${secs}s — ${doc.title}`,
      );
      if (after?.status !== "ready") failed.push(`${doc.title}: ${after?.errorMessage ?? "unknown"}`);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, docs.length) }, worker));

  console.log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s. Failed: ${failed.length}`);
  for (const f of failed) console.log(`  - ${f}`);
  await prisma.$disconnect();
}

void main();
