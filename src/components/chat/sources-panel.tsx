"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CircleCheck, FileText, TriangleAlert, X } from "lucide-react";
import {
  citationClaims,
  citedIndexes,
  claimsBySource,
  isSupported,
  orderSources,
  SUPPORT_THRESHOLD,
  supportScore,
  truncateClaim,
  type MessageSource,
} from "@/lib/sources";
import { cn } from "@/lib/utils";

const CITATION_SPLIT_RE = /(\[\d{1,2}\])/g;

/**
 * Renders message text with valid `[n]` markers as buttons that open source n.
 * A marker whose clause the citation check found unsupported is shown in the warning colour.
 */
export function MessageContent({
  content,
  sources,
  onCite,
}: {
  content: string;
  sources?: MessageSource[] | null;
  onCite: (index: number) => void;
}) {
  const t = useTranslations("chat");
  const count = sources?.length ?? 0;
  if (!count) return <>{content}</>;
  const checked = sources!.some((s) => s.support);
  const claimAt = new Map(checked ? citationClaims(content, count).map((c) => [c.at, c.claim]) : []);
  // Start offset of each piece, to match a marker with its claim from citationClaims.
  const pieces: Array<{ part: string; at: number }> = [];
  let at = 0;
  for (const part of content.split(CITATION_SPLIT_RE)) {
    pieces.push({ part, at });
    at += part.length;
  }
  return (
    <>
      {pieces.map(({ part, at }, i) => {
        const n = /^\[(\d{1,2})\]$/.exec(part)?.[1];
        const index = n ? Number(n) : 0;
        if (index < 1 || index > count) return part;
        const claim = claimAt.get(at);
        const score = claim === undefined ? undefined : supportScore(sources!.find((s) => s.index === index), claim);
        const unsupported = score !== undefined && !isSupported(score);
        return (
          <button
            key={i}
            type="button"
            title={unsupported ? t("verifyUnsupported") : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onCite(index);
            }}
            className={cn(
              "mx-0.5 inline-flex h-4 min-w-4 -translate-y-0.5 items-center justify-center rounded px-1 align-middle text-[10px] font-semibold hover:text-white",
              unsupported
                ? "bg-amber-100 text-amber-700 ring-1 ring-amber-400 hover:bg-amber-600 dark:bg-amber-950 dark:text-amber-300"
                : "bg-[var(--chat-user)] text-[var(--accent)] hover:bg-[var(--accent)]",
            )}
          >
            {index}
          </button>
        );
      })}
    </>
  );
}

export function SourcesPanel({
  content,
  sources,
  focusIndex,
  streaming,
  onClose,
}: {
  content: string;
  sources: MessageSource[] | null | undefined;
  focusIndex: number | null;
  streaming: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("chat");
  const listRef = useRef<HTMLDivElement>(null);
  const cited = sources ? citedIndexes(content, sources.length) : new Set<number>();
  const ordered = orderSources(sources ?? [], cited);
  const claims = streaming || !sources ? new Map<number, string[]>() : claimsBySource(citationClaims(content, sources.length));
  const checks = [...claims].flatMap(([index, list]) =>
    list.flatMap((claim) => {
      const score = supportScore(sources?.find((s) => s.index === index), claim);
      return score === undefined ? [] : [score];
    }),
  );

  const renderCard = (s: MessageSource, isCited: boolean) => {
    const usedIn = claims.get(s.index);
    return (
      <div
        key={s.index}
        data-source-index={s.index}
        className={cn(
          "rounded-xl border bg-[var(--bg)] p-3 text-sm transition",
          focusIndex === s.index
            ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
            : "border-[var(--border)]",
          !isCited && !streaming && "opacity-60",
        )}
      >
        <div className="mb-2 flex items-start gap-2">
          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-[var(--chat-user)] px-1 text-xs font-semibold text-[var(--accent)]">
            {s.index}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 font-medium">
              <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              <span className="truncate" title={s.documentTitle}>
                {s.documentTitle}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-[var(--text-muted)]">
              <span>{t("sourcesChunk", { n: s.chunkIndex + 1 })}</span>
              {s.rerankScore !== undefined && (
                <span className="font-medium text-[var(--text)]">
                  {t("sourcesRelevance", { pct: Math.round(s.rerankScore * 100) })}
                </span>
              )}
              <span>
                {s.method === "vector"
                  ? t("sourcesSimilarity", { score: s.score.toFixed(3) })
                  : t("sourcesKeyword", { score: s.score })}
              </span>
            </div>
          </div>
        </div>
        {usedIn && usedIn.length > 0 && (
          <div className="mb-2 rounded-lg border-l-2 border-[var(--accent)] bg-[var(--chat-user)]/50 px-2 py-1.5 text-xs">
            <div className="mb-0.5 font-medium text-[var(--accent)]">{t("sourcesUsedIn")}</div>
            <ul className="space-y-0.5 text-[var(--text)]">
              {usedIn.map((claim) => {
                const score = supportScore(s, claim);
                const ok = score !== undefined && isSupported(score);
                return (
                  <li key={claim} className="flex items-start gap-1">
                    {score !== undefined &&
                      (ok ? (
                        <CircleCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                      ) : (
                        <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                      ))}
                    <span>
                      “{truncateClaim(claim)}”
                      {score !== undefined && (
                        // The raw score is uncalibrated (backed clauses can score 6%), so only the label is shown.
                        <span
                          title={t("verifyScore", { score: score.toFixed(3), threshold: SUPPORT_THRESHOLD })}
                          className={cn(
                            "ml-1 whitespace-nowrap",
                            ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
                          )}
                        >
                          {ok ? t("verifySupported") : t("verifyUnsupported")}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="prose-chat text-[13px] text-[var(--text)]">{s.content}</div>
      </div>
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (!focusIndex) {
      list.scrollTo({ top: 0 });
      return;
    }
    list
      .querySelector(`[data-source-index="${focusIndex}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusIndex, sources]);

  return (
    <>
      <button
        type="button"
        aria-label={t("sourcesClose")}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/30 xl:hidden"
      />
      <aside
        aria-label={t("sourcesTitle")}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-xl xl:sticky xl:top-0 xl:z-auto xl:h-screen xl:w-96 xl:max-w-none xl:shrink-0 xl:shadow-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t("sourcesTitle")}</h2>
            {sources && sources.length > 0 && (
              <p className="text-xs text-[var(--text-muted)]">
                {streaming
                  ? t("sourcesStreaming")
                  : t("sourcesSummary", { cited: cited.size, total: sources.length })}
              </p>
            )}
            {!streaming && checks.length > 0 && (
              <p className="text-xs text-[var(--text-muted)]">
                {t("verifySummary", { supported: checks.filter(isSupported).length, total: checks.length })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("sourcesClose")}
            className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--sidebar)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {!sources ? (
            <p className="text-sm text-[var(--text-muted)]">{t("sourcesUnavailable")}</p>
          ) : sources.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t("sourcesEmpty")}</p>
          ) : streaming ? (
            // Citations change with every token; keep retrieval order until the answer is done.
            <div className="space-y-3">{sources.map((s) => renderCard(s, false))}</div>
          ) : (
            <>
              {ordered.cited.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                    {t("sourcesCited")} ({ordered.cited.length})
                  </h3>
                  {ordered.cited.map((s) => renderCard(s, true))}
                </section>
              )}
              {ordered.unused.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {t("sourcesNotCited")} ({ordered.unused.length})
                  </h3>
                  {ordered.unused.map((s) => renderCard(s, false))}
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
