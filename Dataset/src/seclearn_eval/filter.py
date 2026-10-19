"""`filter`: six steps in a fixed order (spec, user stories 32-38). Each step counts what came in, what it rejected
and why, so the thesis can report the rejection rate of every step.

1. quote           every quote is found verbatim (up to whitespace) in the snapshot markdown;
2. answerable      the judge answers from the quotes alone (L6 is not asked: it is meant to be unanswerable);
3. level           the judge re-levels; a level the candidate's units can hold is a relabel, any other is a rejection;
4. self_reference  questions that point at "this document", a figure, a table or a chapter;
5. dedup           same-meaning questions within one cluster (embedding cosine), the later one goes;
6. l2_overlap      L2 questions whose content words are mostly the evidence's own words.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from collections.abc import Callable

from .llm import LLMClient, cosine
from .prompts import ANSWER_SCHEMA, LEVEL_SCHEMA, SYSTEM_JUDGE, answer_prompt, level_prompt
from .schema import Candidate, FilterReport, FilterStep, GoldSpan, LLMConfig, Question, Rejection, Review, Strata, Unit
from .snapshot import Snapshot
from .spans import find_quote

STEPS = ("quote", "answerable", "level", "self_reference", "dedup", "l2_overlap")

#: Levels a candidate may be moved between by the judge, by how many units it was written from.
RELABEL_GROUPS = ({"L1", "L3"}, {"L4", "L5"})

_SELF_REFERENCE = [
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\b(tài liệu|văn bản|đoạn văn|đoạn trích|bài viết|cheat sheet|hướng dẫn) (này|trên|dưới|đã cho)\b",
        r"\b(hình|bảng|chương|mục|biểu đồ|sơ đồ)\s+(\d+|[ivx]+\b|này|trên|dưới|sau\b)",
        r"\b(this|the above|the following|the given|the provided) (document|text|passage|cheat sheet|guide|article|excerpt)\b",
        r"\baccording to the (document|text|passage|guide)\b",
        r"\b(figure|fig\.|table|chapter|section)\s+\d",
    )
]

_WORD = re.compile(r"[a-z0-9]+")
_STOP = frozenset(
    "the and for are but not you your with that this from what which when where who whom why how does did can could "
    "should would will shall may might must has have had was were been being its into than then them they their there "
    "these those such any all some each other about over under also only just very more most less much many use used "
    "using".split()
)


class _Step:
    def __init__(self, name: str):
        self.name = name
        self.n_in = 0
        self.rejections: list[Rejection] = []
        self.relabelled = 0

    def reject(self, c: Candidate, reason: str, detail: str = "") -> None:
        self.rejections.append(Rejection(candidate_id=c.candidate_id, step=self.name, reason=reason, detail=detail))

    def stats(self) -> FilterStep:
        reasons = Counter(r.reason for r in self.rejections)
        return FilterStep(step=self.name, n_in=self.n_in, n_rejected=len(self.rejections), n_relabelled=self.relabelled, reasons=dict(sorted(reasons.items())))


def locate(c: Candidate, snap: Snapshot, units: dict[str, Unit] | None = None) -> list[GoldSpan] | None:
    """A gold span per quote, preferring a match inside the candidate's units; None when a quote is not in the snapshot."""
    spans: list[GoldSpan] = []
    ranges = [(u.char_start, u.char_end) for uid in c.unit_ids if units and (u := units.get(uid))]
    for q in c.quotes:
        md = snap.markdown.get(q.doc_key)
        doc = snap.document(q.doc_key)
        if md is None or doc is None:
            return None
        found = find_quote(md, q.quote)
        if not found:
            return None
        inside = [f for f in found if any(s <= f[0] and f[1] <= e for s, e in ranges)]
        start, end = (inside or found)[0]
        spans.append(GoldSpan(doc_key=q.doc_key, md_sha256=doc.md_sha256, char_start=start, char_end=end, quote=md[start:end]))
    return spans


def _content_words(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower()) if len(w) >= 3 and w not in _STOP}


