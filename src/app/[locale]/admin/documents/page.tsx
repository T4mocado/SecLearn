"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Doc = {
  id: string;
  title: string;
  filename: string;
  visibility: string;
  status: string;
  errorMessage: string | null;
  chunkCount: number;
};

export default function AdminDocumentsPage() {
  const t = useTranslations("admin");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"public" | "authenticated">("public");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/admin/documents");
    if (!res.ok) {
      setError("error");
      return;
    }
    const data = (await res.json()) as { documents: Doc[] };
    setDocs(data.documents);
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, []);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    form.set("title", title || file.name);
    form.set("visibility", visibility);
    const res = await fetch("/api/admin/documents", { method: "POST", body: form });
    setUploading(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error || "Upload failed");
      return;
    }
    setTitle("");
    setFile(null);
    await load();
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <h1 className="text-2xl font-semibold text-[var(--accent)]">{t("documents")}</h1>
      <Card className="space-y-3">
        <form className="space-y-3" onSubmit={upload}>
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Intro passwords" />
          </div>
          <div className="space-y-1">
            <Label>{t("visibility")}</Label>
            <select
              className="h-10 w-full rounded-xl border border-[var(--border)] px-3 text-sm"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "public" | "authenticated")}
            >
              <option value="public">public</option>
              <option value="authenticated">authenticated</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>PDF</Label>
            <Input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <Button disabled={uploading || !file}>{uploading ? "..." : t("upload")}</Button>
        </form>
      </Card>
      <div className="space-y-2">
        {docs.map((d) => (
          <Card key={d.id} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {d.filename} · {t("visibility")}: {d.visibility} · {t("status")}: {d.status} · chunks:{" "}
                  {d.chunkCount}
                </div>
                {d.errorMessage && <div className="text-xs text-[var(--danger)]">{d.errorMessage}</div>}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void fetch(`/api/admin/documents/${d.id}/reindex`, { method: "POST" }).then(load)}
                >
                  {t("reindex")}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void fetch(`/api/admin/documents/${d.id}`, { method: "DELETE" }).then(load)}
                >
                  {t("delete")}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
