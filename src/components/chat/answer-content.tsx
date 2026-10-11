"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { CircleCheck, FileText, TriangleAlert } from "lucide-react";
import { chunkExcerpt } from "@/lib/chunk-excerpt";
import { parseMarkdown, type InlineNode } from "@/lib/markdown";
import { citationClaims, isSupported, supportScore, type CitationClaim, type MessageSource } from "@/lib/sources";
import { cn } from "@/lib/utils";

/** A hoverable clause: raw answer offsets plus every source it cites ("A [1][2]" is one region). */
type Region = { id: number; start: number; end: number; claim: string; indexes: number[] };

type Hover = { region: number; top: number; left: number; width: number; maxHeight: number; above: boolean };

const POPOVER_WIDTH = 360;
/** Below the clause unless there is less room than this there and more room above. */
const POPOVER_MIN_ROOM = 220;
const VIEWPORT_MARGIN = 8;
const CLOSE_DELAY_MS = 150;

function buildRegions(claims: CitationClaim[]): Region[] {
  const byStart = new Map<number, Region>();
  for (const c of claims) {
    const region = byStart.get(c.start);
    if (!region) {
      byStart.set(c.start, { id: byStart.size, start: c.start, end: c.at, claim: c.claim, indexes: [c.index] });
    } else if (!region.indexes.includes(c.index)) {
      region.indexes.push(c.index);
    }
  }
  // Spans start after the previous marker, so regions never overlap; skip empty ones ("[1] at line start").
  return [...byStart.values()].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
}

/**
 * Renders an assistant answer as Markdown with `[n]` citation buttons. When `interactive`, hovering a cited
 * clause shows the matching part of its chunk; everything comes from data already on the client (no requests).
 */
