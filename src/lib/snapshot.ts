/**
 * Builds the corpus snapshot the eval-set project reads instead of the database (ADR 0004): each
 * document's stored markdown, a manifest with sha256 hashes, and the chunks with their body offsets.
 * Pure: `scripts/export-snapshot.ts` reads the database and writes the files.
 */
import { createHash } from "crypto";
import path from "path";

export type SnapshotDocument = {
  id: string;
  title: string;
  filename: string;
  storagePath: string;
  status: string;
  /** Set when ingest skipped chunks ("Skipped 2/40 bad chunk(s)"). */
  errorMessage: string | null;
  markdown: string | null;
  createdAt: Date;
  /** sha256 of the uploaded file, or null when there is none (seeded markdown). */
  sourceSha256: string | null;
};

export type SnapshotChunk = {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  metadata: unknown;
};

export type SnapshotOptions = {
  snapshotId: string;
  /** YYYY-MM-DD */
  date: string;
  version: string;
  gitCommit: string;
  gitDirty: boolean;
  chunker: { version: string; size: number; overlap: number };
  canary: string;
};

/** Relative path → file content. */
export type SnapshotFiles = Record<string, string>;

export class SnapshotRefused extends Error {
  constructor(readonly problems: string[]) {
    super(`Snapshot refused (${problems.length} problem(s)):\n- ${problems.join("\n- ")}`);
  }
}

const LICENSE = "CC-BY-SA-4.0";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const sha1 = (s: string) => createHash("sha1").update(s, "utf8").digest("hex");

/**
 * Stable document key: the stored file name without the upload prefix ("1791642614658-490fb354-") and
 * extension, so it survives re-uploads. "…/1791642614658-490fb354-wstg-v4.2.pdf" → "wstg-v4.2".
 */
