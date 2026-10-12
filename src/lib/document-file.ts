import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";

/** True when `target` resolves to a path inside `dir` (no `..` escape, no other drive). */
export function isInsideDir(dir: string, target: string): boolean {
  const relative = path.relative(path.resolve(dir), path.resolve(target));
  return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * `inline` Content-Disposition with an ASCII fallback name and the real (e.g. Vietnamese) name
 * in `filename*` (RFC 6266), so the browser tab and "Save as" show the document title.
 */
export function inlineDisposition(name: string, fallback: string): string {
  const clean = name.replace(/[\r\n"\\/]/g, " ").replace(/\s+/g, " ").trim() || fallback;
  const ascii = fallback.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

/**
 * Served from the app's own origin, an uploaded file must not be able to run script there, so
 * the browser may not sniff it into HTML. No CSP on PDFs: Chrome's viewer is a plugin that
 * `sandbox` / `object-src` would block, and it runs PDFs outside the page's origin anyway.
 */
export const FILE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, max-age=0, must-revalidate",
} as const;

/** Text documents can't be plugins: lock them down fully. */
export const TEXT_SECURITY_HEADERS = {
  ...FILE_SECURITY_HEADERS,
  "Content-Security-Policy": "default-src 'none'; sandbox",
} as const;

export type StoredDocument = {
  id: string;
  title: string;
  filename: string;
  storagePath: string;
  markdown: string | null;
};

/**
 * The document as an inline response: a streamed PDF, or the Markdown of a seeded document
 * (stored as "seed://...", no file on disk). Null when there is nothing to serve; the caller
 * checks access first.
 */
export async function documentFileResponse(doc: StoredDocument, uploadDir: string): Promise<Response | null> {
  if (doc.storagePath.startsWith("seed://")) {
    if (!doc.markdown) return null;
    return new Response(doc.markdown, {
      headers: {
        ...TEXT_SECURITY_HEADERS,
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": inlineDisposition(`${doc.title}.md`, "document.md"),
      },
    });
  }

  // storagePath comes from the database, but never serve anything outside the upload folder.
  if (!isInsideDir(uploadDir, doc.storagePath)) {
    console.warn("[documents/file] storage path outside UPLOAD_DIR:", doc.id);
    return null;
  }
  let size: number;
  try {
    const info = await stat(doc.storagePath);
    if (!info.isFile()) return null;
    size = info.size;
  } catch {
    return null;
  }

  const body = Readable.toWeb(createReadStream(doc.storagePath)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      ...FILE_SECURITY_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Length": String(size),
      "Content-Disposition": inlineDisposition(`${doc.title.replace(/\.pdf$/i, "")}.pdf`, doc.filename),
    },
  });
}