export function AnswerContent({
  content,
  sources,
  interactive,
  onCite,
}: {
  content: string;
  sources?: MessageSource[] | null;
  /** False while streaming: clause offsets still move with every token. */
  interactive: boolean;
  onCite: (index: number) => void;
}) {
  const t = useTranslations("chat");
  const count = sources?.length ?? 0;
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  const claims = useMemo(() => (count ? citationClaims(content, count) : []), [content, count]);
  const regions = useMemo(() => (interactive ? buildRegions(claims) : []), [claims, interactive]);
  const claimAt = useMemo(() => new Map(claims.map((c) => [c.at, c.claim])), [claims]);
  const [hover, setHover] = useState<Hover | null>(null);
  const closeTimer = useRef<number | null>(null);

  const source = (index: number) => sources?.find((s) => s.index === index);
  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setHover(null), CLOSE_DELAY_MS);
  };
  const open = (region: number, el: HTMLElement) => {
    cancelClose();
    const rect = el.getBoundingClientRect();
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - 2 * VIEWPORT_MARGIN);
    // Pick the side with room and cap the height to it, so the popover never runs off-screen.
    const below = window.innerHeight - rect.bottom - VIEWPORT_MARGIN - 6;
    const aboveRoom = rect.top - VIEWPORT_MARGIN - 6;
    const above = below < POPOVER_MIN_ROOM && aboveRoom > below;
    setHover({
      region,
      width,
      above,
      maxHeight: Math.max(120, above ? aboveRoom : below),
      left: Math.min(Math.max(VIEWPORT_MARGIN, rect.left), window.innerWidth - width - VIEWPORT_MARGIN),
      top: above ? rect.top - 6 : rect.bottom + 6,
    });
  };

  // A fixed popover would drift away from its clause, so close it on any scroll.
  useEffect(() => {
    if (!hover) return;
    const close = () => setHover(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [hover]);
  useEffect(() => cancelClose, []);

  const renderText = (start: number, end: number, key: string): ReactNode[] => {
    const out: ReactNode[] = [];
    let pos = start;
    for (const r of regions) {
      if (r.end <= pos || r.start >= end) continue;
      if (r.start > pos) out.push(content.slice(pos, r.start));
      const to = Math.min(r.end, end);
      out.push(
        <span
          key={`${key}.r${r.id}`}
          // Empty title stops the bubble's "view sources" tooltip from covering the popover.
          title=""
          onPointerEnter={(e) => e.pointerType === "mouse" && open(r.id, e.currentTarget)}
          onPointerLeave={(e) => e.pointerType === "mouse" && scheduleClose()}
          className={cn(
            "cursor-help rounded-sm underline decoration-[var(--accent)]/40 decoration-dotted underline-offset-4 transition-colors",
            hover?.region === r.id && "bg-[var(--accent)]/10 decoration-[var(--accent)]",
          )}
        >
          {content.slice(Math.max(r.start, pos), to)}
        </span>,
      );
      pos = to;
    }
    if (pos < end) out.push(content.slice(pos, end));
    return out;
  };

  const renderCite = (n: Extract<InlineNode, { type: "cite" }>, key: string) => {
    if (n.index < 1 || n.index > count) return <Fragment key={key}>{content.slice(n.start, n.end)}</Fragment>;
    const claim = claimAt.get(n.start);
    const score = claim === undefined ? undefined : supportScore(source(n.index), claim);
    const unsupported = score !== undefined && !isSupported(score);
    return (
      <button
        key={key}
        type="button"
        title={unsupported ? t("verifyUnsupported") : undefined}
        onClick={(e) => {
          e.stopPropagation();
          onCite(n.index);
        }}
        className={cn(
          "mx-0.5 inline-flex h-4 min-w-4 -translate-y-0.5 items-center justify-center rounded px-1 align-middle text-[10px] font-semibold hover:text-white",
          unsupported
            ? "bg-amber-100 text-amber-700 ring-1 ring-amber-400 hover:bg-amber-600 dark:bg-amber-950 dark:text-amber-300"
            : "bg-[var(--chat-user)] text-[var(--accent)] hover:bg-[var(--accent)]",
        )}
      >
        {n.index}
      </button>
    );
  };

  const renderInline = (nodes: InlineNode[], key: string): ReactNode[] =>
    nodes.map((n, i) => {
      const k = `${key}.${i}`;
      switch (n.type) {
        case "text":
          return <Fragment key={k}>{renderText(n.start, n.end, k)}</Fragment>;
        case "code":
          return <code key={k}>{renderText(n.start, n.end, k)}</code>;
        case "strong":
          return <strong key={k}>{renderInline(n.children, k)}</strong>;
        case "em":
          return <em key={k}>{renderInline(n.children, k)}</em>;
        case "cite":
          return renderCite(n, k);
      }
    });

  const active = hover ? regions.find((r) => r.id === hover.region) : undefined;

  return (
    <>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.type) {
          case "p":
            return (
              <p key={key}>
                {b.lines.map((line, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {renderInline(line, `${key}.${j}`)}
                  </Fragment>
                ))}
              </p>
            );
          case "h": {
            const Tag = b.level <= 2 ? "h3" : "h4";
            return <Tag key={key}>{renderInline(b.children, key)}</Tag>;
          }
          case "ul":
          case "ol": {
            const List = b.type;
            return (
              <List key={key}>
                {b.items.map((item, j) => (
                  <li key={j} className={cn(item.indent >= 2 && "ml-5")}>
                    {renderInline(item.children, `${key}.${j}`)}
                  </li>
                ))}
              </List>
            );
          }
          case "code":
            return (
              <pre key={key}>
                <code>{b.text}</code>
              </pre>
            );
        }
      })}

      {hover &&
        active &&
        createPortal(
          <div
            role="tooltip"
            onClick={(e) => e.stopPropagation()}
            onPointerEnter={cancelClose}
            onPointerLeave={scheduleClose}
            style={{
              top: hover.top,
              left: hover.left,
              width: hover.width,
              maxHeight: hover.maxHeight,
              transform: hover.above ? "translateY(-100%)" : undefined,
            }}
            className="fixed z-[60] space-y-3 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs shadow-xl"
          >
            {active.indexes.map((index) => {
              const s = source(index);
              if (!s) return null;
              const excerpt = chunkExcerpt(s.content, active.claim);
              const score = supportScore(s, active.claim);
              const ok = score !== undefined && isSupported(score);
              return (
                <div key={index} className="space-y-1.5 [&+&]:border-t [&+&]:border-[var(--border)] [&+&]:pt-3">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-[var(--chat-user)] px-1 text-[10px] font-semibold text-[var(--accent)]">
                      {index}
                    </span>
                    <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                    <span className="truncate font-medium" title={s.documentTitle}>
                      {s.documentTitle}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-2 text-[var(--text-muted)]">
                    <span>{t("sourcesChunk", { n: s.chunkIndex + 1 })}</span>
                    {s.rerankScore !== undefined && (
                      <span>{t("sourcesRelevance", { pct: Math.round(s.rerankScore * 100) })}</span>
                    )}
                    {score !== undefined && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5",
                          ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
                        )}
                      >
                        {ok ? (
                          <CircleCheck className="h-3 w-3" aria-hidden />
                        ) : (
                          <TriangleAlert className="h-3 w-3" aria-hidden />
                        )}
                        {ok ? t("verifySupported") : t("verifyUnsupported")}
                      </span>
                    )}
                  </div>
                  <p className="leading-relaxed text-[var(--text-muted)]">
                    {excerpt.before}
                    {excerpt.match && (
                      <mark className="rounded bg-amber-100 px-0.5 text-[var(--text)] dark:bg-amber-900/50">
                        {excerpt.match}
                      </mark>
                    )}
                    {excerpt.after}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setHover(null);
                      onCite(index);
                    }}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    {t("hoverViewFull")}
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
