"""`filter`: six steps in a fixed order (spec, user stories 32-38). Each step counts what came in, what it rejected
and why, so the thesis can report the rejection rate of every step.

1. quote           every quote is found verbatim (up to whitespace) in the snapshot markdown, inside the candidate's units;
2. answerable      the judge answers from the quotes alone (L6 is not asked: it is meant to be unanswerable);
3. level           the judge re-levels; an L1 judged L2 stays L1; a level the candidate's units can hold (L3: a unit
                   of 2+ chunks) is a relabel, any other is a rejection;
4. self_reference  questions that point at "this document", a figure, a table or a chapter;
5. dedup           same-meaning questions within one cluster (embedding cosine), the later one goes;
6. l2_overlap      L2 questions whose content words are mostly the evidence's own words.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from collections.abc import Callable
from dataclasses import dataclass

from .llm import LLMClient, cosine
from .plan import L3_MIN_CHUNKS
from .prompts import ANSWER_SCHEMA, LEVEL_SCHEMA, SYSTEM_JUDGE, answer_prompt, level_prompt
from .schema import (
    Candidate,
    CompareCell,
    FilterReport,
    FilterStep,
    GoldSpan,
    LLMConfig,
    Question,
    Quote,
    Rejection,
    Review,
    Strata,
    Unit,
)
from .snapshot import Snapshot
from .spans import find_quote
from .units import unit_title

STEPS = ("quote", "answerable", "level", "self_reference", "dedup", "l2_overlap")

#: Levels a candidate may be moved between by the judge, by how many units it was written from.
RELABEL_GROUPS = ({"L1", "L3"}, {"L4", "L5"})
#: (written, judged) pairs that are one task: L2 is L1 worded away from the document, and a Vietnamese question on
#: English evidence always reads that way, so an L1 judged L2 keeps its level. L2 variants are made in ticket 09.
SAME_TASK = {("L1", "L2")}

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


@dataclass
class Located:
    """The gold spans of a candidate's quotes, or why they could not be placed (`problem` is a rejection reason)."""

    spans: list[GoldSpan]
    problem: str | None = None
    detail: str = ""


def locate(c: Candidate, snap: Snapshot, units: dict[str, Unit]) -> Located:
    """A gold span per quote, found inside the candidate's own units (the text it was written from)."""
    return locate_quotes(c.quotes, c.unit_ids, snap, units)


def locate_quotes(quotes: list[Quote], unit_ids: list[str], snap: Snapshot, units: dict[str, Unit]) -> Located:
    """A gold span per quote, found inside the given units.

    A quote not in its document is `quote_not_found`; one found in the document but only outside the candidate's
    units is `quote_outside_units` (the generator quoted text it was not shown, or a passage that repeats elsewhere).
    """
    spans: list[GoldSpan] = []
    for q in quotes:
        md = snap.markdown.get(q.doc_key)
        doc = snap.document(q.doc_key)
        found = find_quote(md, q.quote) if md is not None and doc is not None else []
        if not found:
            return Located([], "quote_not_found", q.quote)
        ranges = [(u.char_start, u.char_end) for uid in unit_ids if (u := units.get(uid)) and u.doc_key == q.doc_key]
        inside = [f for f in found if any(s <= f[0] and f[1] <= e for s, e in ranges)]
        if not inside:
            return Located([], "quote_outside_units", q.quote)
        start, end = inside[0]
        spans.append(GoldSpan(doc_key=q.doc_key, md_sha256=doc.md_sha256, char_start=start, char_end=end, quote=md[start:end]))
    return Located(spans)


def content_words(text: str) -> set[str]:
    """Lower-case words of 3+ letters, without English stop words."""
    return {w for w in _WORD.findall(text.lower()) if len(w) >= 3 and w not in _STOP}


def refers_to_document(*texts: str) -> str | None:
    """The first words pointing at "this document", a figure, a table or a chapter, if any."""
    return next((m.group(0) for p in _SELF_REFERENCE for text in texts if (m := p.search(text))), None)


def evidence_overlap(question_en: str, quotes: list[str]) -> float:
    """Share of the question's content words found in its evidence (an L2 question should be worded away from it)."""
    words = content_words(question_en)
    return len(words & content_words(" ".join(quotes))) / len(words) if words else 0.0


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
            elif (located := locate(c, snap, by_unit)).problem:
                s.reject(c, located.problem, located.detail)
                continue
            kept.append(c)
        return kept

    def answerable(s: _Step, cands: list[Candidate]) -> list[Candidate]:
        kept = []
        for c in cands:
            if c.level != "L6":
                reply = judge.ask_json(answer_prompt(c.question, [q.quote for q in c.quotes], c.level), ANSWER_SCHEMA, system=SYSTEM_JUDGE)
                if not reply.get("answerable"):
                    s.reject(c, "not_answerable_from_evidence", str(reply.get("answer", "")))
                    continue
            kept.append(c)
        return kept

    def level(s: _Step, cands: list[Candidate]) -> list[Candidate]:
        kept = []
        for c in cands:
            got = judge.ask_json(level_prompt(c.question, [q.quote for q in c.quotes]), LEVEL_SCHEMA, system=SYSTEM_JUDGE).get("level")
            if got == c.level or (c.level, got) in SAME_TASK:
                kept.append(c)
                continue
            n_units = len(c.unit_ids)
            group = next((g for g in RELABEL_GROUPS if c.level in g and got in g), None)
            if group is None or n_units != (1 if group == RELABEL_GROUPS[0] else 2):
                s.reject(c, "level_mismatch", f"asked {c.level}, judged {got}")
            elif got == "L3" and not all((u := by_unit.get(uid)) and u.chunks >= L3_MIN_CHUNKS for uid in c.unit_ids):
                # The plan gives L3 only to units of 2+ chunks (spec, user story 20a); a relabel must keep that.
                s.reject(c, "l3_needs_two_chunks", f"judged L3 on a unit of fewer than {L3_MIN_CHUNKS} chunks")
            else:
                kept.append(c.model_copy(update={"level": got, "relabelled_from": c.relabelled_from or c.level}))
                s.relabelled += 1
        return kept

    def self_reference(s: _Step, cands: list[Candidate]) -> list[Candidate]:
        kept = []
        for c in cands:
            if hit := refers_to_document(c.question, c.question_en):
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
                share = evidence_overlap(c.question_en, [q.quote for q in c.quotes])
                if share >= config.l2_max_overlap:
                    s.reject(c, "too_close_to_document", f"{share:.2f} of content words in the evidence")
                    continue
            kept.append(c)
        return kept

    for name, check in zip(STEPS, (quote, answerable, level, self_reference, dedup, l2_overlap), strict=True):
        step(name, check)

    report = FilterReport(steps=[s.stats() for s in steps], n_kept=len(current), rejected=[r for s in steps for r in s.rejections])
    return current, report


def candidates_to_questions(kept: list[Candidate], snap: Snapshot, units: list[Unit]) -> list[Question]:
    """Pending questions for review: gold spans located on the snapshot, inside each candidate's units; each its own seed."""
    by_unit = {u.unit_id: u for u in units}
    out = []
    for c in kept:
        spans = locate(c, snap, by_unit).spans
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
                # The generator compares unit 1 with unit 2: one cell each, in that order (the review shows them top, then below).
                compare_cells=[CompareCell(item=unit_title(by_unit[u], snap), aspect="") for u in c.unit_ids] if c.level == "L4" else [],
                review=Review(),
                generation=c.generation,
            )
        )
    return out
