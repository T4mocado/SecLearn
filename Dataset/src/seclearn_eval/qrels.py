"""`qrels`: TREC qrels for one chunker_version, generated from gold spans and pool labels (spec user stories 57-58).

A chunk is relevant to a gold span when it holds at least half of the span, or all of it (`spans.covers`); its grade is
the span's (the highest, when it covers several). Then the pool, if it was built on this chunker: a human pool label
replaces that grade (the latest label, when a chunk was graded twice), and an LLM-only 0 is written as judged,
not relevant. qrels are a product: never edit them, change the spans or the labels and generate again.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

from .io import FormatError, read_json, write_json
from .schema import InputFile, Label, PoolEntry, QrelLine, QrelsMeta, Question
from .snapshot import Snapshot
from .spans import covers


@dataclass
class QrelsResult:
    lines: list[QrelLine]
    warnings: list[str] = field(default_factory=list)
    #: Lines whose grade came from a human pool label rather than from the spans.
    from_labels: int = 0


def gradable(q: Question) -> bool:
    """Questions that get qrels: answerable and not rejected (L6 is scored apart, by refusals)."""
    return q.strata.answerable and q.review.status != "rejected"


def latest_pool_labels(labels: list[Label]) -> dict[tuple[str, str], Label]:
    """(question_id, chunk_key) → the latest graded pool label."""
    out: dict[tuple[str, str], Label] = {}
    for l in sorted((l for l in labels if l.task == "pool" and l.grade is not None and l.chunk_key), key=lambda l: l.annotated_at):
        out[(l.question_id, l.chunk_key)] = l
    return out


def span_grades(q: Question, snap: Snapshot) -> dict[str, int]:
    """chunk_key → grade from the question's gold spans alone."""
    grades: dict[str, int] = {}
    for s in q.gold_evidence:
        doc = snap.document(s.doc_key)
        if doc is None or s.md_sha256 != doc.md_sha256:
            raise FormatError(f"{q.id}: span {s.doc_key}:{s.char_start}-{s.char_end} cites other markdown than snapshot {snap.snapshot_id}; run `reanchor`")
        for c in snap.chunks_of(s.doc_key):
            if covers(c, s):
                grades[c.chunk_key] = max(grades.get(c.chunk_key, 0), s.grade)
    return grades


def build_qrels(questions: list[Question], snap: Snapshot, pool: list[PoolEntry], labels: list[Label]) -> QrelsResult:
    warnings: list[str] = []
    other = sorted({e.chunker_version or "unknown" for e in pool if e.chunker_version != snap.chunker_version})
    if other:
        warnings.append(f"pool entries on chunker {', '.join(other)}, not {snap.chunker_version}: their labels are not applied")
    pooled = {(e.question_id, e.chunk_key): e for e in pool if e.chunker_version == snap.chunker_version}
    human = {k: l for k, l in latest_pool_labels(labels).items() if k in pooled}

    out: list[QrelLine] = []
    from_labels = 0
    for q in sorted((q for q in questions if gradable(q)), key=lambda q: q.id):
        grades = span_grades(q, snap)
        for (qid, chunk_key), e in pooled.items():
            if qid != q.id:
                continue
            if (qid, chunk_key) in human:
                grades[chunk_key] = human[(qid, chunk_key)].grade  # type: ignore[assignment]
                from_labels += 1
            elif e.llm_grade == 0 and chunk_key not in grades:
                grades[chunk_key] = 0
        if not any(g > 0 for g in grades.values()):
            warnings.append(f"{q.id}: no relevant chunk in {snap.chunker_version}")
        out += [QrelLine(qid=q.id, chunk_key=k, grade=g) for k, g in sorted(grades.items(), key=lambda kv: chunk_order(kv[0]))]
    return QrelsResult(out, warnings, from_labels)


def chunk_order(chunk_key: str) -> tuple[str, int]:
    doc, _, index = chunk_key.rpartition("#")
    return doc, int(index) if index.isdigit() else -1


# --- Provenance ----------------------------------------------------------------------------------


def meta_path(qrels: Path) -> Path:
    return qrels.with_name(qrels.name + ".meta.json")


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_meta(qrels: Path, snap: Snapshot, inputs: dict[str, Path], result: QrelsResult, n_questions: int) -> None:
    meta = QrelsMeta(
        generated_by="seclearn-eval qrels",
        snapshot_id=snap.snapshot_id,
        chunker_version=snap.chunker_version,
        inputs={name: InputFile(path=p.as_posix(), sha256=file_sha256(p)) for name, p in inputs.items()},
        qrels_sha256=file_sha256(qrels),
        n_questions=n_questions,
        n_lines=len(result.lines),
        n_from_labels=result.from_labels,
    )
    write_json(meta_path(qrels), meta)


def verify_generated(qrels: Path) -> str | None:
    """None when `qrels` is what `qrels` wrote, or has no meta file (not ours: `score` warns); otherwise why not."""
    meta = meta_path(qrels)
    if meta.is_file() and file_sha256(qrels) != read_json(meta, QrelsMeta).qrels_sha256:
        return f"{qrels}: edited since `seclearn-eval qrels` wrote it (sha256 differs from {meta.name}); generate it again"
    return None
