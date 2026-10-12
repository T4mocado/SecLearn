"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink, FileUp, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type DocStatus = "pending" | "ready" | "failed";

const MAX_FILES = 20;

type Doc = {
  id: string;
  title: string;
  filename: string;
  visibility: "public" | "authenticated" | string;
  status: DocStatus | string;
  errorMessage: string | null;
  chunkCount: number;
  createdAt?: string;
};

function statusTone(status: string) {
  if (status === "ready")
    return "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
  if (status === "failed")
    return "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900";
  return "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
}

export default function AdminDocumentsPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"public" | "authenticated">("public");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const knownStatus = useRef<Map<string, string>>(new Map());
  const trackedUploadIds = useRef<Set<string>>(new Set());
  const [trackingCount, setTrackingCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trackDoc = (id: string) => {
    trackedUploadIds.current.add(id);
    setTrackingCount(trackedUploadIds.current.size);
  };

  const untrackDoc = (id: string) => {
    trackedUploadIds.current.delete(id);
    setTrackingCount(trackedUploadIds.current.size);
  };

  const friendlyError = useCallback(
    (body: { error?: string; messageVi?: string; messageEn?: string } | null) => {
      if (!body) return t("uploadError");
      if (locale === "vi") return body.messageVi || body.messageEn || body.error || t("uploadError");
      return body.messageEn || body.messageVi || body.error || t("uploadError");
    },
    [locale, t],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/documents");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          messageVi?: string;
          messageEn?: string;
        } | null;
        setListError(friendlyError(body));
        return;
      }
      const data = (await res.json()) as { documents: Doc[] };
      setListError(null);
      setDocs(data.documents);

      for (const doc of data.documents) {
        const prev = knownStatus.current.get(doc.id);
        knownStatus.current.set(doc.id, doc.status);

        if (!trackedUploadIds.current.has(doc.id)) continue;
        if (doc.status === "ready" && prev && prev !== "ready") {
          if (doc.errorMessage) {
            toast.success(`${t("toastReady", { title: doc.title })} — ${doc.errorMessage}`);
          } else {
            toast.success(t("toastReady", { title: doc.title }));
          }
          untrackDoc(doc.id);
        } else if (doc.status === "failed" && prev && prev !== "failed") {
          toast.error(doc.errorMessage || t("toastFailed", { title: doc.title }));
          untrackDoc(doc.id);
        }
      }
    } catch {
      setListError(t("listError"));
    } finally {
      setLoading(false);
    }
  }, [friendlyError, t]);

  const hasPending = useMemo(
    () => docs.some((d) => d.status === "pending") || trackingCount > 0,
    [docs, trackingCount],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => void load(), 1500);
    return () => clearInterval(timer);
  }, [hasPending, load]);

  useEffect(() => {
    // Slower background refresh when idle so list stays fresh after other tabs
    if (hasPending) return;
    const timer = setInterval(() => void load(), 12000);
    return () => clearInterval(timer);
  }, [hasPending, load]);

  const selectFiles = (list: FileList | null) => {
    setFormError(null);
    const picked = Array.from(list ?? []);
    const pdfs = picked.filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfs.length < picked.length) setFormError(t("onlyPdfSkipped"));
    if (pdfs.length > MAX_FILES) {
      setFormError(t("tooManyFiles", { max: MAX_FILES }));
      setFiles(pdfs.slice(0, MAX_FILES));
      return;
    }
    setFiles(pdfs);
  };

  const uploadOne = async (file: File, docTitle: string): Promise<string | null> => {
    const form = new FormData();
    form.set("file", file);
    form.set("title", docTitle);
    form.set("visibility", visibility);
    try {
      const res = await fetch("/api/admin/documents", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as {
        document?: { id: string; title?: string };
        error?: string;
        messageVi?: string;
        messageEn?: string;
      } | null;
      if (!res.ok) return `${file.name}: ${friendlyError(body)}`;
      const id = body?.document?.id;
      if (id) {
        knownStatus.current.set(id, "pending");
        trackDoc(id);
      }
      return null;
    } catch {
      return `${file.name}: ${t("uploadError")}`;
    }
  };

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length || uploading) return;
    setUploading(true);
    setFormError(null);
    const batch = [...files];
    const errors: string[] = [];
    try {
      // Sequential: one request per file keeps bodies small and isolates failures per file.
      for (let i = 0; i < batch.length; i++) {
        const file = batch[i]!;
        setProgress({ done: i, total: batch.length });
        const fallbackTitle = file.name.replace(/\.pdf$/i, "");
        const docTitle = batch.length === 1 && title.trim() ? title.trim() : fallbackTitle;
        const err = await uploadOne(file, docTitle);
        if (err) errors.push(err);
      }
      const ok = batch.length - errors.length;
      if (ok > 0) toast.message(t("uploadSummary", { ok, total: batch.length }));
      if (errors.length) {
        setFormError(errors.join("\n"));
        toast.error(t("uploadSomeFailed", { count: errors.length }));
      }
      setTitle("");
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } finally {
      setProgress(null);
      setUploading(false);
    }
  };

  const reindex = async (id: string, docTitle: string) => {
    setBusyId(id);
    trackDoc(id);
    knownStatus.current.set(id, "pending");
    try {
      const res = await fetch(`/api/admin/documents/${id}/reindex`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          messageVi?: string;
          messageEn?: string;
        } | null;
        toast.error(friendlyError(body));
        untrackDoc(id);
        return;
      }
      toast.message(t("toastProcessing", { title: docTitle }));
      await load();
    } catch {
      toast.error(t("uploadError"));
      untrackDoc(id);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(t("deleteError"));
        return;
      }
      knownStatus.current.delete(id);
      untrackDoc(id);
      toast.success(t("toastDeleted"));
      await load();
    } catch {
      toast.error(t("deleteError"));
    } finally {
      setBusyId(null);
    }
  };

  const updateVisibility = async (id: string, next: "public" | "authenticated") => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      if (!res.ok) {
        toast.error(t("visibilityError"));
        return;
      }
      await load();
    } catch {
      toast.error(t("visibilityError"));
    } finally {
      setBusyId(null);
    }
  };

  const statusLabel = (status: string) => {
    if (status === "ready") return t("statusReady");
    if (status === "failed") return t("statusFailed");
    return t("statusProcessing");
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--accent)]">{t("documents")}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t("ingestHint")}</p>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
          <FileUp className="h-4 w-4 text-[var(--accent)]" />
          {t("upload")}
        </div>
        <form className="space-y-3" onSubmit={upload}>
          <div className="space-y-1">
            <Label htmlFor="doc-title">{t("titleLabel")}</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              disabled={files.length > 1}
            />
            {files.length > 1 ? (
              <p className="text-xs text-[var(--text-muted)]">{t("titleMultiHint")}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="doc-visibility">{t("visibility")}</Label>
            <select
              id="doc-visibility"
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "public" | "authenticated")}
            >
              <option value="public">{t("visibilityPublic")}</option>
              <option value="authenticated">{t("visibilityAuth")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="doc-file">{t("pdfLabel")}</Label>
            <Input
              id="doc-file"
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              disabled={uploading}
              onChange={(e) => selectFiles(e.target.files)}
            />
            {files.length ? (
              <ul className="space-y-0.5 text-xs text-[var(--text-muted)]">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    {f.name} · {(f.size / 1024).toFixed(1)} KB
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {formError && (
            <p className="whitespace-pre-line text-sm text-[var(--danger)]">{formError}</p>
          )}
          <Button disabled={uploading || !files.length} className="min-w-36">
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {progress
                  ? t("uploadProgress", { done: progress.done + 1, total: progress.total })
                  : t("uploading")}
              </>
            ) : (
              t("upload")
            )}
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">{t("listTitle")}</h2>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            {t("refresh")}
          </Button>
        </div>

        {loading && docs.length === 0 ? (
          <Card className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("loadingDocs")}
          </Card>
        ) : null}

        {listError ? (
          <Card className="space-y-2 border-[var(--danger)]/30">
            <p className="text-sm text-[var(--danger)]">{listError}</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              {t("retry")}
            </Button>
          </Card>
        ) : null}

        {!loading && !listError && docs.length === 0 ? (
          <Card className="text-sm text-[var(--text-muted)]">{t("emptyDocs")}</Card>
        ) : null}

        {docs.map((d) => {
          const processing = d.status === "pending";
          return (
            <Card key={d.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/api/admin/documents/${d.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t("openDocument")}
                      className="inline-flex items-center gap-1 font-medium hover:text-[var(--accent)] hover:underline"
                    >
                      {d.title}
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
                    </a>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                        statusTone(d.status),
                      )}
                    >
                      {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {statusLabel(d.status)}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {d.filename} · {t("chunks")}: {d.chunkCount}
                  </div>
                  {processing ? (
                    <div className="flex items-center gap-2 pt-1 text-xs text-amber-800 dark:text-amber-300">
                      <div className="h-1.5 flex-1 max-w-xs overflow-hidden rounded-full bg-amber-100 dark:bg-amber-950">
                        <div className="h-full w-2/3 animate-pulse rounded-full bg-amber-400" />
                      </div>
                      <span>{t("processingHint")}</span>
                    </div>
                  ) : null}
                  {d.status === "failed" && (
                    <div className="text-xs text-[var(--danger)]">{d.errorMessage || t("embedFailed")}</div>
                  )}
                  {d.status === "ready" && d.errorMessage ? (
                    <div className="text-xs text-amber-800 dark:text-amber-300">{d.errorMessage}</div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
                    value={d.visibility === "authenticated" ? "authenticated" : "public"}
                    disabled={busyId === d.id || processing}
                    onChange={(e) =>
                      void updateVisibility(d.id, e.target.value as "public" | "authenticated")
                    }
                    aria-label={t("visibility")}
                  >
                    <option value="public">{t("visibilityPublic")}</option>
                    <option value="authenticated">{t("visibilityAuth")}</option>
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === d.id || processing}
                    onClick={() => void reindex(d.id, d.title)}
                  >
                    {busyId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {t("reindex")}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busyId === d.id}
                    onClick={() => void remove(d.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("delete")}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
