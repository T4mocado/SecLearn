"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations } from "next-intl";
import { CircleCheck, FileText, TriangleAlert } from "lucide-react";
import { VerdictPill } from "@/components/chat/sources-panel";
import { remarkCitations } from "@/lib/remark-citations";
import {
  citationClaims,
  citedClauses,
  isSupported,
  judgeVerdict,
  supportFor,
  supportScore,
  type CitedClause,
  type MessageSource,
} from "@/lib/sources";
import { cn } from "@/lib/utils";

const POPOVER_WIDTH = 420;
const POPOVER_MAX_HEIGHT = 360;
const CLOSE_DELAY_MS = 150;

type Active = { clause: number; rect: DOMRect };

function canHover(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;
}

function clauseOf(target: EventTarget | null): { el: HTMLElement; clause: number } | null {
  const el = (target as Element | null)?.closest?.<HTMLElement>("[data-clause]");
  const clause = Number(el?.dataset.clause);
  return el && Number.isInteger(clause) ? { el, clause } : null;
}

/**
 * Renders an assistant answer as Markdown (raw HTML stays text) with `[n]` markers as buttons
 * that open source n. Hovering a cited clause highlights it and shows the cited chunk with the
 * best-matching sentence marked; everything comes from the message's stored sources, so hovering
 * makes no request and uses no tokens. A marker whose clause the citation check found unsupported
 * is shown in the warning colour.
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
  const scope = useId();
  const [active, setActive] = useState<Active | null>(null);
  const closeTimer = useRef<number | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const count = sources?.length ?? 0;
  const claims = count ? citationClaims(content, count) : [];
  const clauses = count ? citedClauses(content, count) : [];
  const claimAt = new Map(claims.map((c) => [c.at, c.claim]));

  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setActive(null), CLOSE_DELAY_MS);
  };

  useEffect(() => {
    if (!active) return;
    // The popover is fixed-positioned: close it rather than leave it behind when the chat scrolls.
    const close = () => setActive(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [active]);

  useEffect(() => {
    const timer = closeTimer;
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const open = (el: HTMLElement, clause: number) => {
    cancelClose();
    if (active?.clause !== clause) setActive({ clause, rect: el.getBoundingClientRect() });
  };

  const components: Components = {
    span({ node, children, ...rest }) {
      const props = node?.properties ?? {};
      const clause = props.dataClause as number | undefined;
      if (props.dataCite !== undefined) {
        const index = Number(props.dataCite);
        const at = props.dataAt as number | undefined;
        const claim = at === undefined ? undefined : claimAt.get(at);
        const score = claim === undefined ? undefined : supportScore(sources?.find((s) => s.index === index), claim);
        const unsupported = score !== undefined && !isSupported(score);
        return (
          <button
            type="button"
            data-clause={clause}
            title={unsupported ? t("verifyUnsupported") : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onCite(index);
            }}
            onFocus={(e) => clause !== undefined && open(e.currentTarget, clause)}
            onBlur={scheduleClose}
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
      }
      if (clause !== undefined) {
        return (
          <span data-clause={clause} className="cited-clause">
            {children}
          </span>
        );
      }
      return <span {...rest}>{children}</span>;
    },
    a({ children, href, title }) {
      return (
        <a href={href} title={title} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          {children}
        </a>
      );
    },
  };

  const current = active ? clauses[active.clause] : undefined;

  return (
    <div
      data-answer={scope}
      className="chat-markdown"
      onMouseOver={(e) => {
        if (!clauses.length || !canHover()) return;
        const hit = clauseOf(e.target);
        if (hit) open(hit.el, hit.clause);
      }}
      onMouseOut={(e) => {
        if (!active) return;
        // Moving within the popover or the same clause (text piece to its marker) keeps it open.
        if (popoverRef.current?.contains(e.relatedTarget as Node | null)) return;
        if (clauseOf(e.relatedTarget)?.clause !== active.clause) scheduleClose();
      }}
      onClick={(e) => {
        // Tapping or clicking a clause opens its first source in the panel.
        const hit = clauseOf(e.target);
        const first = hit ? clauses[hit.clause]?.indexes[0] : undefined;
        if (first === undefined) return;
        e.stopPropagation();
        setActive(null);
        onCite(first);
      }}
    >
      {current && (
        <style>{`[data-answer="${scope}"] [data-clause="${active!.clause}"]{background:var(--cite-hover)}`}</style>
      )}
      <Markdown
        remarkPlugins={[remarkGfm, [remarkCitations, { content, sourceCount: count, claims, clauses }]]}
        components={components}
      >
        {content}
      </Markdown>
      {current && sources && (
        <ClausePopover
          ref={popoverRef}
          clause={current}
          rect={active!.rect}
          sources={sources}
          onEnter={cancelClose}
          onLeave={scheduleClose}
          onOpen={(index) => {
            setActive(null);
            onCite(index);
          }}
        />
      )}
    </div>
  );
}

function ClausePopover({
  ref,
  clause,
  rect,
  sources,
  onEnter,
  onLeave,
  onOpen,
}: {
  ref: Ref<HTMLDivElement>;
  clause: CitedClause;
  rect: DOMRect;
  sources: MessageSource[];
  onEnter: () => void;
  onLeave: () => void;
  onOpen: (index: number) => void;
}) {
  const t = useTranslations("chat");
  const width = Math.min(POPOVER_WIDTH, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const below = window.innerHeight - rect.bottom >= POPOVER_MAX_HEIGHT + 8 || rect.top < POPOVER_MAX_HEIGHT;
  const position = below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 };
  const cited = clause.indexes.flatMap((i) => sources.filter((s) => s.index === i));

  return (
    <div
      ref={ref}
      role="tooltip"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={(e) => e.stopPropagation()}
      style={{ left, width, maxHeight: POPOVER_MAX_HEIGHT, ...position }}
      className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] text-left text-sm shadow-xl"
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {cited.map((s) => {
          const support = supportFor(s, clause.claim);
          return (
            <section key={s.index}>
              <button
                type="button"
                onClick={() => onOpen(s.index)}
                className="mb-1.5 flex w-full items-center gap-2 text-left hover:text-[var(--accent)]"
              >
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-[var(--chat-user)] px-1 text-xs font-semibold text-[var(--accent)]">
                  {s.index}
                </span>
                <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium" title={s.documentTitle}>
                  {s.documentTitle}
                </span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                  {t("sourcesChunk", { n: s.chunkIndex + 1 })}
                </span>
              </button>
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                {s.judge && <VerdictPill verdict={judgeVerdict(s.judge)} />}
                {support &&
                  (isSupported(support.score) ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                      {t("verifySupported")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                      <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                      {t("verifyUnsupported")}
                    </span>
                  ))}
              </div>
              <ChunkText content={s.content} evidence={support?.evidence} />
            </section>
          );
        })}
      </div>
      <p className="border-t border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--text-muted)]">
        {cited.some((s) => supportFor(s, clause.claim)?.evidence) ? t("hoverEvidence") : t("hoverHint")}
      </p>
    </div>
  );
}

/** Chunk text with the evidence sentence marked and scrolled into view. */
function ChunkText({ content, evidence }: { content: string; evidence?: { start: number; end: number } }) {
  let body: ReactNode = content;
  if (evidence) {
    body = (
      <>
        {content.slice(0, evidence.start)}
        <mark
          ref={(el) => {
            const box = el?.parentElement;
            if (el && box) box.scrollTop = Math.max(0, el.offsetTop - 24);
          }}
          className="rounded bg-[var(--cite-evidence)] px-0.5 text-[var(--text)]"
        >
          {content.slice(evidence.start, evidence.end)}
        </mark>
        {content.slice(evidence.end)}
      </>
    );
  }
  return (
    <div className="relative max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--bg)] p-2 text-[13px] leading-relaxed text-[var(--text)]">
      {body}
    </div>
  );
}
