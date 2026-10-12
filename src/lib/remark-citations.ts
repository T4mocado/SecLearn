import type { Nodes, Parent, Root, Text } from "mdast";
import type { CitationClaim, CitedClause } from "@/lib/sources";

/**
 * Remark plugin for answer text: turns valid `[n]` markers into citation nodes and wraps the
 * text of each cited clause, so the renderer can highlight a clause and show its chunk on hover.
 *
 * Both work on offsets into the raw answer (`citationClaims` / `citedClauses`), mapped through each
 * text node's source position. A clause may span formatting ("A **B** C [1]"): every text piece
 * inside its range gets the clause's position in `clauses` as key. Where clauses overlap, the
 * earlier one wins. Code nodes are never touched, matching `maskCode`.
 *
 * Rendered as `<span data-cite={n} data-at={offset} data-clause={i}>` and `<span data-clause={i}>`.
 */
export type RemarkCitationsOptions = {
  content: string;
  sourceCount: number;
  claims: CitationClaim[];
  clauses: CitedClause[];
};

const MARKER_RE = /\[(\d{1,2})\]/g;

function citeNode(index: number, at: number | null, clause: number) {
  return {
    type: "citationRef",
    data: {
      hName: "span",
      hProperties: {
        dataCite: index,
        ...(at !== null ? { dataAt: at } : {}),
        ...(clause >= 0 ? { dataClause: clause } : {}),
      },
      hChildren: [{ type: "text", value: String(index) }],
    },
  };
}

function clauseNode(value: string, clause: number) {
  return {
    type: "citedClause",
    data: { hName: "span", hProperties: { dataClause: clause } },
    children: [{ type: "text", value }],
  };
}

/** Splits text at absolute offset `from` into plain and clause-wrapped pieces. */
function splitByClauses(value: string, from: number, clauses: CitedClause[]): unknown[] {
  const to = from + value.length;
  const cuts = new Set([from, to]);
  for (const c of clauses) {
    if (c.start > from && c.start < to) cuts.add(c.start);
    if (c.end > from && c.end < to) cuts.add(c.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: unknown[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const piece = value.slice(a - from, b - from);
    const clause = clauses.findIndex((c) => c.start <= a && b <= c.end);
    out.push(clause >= 0 ? clauseNode(piece, clause) : { type: "text", value: piece });
  }
  return out;
}

function transformText(node: Text, opts: RemarkCitationsOptions): unknown[] | null {
  const startOffset = node.position?.start.offset;
  const endOffset = node.position?.end.offset;
  const { value } = node;
  // Escapes or entities ("\*", "&amp;") make the source differ from the value; offsets then
  // don't map character by character, so only markers are converted and clauses are skipped.
  const base =
    startOffset !== undefined && endOffset !== undefined && opts.content.slice(startOffset, endOffset) === value
      ? startOffset
      : null;
  const overlapsClause =
    base !== null && opts.clauses.some((c) => c.start < base + value.length && c.end > base);

  const out: unknown[] = [];
  let last = 0;
  const pushText = (from: number, to: number) => {
    if (to <= from) return;
    const piece = value.slice(from, to);
    out.push(...(overlapsClause ? splitByClauses(piece, base! + from, opts.clauses) : [{ type: "text", value: piece }]));
  };
  let markers = 0;
  for (const match of value.matchAll(MARKER_RE)) {
    const n = Number(match[1]);
    if (n < 1 || n > opts.sourceCount) continue;
    const at = base !== null ? base + match.index : null;
    const claim = at !== null ? opts.claims.find((c) => c.at === at) : undefined;
    const clause = claim ? opts.clauses.findIndex((c) => c.start === claim.start && c.end === claim.end) : -1;
    pushText(last, match.index);
    out.push(citeNode(n, at, clause));
    last = match.index + match[0].length;
    markers++;
  }
  if (!markers && !overlapsClause) return null;
  pushText(last, value.length);
  return out;
}

const SKIP = new Set(["code", "inlineCode", "html", "definition"]);

export function remarkCitations(opts: RemarkCitationsOptions) {
  const visit = (parent: Parent) => {
    const children: Nodes[] = [];
    for (const child of parent.children as Nodes[]) {
      if (SKIP.has(child.type)) {
        children.push(child);
      } else if (child.type === "text") {
        children.push(...((transformText(child, opts) ?? [child]) as Nodes[]));
      } else {
        if ("children" in child) visit(child);
        children.push(child);
      }
    }
    parent.children = children as Parent["children"];
  };

  return (tree: Root) => {
    if (opts.sourceCount > 0) visit(tree);
  };
}
