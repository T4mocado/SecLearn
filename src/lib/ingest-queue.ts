import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";

type QueueState = {
  queue: string[];
  /** Ids that are queued or running — a document is never processed twice at once. */
  active: Set<string>;
  workers: number;
  recovered: boolean;
};

// Stored on globalThis so dev hot-reload does not spawn extra workers.
const g = globalThis as typeof globalThis & { __seclearnIngestQueue?: QueueState };
const state: QueueState = (g.__seclearnIngestQueue ??= {
  queue: [],
  active: new Set(),
  workers: 0,
  recovered: false,
});

async function worker(): Promise<void> {
  state.workers += 1;
  try {
    while (state.queue.length) {
      const id = state.queue.shift()!;
      try {
        const { processDocument } = await import("@/lib/ingest");
        await processDocument(id);
      } catch (err) {
        console.error(`[ingest-queue] document ${id} crashed:`, err);
      } finally {
        state.active.delete(id);
      }
    }
  } finally {
    state.workers -= 1;
  }
}

function startWorkers(): void {
  const limit = getEnv().INGEST_CONCURRENCY;
  while (state.workers < limit && state.workers < state.queue.length) {
    void worker();
  }
}

/** Queue a document for ingest. Returns false when it is already queued or running. */
export function enqueueDocument(id: string): boolean {
  if (state.active.has(id)) return false;
  state.active.add(id);
  state.queue.push(id);
  startWorkers();
  return true;
}

export function isDocumentQueued(id: string): boolean {
  return state.active.has(id);
}

/** Re-queue documents left `pending` by a previous server process (restart mid-ingest). */
export async function recoverPendingDocuments(): Promise<void> {
  if (state.recovered) return;
  state.recovered = true;
  const pending = await prisma.document.findMany({
    where: { status: "pending" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  for (const d of pending) enqueueDocument(d.id);
  if (pending.length) {
    console.info(`[ingest-queue] re-queued ${pending.length} pending document(s)`);
  }
}
