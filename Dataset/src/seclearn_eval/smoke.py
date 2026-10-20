"""The 40-question smoke set of the app (`data/eval/set-a.jsonl`, `set-b.jsonl`) moved onto a snapshot as gold
spans (spec user story 71). Its quotes were cut from `pdftotext` output, so they carry no offsets and differ from
the snapshot markdown in quote marks, dashes and line wraps; a quote found more than once needs a pick by hand."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, TypeAdapter, ValidationError

from .clusters import WSTG_KEY
from .io import FormatError, read_jsonl
from .schema import (
    CompareCell,
    Generation,
    GoldSpan,
    L6Kind,
    Level,
    Question,
    Record,
    Review,
    SplitName,
    Strata,
    Turn,
    Unit,
)
from .snapshot import Snapshot
from .spans import find_quote, overlap

#: `generation` of a smoke question: written by hand, no model, no seed.
GENERATION = Generation(model="manual", prompt_version="smoke-1.0", seed=0)


class SmokeEvidence(Record):
    document: str
    quote: str
    grade: int
    cell: int | None = None


class SmokeSource(Record):
    method: str
    generator: str | None
    seed: int | None
    prompt_version: str | None


class SmokeReview(Record):
    status: str
    annotators: list[str]
    notes: str


class SmokeQuestion(Record):
    """One line of the app's smoke files, exactly as written there."""

    id: str
    split: SplitName
    version: str
    question: str
    language: Literal["vi"]
    question_style: Literal["accented", "unaccented", "mixed_vi_en"]
    turns: list[Turn]
    level: Level
    type: str
    compare_cells: list[CompareCell]
    answerable: bool
    unanswerable_reason: L6Kind | None
    reference_answer: str | None
    reference_claims: list[str]
    gold_evidence: list[SmokeEvidence]
    source: SmokeSource
    review: SmokeReview


class Pick(BaseModel):
    """Which match to keep when a quote is found several times: the n-th (1-based) in the markdown, or all of them
    (the same sentence stated twice with the same meaning). `why` says what was read to choose."""

    model_config = ConfigDict(extra="forbid")

    occurrence: int | Literal["all"]
    why: str


def read_smoke(path: Path) -> list[SmokeQuestion]:
    return read_jsonl(path, SmokeQuestion)


def read_picks(path: Path) -> dict[str, Pick]:
    """`{"<question id>/<evidence index>": {"occurrence": n | "all", "why": "..."}}`."""
    try:
        return TypeAdapter(dict[str, Pick]).validate_json(path.read_bytes())
    except ValidationError as err:
        raise FormatError(f"{path}: {err.errors()[0]['loc']}: {err.errors()[0]['msg']}") from None

_DASHES = "-‐‑‒–—―−"
_SINGLE = "'‘’‛′"
_DOUBLE = '"“”„″'


def _loose_pattern(quote: str) -> re.Pattern[str]:
    """`quote` as a regex that accepts any quote mark, dash (or pdftotext's `--`) and whitespace run for its own."""
    parts: list[str] = []
    i = 0
    while i < len(quote):
        ch = quote[i]
        if ch.isspace():
            while i < len(quote) and quote[i].isspace():
                i += 1
            parts.append(r"\s+")
            continue
        if quote.startswith("--", i) or ch in _DASHES:
            i += 2 if quote.startswith("--", i) else 1
            parts.append(f"(?:--|[{re.escape(_DASHES)}])")
            continue
        if ch in _SINGLE:
            parts.append(f"[{re.escape(_SINGLE)}]")
        elif ch in _DOUBLE:
            parts.append(f"[{re.escape(_DOUBLE)}]")
        else:
            parts.append(re.escape(ch))
        i += 1
    return re.compile("".join(parts).strip())


def locate(markdown: str, quote: str) -> list[tuple[int, int]]:
    """Every place of `quote` in `markdown`: exact (up to whitespace) first, then up to quote marks and dashes."""
    found = find_quote(markdown, quote)
    if found:
        return found
    return [m.span() for m in _loose_pattern(quote.strip()).finditer(markdown)]


def _doc_key(document: str) -> str:
    return document.removesuffix(".pdf")


def convert_smoke(
    records: list[SmokeQuestion | dict],
    snap: Snapshot,
    units: list[Unit],
    picks: dict[str, Pick],
) -> tuple[list[Question], list[str]]:
    """Questions on `snap`, and one line per smoke quote that did not become a span (`<id>/<index>: why`)."""
    unmapped: list[str] = []
    out: list[Question] = []
    for record in records:
        r = record if isinstance(record, SmokeQuestion) else SmokeQuestion.model_validate(record)
        spans: list[GoldSpan] = []
        for i, e in enumerate(r.gold_evidence):
            key, doc_key = f"{r.id}/{i}", _doc_key(e.document)
            doc, md = snap.document(doc_key), snap.markdown.get(doc_key)
            if doc is None or md is None:
                unmapped.append(f"{key}: document {doc_key} not in snapshot {snap.snapshot_id}")
                continue
            found = locate(md, e.quote)
            if not found:
                unmapped.append(f"{key}: quote not found in {doc_key}")
                continue
            if len(found) > 1:
                pick = picks.get(key)
                if pick is None:
                    unmapped.append(f"{key}: quote found {len(found)} times in {doc_key}, no pick")
                    continue
                if pick.occurrence != "all":
                    if not 1 <= pick.occurrence <= len(found):
                        unmapped.append(f"{key}: pick {pick.occurrence} of {len(found)} matches in {doc_key}")
                        continue
                    found = [found[pick.occurrence - 1]]
            exact = bool(find_quote(md, e.quote))
            for start, end in found:
                spans.append(
                    GoldSpan(
                        doc_key=doc_key,
                        md_sha256=doc.md_sha256,
                        char_start=start,
                        char_end=end,
                        # A loose match keeps the markdown's own text, so `check` finds the quote at its offsets.
                        quote=e.quote if exact else md[start:end],
                        cell=e.cell,
                        grade=e.grade,
                        refutes=r.unanswerable_reason == "false_premise",
                    )
                )
        out.append(_question(r, spans, units))
    return out, unmapped


def _question(r: SmokeQuestion, spans: list[GoldSpan], units: list[Unit]) -> Question:
    unit_ids: list[str] = []
    cluster: str | None = None
    for s in spans:
        for u in units:
            if u.doc_key == s.doc_key and overlap(u, s) > 0 and u.unit_id not in unit_ids:
                unit_ids.append(u.unit_id)
                cluster = cluster or u.cluster
    sources = {"wstg" if s.doc_key == WSTG_KEY else "cheat_sheet" for s in spans}
    gold_source = None if not sources else ("both" if len(sources) == 2 else sources.pop())
    notes = f"Bộ smoke {r.version} (data/eval của app), review gốc: {r.review.status}; chưa có question_en."
    if r.review.notes:
        notes += f" {r.review.notes}"
    return Question(
        id=r.id,
        split=r.split,
        question=r.question,
        question_en="",
        turns=r.turns,
        cluster=cluster,
        unit_ids=unit_ids,
        seed_id=r.id,
        strata=Strata(
            level=r.level,
            answerable=r.answerable,
            l6_kind=r.unanswerable_reason,
            question_style=r.question_style,
            gold_source=gold_source,
        ),
        type=r.type,
        compare_cells=r.compare_cells,
        reference_answer=r.reference_answer,
        reference_claims=r.reference_claims,
        gold_evidence=spans,
        review=Review(status="pending", notes=notes),
        generation=GENERATION,
    )