export function docKey(storagePath: string): string {
  const base = path.basename(storagePath.replace(/^seed:\/\//, "").replace(/\\/g, "/"));
  return base.replace(/^\d{10,}-(?:[0-9a-f]{8}-)?/, "").replace(/\.(pdf|md|markdown)$/i, "");
}

/** Where the document is published; null when the key is not a known OWASP layout. */
function sourceUrl(key: string): string | null {
  if (/^wstg-v4\.2$/i.test(key)) return "https://owasp.org/www-project-web-security-testing-guide/v42/";
  if (/_Cheat_Sheet$/.test(key)) return `https://cheatsheetseries.owasp.org/cheatsheets/${key}.html`;
  return null;
}

/** The upload path relative to the app root ("data/uploads/…pdf"), never a machine-specific absolute path. */
function sourceFile(storagePath: string): string {
  const norm = storagePath.replace(/\\/g, "/");
  const at = norm.indexOf("data/uploads/");
  return at >= 0 ? norm.slice(at) : norm;
}

type Offsets = { char_start: number; char_end: number; md_sha256: string; chunker_version: string };

function offsets(metadata: unknown): Offsets | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const ok =
    Number.isInteger(m.char_start) &&
    Number.isInteger(m.char_end) &&
    typeof m.md_sha256 === "string" &&
    typeof m.chunker_version === "string";
  return ok ? (m as unknown as Offsets) : null;
}

/**
 * The snapshot files, or `SnapshotRefused` listing every problem: a document not ready or with skipped
 * chunks, chunks without offsets or from other markdown / chunker rules, gaps in chunk numbering, or
 * offsets outside the markdown. A snapshot of a half-ingested corpus would make every later number wrong.
 */
export function buildSnapshot(documents: SnapshotDocument[], chunks: SnapshotChunk[], opts: SnapshotOptions): SnapshotFiles {
  const problems: string[] = [];
  const byDoc = new Map<string, SnapshotChunk[]>();
  for (const c of chunks) byDoc.set(c.documentId, [...(byDoc.get(c.documentId) ?? []), c]);

  const keys = new Map<string, string>();
  const files: SnapshotFiles = {};
  const manifestDocs: unknown[] = [];
  const chunkLines: string[] = [];

  const sorted = [...documents].sort((a, b) => docKey(a.storagePath).localeCompare(docKey(b.storagePath)));
  for (const doc of sorted) {
    const key = docKey(doc.storagePath);
    const label = `${key} (${doc.id})`;
    if (keys.has(key)) problems.push(`${label}: same document key as ${keys.get(key)}`);
    keys.set(key, doc.id);
    if (doc.status !== "ready") problems.push(`${label}: status is ${doc.status}, not ready`);
    if (doc.errorMessage) problems.push(`${label}: ingest warning: ${doc.errorMessage}`);
    const markdown = doc.markdown ?? "";
    if (!markdown) problems.push(`${label}: no markdown`);
    const mdSha = sha256(markdown);

    const docChunks = [...(byDoc.get(doc.id) ?? [])].sort((a, b) => a.chunkIndex - b.chunkIndex);
    if (!docChunks.length) problems.push(`${label}: no chunks`);
    docChunks.forEach((c, i) => {
      const where = `${label} chunk #${c.chunkIndex}`;
      if (c.chunkIndex !== i) problems.push(`${where}: expected chunk index ${i}`);
      const o = offsets(c.metadata);
      if (!o) return problems.push(`${where}: no offsets in metadata (reindex first)`);
      if (o.md_sha256 !== mdSha) problems.push(`${where}: cut from other markdown (md_sha256 differs)`);
      if (o.chunker_version !== opts.chunker.version) problems.push(`${where}: chunker ${o.chunker_version}, expected ${opts.chunker.version}`);
      if (!(0 <= o.char_start && o.char_start < o.char_end && o.char_end <= markdown.length)) {
        problems.push(`${where}: offsets ${o.char_start}-${o.char_end} outside the markdown (${markdown.length} chars)`);
      }
      chunkLines.push(
        JSON.stringify({
          chunk_key: `${key}#${c.chunkIndex}`,
          doc_key: key,
          chunk_index: c.chunkIndex,
          char_start: o.char_start,
          char_end: o.char_end,
          text: c.content,
          content_sha1: sha1(c.content),
          db_id: c.id,
        }),
      );
    });

    const mdPath = `md/${key}.md`;
    files[mdPath] = markdown;
    manifestDocs.push({
      doc_key: key,
      title: doc.title,
      source_file: sourceFile(doc.storagePath),
      source_sha256: doc.sourceSha256,
      md_path: mdPath,
      md_sha256: mdSha,
      chars: markdown.length,
      chunks: docChunks.length,
      status: doc.status,
      license: LICENSE,
      source_url: sourceUrl(key),
      retrieved: doc.createdAt.toISOString().slice(0, 10),
      db_id: doc.id,
    });
  }
  for (const c of chunks) {
    if (!documents.some((d) => d.id === c.documentId)) problems.push(`chunk ${c.id}: its document ${c.documentId} is not in the export`);
  }
  if (!documents.length) problems.push("no documents");
  if (problems.length) throw new SnapshotRefused(problems);

  const manifest = {
    name: "seclearn-owasp-corpus",
    snapshot_id: opts.snapshotId,
    version: opts.version,
    datePublished: opts.date,
    license: [LICENSE],
    source_git_commit: opts.gitCommit,
    source_git_dirty: opts.gitDirty,
    chunker: { version: opts.chunker.version, CHUNK_SIZE: opts.chunker.size, CHUNK_OVERLAP: opts.chunker.overlap },
    chunks_path: `chunks.${opts.chunker.version}.jsonl`,
    documents: manifestDocs,
    canary: opts.canary,
  };
  files["manifest.json"] = `${JSON.stringify(manifest, null, 2)}\n`;
  files[manifest.chunks_path] = `${chunkLines.join("\n")}\n`;
  return files;
}