def run_filter(
    candidates: list[Candidate],
    snap: Snapshot,
    units: list[Unit],
    *,
    judge: LLMClient,
    embedder: LLMClient,
    config: LLMConfig,
) -> tuple[list[Candidate], FilterReport]:
    by_unit = {u.unit_id: u for u in units}
    steps: list[_Step] = []
    current = list(candidates)

    def step(name: str, check: Callable[[_Step, list[Candidate]], list[Candidate]]) -> None:
        nonlocal current
        s = _Step(name)
        s.n_in = len(current)
        current = check(s, current)
        steps.append(s)

    def quote(s: _Step, cands: list[Candidate]) -> list[Candidate]:
        kept = []
        for c in cands:
            if not c.quotes:
                if c.level != "L6":
                    s.reject(c, "no_quote")
                    continue
            elif locate(c, snap, by_unit) is None:
                s.reject(c, "quote_not_found", next((q.quote for q in c.quotes if not _found(q.doc_key, q.quote)), ""))
                continue
            kept.append(c)
        return kept

    def _found(doc_key: str, text: str) -> bool:
        md = snap.markdown.get(doc_key)
        return md is not None and bool(find_quote(md, text))

    def answerable(s: _Step, cands: list[Candidate]) -> list[Candidate]:
        kept = []
        for c in cands:
            if c.level != "L6":
                reply = judge.ask_json(answer_prompt(c.question, [q.quote for q in c.quotes]), ANSWER_SCHEMA, system=SYSTEM_JUDGE)
                if not reply.get("answerable"):
                    s.reject(c, "not_answerable_from_evidence", str(reply.get("answer", "")))
                    continue
            kept.append(c)
        return kept

    def level(s: _Step, cands: list[Candidate]) -> list[Candidate]:
        kept = []
        for c in cands:
            got = judge.ask_json(level_prompt(c.question, [q.quote for q in c.quotes]), LEVEL_SCHEMA, system=SYSTEM_JUDGE).get("level")
            if got == c.level:
                kept.append(c)
                continue
            n_units = len(c.unit_ids)
            group = next((g for g in RELABEL_GROUPS if c.level in g and got in g), None)
            if group is not None and n_units == (1 if group == RELABEL_GROUPS[0] else 2):
                kept.append(c.model_copy(update={"level": got, "relabelled_from": c.relabelled_from or c.level}))
                s.relabelled += 1
            else:
                s.reject(c, "level_mismatch", f"asked {c.level}, judged {got}")
        return kept

    def self_reference(s: _Step, cands: list[Candidate]) -> list[Candidate]:
        kept = []
        for c in cands:
            hit = next((m.group(0) for p in _SELF_REFERENCE for text in (c.question, c.question_en) if (m := p.search(text))), None)
            if hit:
                s.reject(c, "refers_to_document", hit)
            else:
                kept.append(c)
        return kept

    def dedup(s: _Step, cands: list[Candidate]) -> list[Candidate]:
        vectors = embedder.embed([c.question_en for c in cands]) if cands else []
        kept: list[Candidate] = []
        seen: dict[str | None, list[tuple[Candidate, list[float]]]] = defaultdict(list)
        for c, v in zip(cands, vectors, strict=True):
            twin = next(((k, sim) for k, kv in seen[c.cluster] if (sim := cosine(v, kv)) >= config.dedup_cosine), None)
            if twin:
                s.reject(c, "duplicate", f"{twin[0].candidate_id} (cosine {twin[1]:.3f})")
                continue
            seen[c.cluster].append((c, v))
            kept.append(c)
        return kept

    def l2_overlap(s: _Step, cands: list[Candidate]) -> list[Candidate]:
        kept = []
        for c in cands:
            if c.level == "L2":
                words = _content_words(c.question_en)
                evidence = _content_words(" ".join(q.quote for q in c.quotes))
                share = len(words & evidence) / len(words) if words else 0.0
                if share >= config.l2_max_overlap:
                    s.reject(c, "too_close_to_document", f"{share:.2f} of content words in the evidence")
                    continue
            kept.append(c)
        return kept

    for name, check in zip(STEPS, (quote, answerable, level, self_reference, dedup, l2_overlap), strict=True):
        step(name, check)

    report = FilterReport(steps=[s.stats() for s in steps], n_kept=len(current), rejected=[r for s in steps for r in s.rejections])
    return current, report


def candidates_to_questions(kept: list[Candidate], snap: Snapshot, units: list[Unit] | None = None) -> list[Question]:
    """Pending questions for review: gold spans located on the snapshot, each its own seed."""
    by_unit = {u.unit_id: u for u in units or []}
    out = []
    for c in kept:
        spans = locate(c, snap, by_unit) or []
        wstg = {s.doc_key.startswith("wstg") for s in spans}
        source = None if not spans else "both" if len(wstg) == 2 else "wstg" if True in wstg else "cheat_sheet"
        out.append(
            Question(
                id=c.candidate_id,
                split=c.split,
                question=c.question,
                question_en=c.question_en,
                cluster=c.cluster,
                unit_ids=c.unit_ids,
                seed_id=c.candidate_id,
                strata=Strata(level=c.level, answerable=c.level != "L6", l6_kind=c.l6_kind, gold_source=source),
                reference_answer=c.reference_answer,
                reference_claims=c.reference_claims,
                gold_evidence=spans,
                review=Review(),
                generation=c.generation,
            )
        )
    return out
