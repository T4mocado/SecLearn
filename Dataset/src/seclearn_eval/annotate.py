"""Questions and pools ↔ Label Studio tasks, and Label Studio exports back into questions and labels.

Two projects, configs in `annotation/`: "kiểm câu" (`review.xml`) and "chấm pool" (`pool.xml`). The names and choice values
below are the contract with those configs. Region offsets are on the text shown; Label Studio 1.13.1 counts them in Unicode
code points like the snapshot (`manifest.offset_unit`), not in the browser's UTF-16 units (ticket 06 measured 2011, not 2012,
after a 🙂). Import converts when told the other unit, then checks the region's text against the snapshot markdown, so a
wrong unit fails loudly instead of shifting spans.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal, get_args

from pydantic import Field, ValidationError

from .io import FormatError
from .schema import GoldSpan, Label, Level, PoolEntry, Question, Record, Unit
from .snapshot import Snapshot, sha256_text
from .spans import normalize

OffsetUnit = Literal["utf16", "codepoint"]
LEVELS: tuple[str, ...] = get_args(Level)


class TaskSource(Record):
    """One source shown in a review task (`data.sources[n]`): where `source_n`'s text sits in the snapshot markdown."""

    doc_key: str
    md_sha256: str
    title: str
    char_start: int = Field(ge=0)
    char_end: int = Field(gt=0)

#: Source slots in `review.xml` (`source_0`, `source_1`): L4 / L5 questions hold a pair of units, no question more.
SOURCE_SLOTS = 2
EMPTY_SOURCE = "(không có đoạn nguồn thứ hai)"
#: Review task fields written by the LLM: shown only after the spans are done, and to hide in the Data Manager.
LLM_FIELDS = ("llm_level", "llm_answer", "llm_quotes", "question_en")
NO_ABSENCE_EVIDENCE = "(không phải câu L6(b))"
#: Characters of each retrieved chunk shown under an L6(b) question.
ABSENCE_SNIPPET = 300

QUESTION_CHECK = {"Tự đứng được": "ok", "Mơ hồ": "ambiguous", "Cần ngữ cảnh tài liệu": "needs_context", "Hỏi ý kiến": "opinion"}
DECISION = {"Chấp nhận": "accepted", "Sửa": "edited", "Loại": "rejected"}
L6_KIND = {"Ngoài lĩnh vực": "out_of_domain", "Corpus không có": "not_in_corpus", "Tiền đề sai": "false_premise"}
SPAN_EVIDENCE = "Bằng chứng"
SPAN_REFUTES = "Bác bỏ tiền đề"
#: Comparison questions: "Ô 1" … "Ô 4" → `GoldSpan.cell` 0 … 3.
SPAN_CELLS = {f"Ô {n + 1}": n for n in range(4)}
POOL_GRADE = {"3 - Trả lời trực tiếp": 3, "2 - Có đáp án nhưng lẫn / không rõ": 2, "1 - Đúng chủ đề, không trả lời": 1, "0 - Không liên quan": 0}

_VERSION = re.compile(r"^guideline_version:\s*(\S+)\s*$", re.MULTILINE)


def guideline_version(path: Path) -> str:
    """The `guideline_version: vN` line of a guideline file: the version every label made with it carries."""
    found = _VERSION.search(path.read_text(encoding="utf-8"))
    if not found:
        raise FormatError(f"{path}: no `guideline_version: ...` line")
    return found.group(1)


# --- Offsets -------------------------------------------------------------------------------------


def to_codepoint(text: str, offset: int, unit: OffsetUnit) -> int:
    """A Label Studio offset on `text` as a Python string index."""
    if unit == "codepoint":
        return offset
    units = 0
    for i, ch in enumerate(text):
        if units >= offset:
            if units > offset:
                raise FormatError(f"UTF-16 offset {offset} falls inside a surrogate pair")
            return i
        units += 2 if ord(ch) > 0xFFFF else 1
    if units == offset:
        return len(text)
    raise FormatError(f"UTF-16 offset {offset} past the end of the text ({units} units)")


# --- Export --------------------------------------------------------------------------------------


def _sources(q: Question, snap: Snapshot, units: dict[str, Unit]) -> list[TaskSource]:
    out = []
    for uid in q.unit_ids:
        unit = units.get(uid)
        if unit is None:
            raise FormatError(f"{q.id}: unit {uid} not in units file")
        doc = snap.document(unit.doc_key)
        if doc is None or unit.doc_key not in snap.markdown:
            raise FormatError(f"{q.id}: document {unit.doc_key} not in snapshot {snap.snapshot_id}")
        out.append(TaskSource(doc_key=unit.doc_key, md_sha256=doc.md_sha256, title=f"{doc.title} › {unit.title}",
                              char_start=unit.char_start, char_end=unit.char_end))
    if len(out) > SOURCE_SLOTS:
        raise FormatError(f"{q.id}: {len(out)} units, the review project shows at most {SOURCE_SLOTS}")
    return out


def review_tasks(questions: list[Question], snap: Snapshot, units: list[Unit], version: str) -> list[dict]:
    """One task per question. The LLM's answer, level and quotes are data the config only shows after the spans are done;
    the LLM's spans are never sent as predictions, so nothing pre-highlights the sources.

    Label Studio's Data Manager (the task table) shows every `data` field as a column, outside the labeling config.
    The `LLM_FIELDS` columns must be hidden there before annotators open the project (ticket 06, setup checklist);
    nesting them under one key would not help, the Data Manager shows the nested object too."""
    by_id = {u.unit_id: u for u in units}
    tasks = []
    for q in questions:
        sources = _sources(q, snap, by_id)
        data: dict[str, object] = {
            "question_id": q.id,
            "question": q.question,
            "turns": "\n".join(f"{t.role}: {t.content}" for t in q.turns) or "(không có lượt trước)",
            "compare_cells": "\n".join(f"Ô {n + 1}: {c.item} / {c.aspect}" for n, c in enumerate(q.compare_cells)) or "(không phải câu so sánh)",
            "llm_level": q.strata.level + (f" ({q.strata.l6_kind})" if q.strata.l6_kind else ""),
            "llm_answer": q.reference_answer or "(không có đáp án: câu L6)",
            "llm_quotes": "\n\n".join(f"[{s.doc_key}] {s.quote}" for s in q.gold_evidence) or "(không có trích dẫn)",
            "question_en": q.question_en,
            "absence_evidence": _absence_evidence(q, snap),
            "guideline_version": version,
            "snapshot_id": snap.snapshot_id,
            "sources": [s.model_dump() for s in sources],
        }
        for n in range(SOURCE_SLOTS):
            if n < len(sources):
                s = sources[n]
                data[f"source_{n}"] = snap.markdown[s.doc_key][s.char_start : s.char_end]
                data[f"source_{n}_title"] = s.title
            else:
                data[f"source_{n}"] = EMPTY_SOURCE
                data[f"source_{n}_title"] = ""
        tasks.append({"data": data})
    return tasks


def _absence_evidence(q: Question, snap: Snapshot) -> str:
    """An L6(b) question's keyword hits and each retriever's top chunks, with their text, as one block to read."""
    ev = q.absence_evidence
    if ev is None:
        return NO_ABSENCE_EVIDENCE
    chunks = {c.chunk_key: c.text for c in snap.chunks}
    lines = ["Từ khoá (số lần xuất hiện trong snapshot, tài liệu có nhiều nhất):"]
    lines += [f"- {k.keyword}: {k.n_hits}" + (f" ({', '.join(k.doc_keys)})" if k.doc_keys else "") for k in ev.keywords]
    for system in dict.fromkeys(r.system for r in ev.retrieved):
        lines.append(f"\nTop {sum(r.system == system for r in ev.retrieved)} của {system}:")
        for r in ev.retrieved:
            if r.system == system:
                text = " ".join(chunks.get(r.chunk_key, "(chunk không có trong snapshot)").split())[:ABSENCE_SNIPPET]
                lines.append(f"{r.rank}. [{r.chunk_key}] {text}")
    return "\n".join(lines)


def pool_tasks(entries: list[PoolEntry], questions: list[Question], snap: Snapshot, version: str) -> list[dict]:
    """One task per pooled (question, chunk). The LLM judge's grade is left out: the annotator grades blind."""
    by_q = {q.id: q for q in questions}
    chunks = {c.chunk_key: c for c in snap.chunks}
    tasks = []
    for e in entries:
        q, c = by_q.get(e.question_id), chunks.get(e.chunk_key)
        if q is None:
            raise FormatError(f"pool: question {e.question_id} not in questions file")
        if c is None:
            raise FormatError(f"pool: chunk {e.chunk_key} not in snapshot {snap.snapshot_id}")
        data = {"question_id": q.id, "chunk_key": c.chunk_key, "question": q.question, "chunk": c.text,
                "guideline_version": version, "snapshot_id": snap.snapshot_id}
        tasks.append({"data": data})
    return tasks


# --- Import --------------------------------------------------------------------------------------


@dataclass
class Annotation:
    question_id: str
    data: dict
    result: list[dict]
    annotator: str
    annotated_at: datetime
    lead_time: float | None


def _annotator(completed_by: object) -> str:
    """`completed_by` is a user id, or `{id, email, …}` in some export versions."""
    if isinstance(completed_by, dict):
        return str(completed_by.get("email") or completed_by.get("id"))
    return str(completed_by)


def read_export(path: Path) -> list[Annotation]:
    """The latest submitted (not skipped) annotation of each task in a Label Studio JSON export."""
    try:
        tasks = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        raise FormatError(f"{path}: invalid JSON ({err.msg})") from None
    if not isinstance(tasks, list):
        raise FormatError(f"{path}: expected the JSON export (a list of tasks)")
    out = []
    for task in tasks:
        done = [a for a in task.get("annotations", []) if not a.get("was_cancelled")]
        if not done:
            continue
        qid = task.get("data", {}).get("question_id")
        stamped = [(_stamp(a, path, qid), a) for a in done]
        when, a = max(stamped, key=lambda pair: pair[0])
        out.append(
            Annotation(
                question_id=qid,
                data=task["data"],
                result=a.get("result", []),
                annotator=_annotator(a.get("completed_by")),
                annotated_at=when,
                lead_time=a.get("lead_time"),
            )
        )
    return out


def _stamp(annotation: dict, path: Path, qid: object) -> datetime:
    """When an annotation was last saved: `updated_at`, else `created_at`; an annotation with neither is a broken export."""
    stamp = annotation.get("updated_at") or annotation.get("created_at")
    if not isinstance(stamp, str):
        raise FormatError(f"{path}: annotation {annotation.get('id')} of {qid} has no updated_at or created_at")
    try:
        return datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        raise FormatError(f"{path}: annotation {annotation.get('id')} of {qid}: bad timestamp {stamp!r}") from None


def _result_text(result: list[dict], name: str, kind: str) -> str | None:
    """The text of the first `kind` ("choices" / "textarea") result of control `name`, None when empty or absent."""
    for r in result:
        if r.get("from_name") == name and r.get("type") == kind:
            values = r["value"].get(kind if kind == "choices" else "text") or []
            text = "\n".join(values).strip()
            return text or None
    return None


def _check_snapshot(a: Annotation, snap: Snapshot) -> None:
    if a.data.get("snapshot_id") != snap.snapshot_id:
        raise FormatError(f"{a.question_id}: task made on snapshot {a.data.get('snapshot_id')}, importing onto {snap.snapshot_id}")


def _task_sources(a: Annotation) -> list[TaskSource]:
    raw = a.data.get("sources")
    if not isinstance(raw, list):
        raise FormatError(f"{a.question_id}: task has no `sources` list (not made by `annotate export`?)")
    try:
        return [TaskSource.model_validate(s) for s in raw]
    except ValidationError as err:
        raise FormatError(f"{a.question_id}: task sources: {err.errors()[0]['msg']}") from None


def _spans(a: Annotation, snap: Snapshot, unit: OffsetUnit) -> list[GoldSpan]:
    spans = []
    for r in a.result:
        if r.get("type") != "labels":
            continue
        slot = int(r["from_name"].removeprefix("span_"))
        sources = _task_sources(a)
        if slot >= len(sources):
            raise FormatError(f"{a.question_id}: a span on {r['from_name']}, which has no source")
        src = sources[slot]
        md = snap.markdown.get(src.doc_key)
        if md is None or sha256_text(md) != src.md_sha256:
            raise FormatError(f"{a.question_id}: markdown of {src.doc_key} is not the one the task showed")
        shown = md[src.char_start : src.char_end]
        v = r["value"]
        start = src.char_start + to_codepoint(shown, v["start"], unit)
        end = src.char_start + to_codepoint(shown, v["end"], unit)
        if normalize(md[start:end]) != normalize(v["text"]):
            raise FormatError(
                f"{a.question_id}: region text {v['text']!r} is not the markdown at {start}-{end} ({md[start:end]!r}); "
                f"Label Studio offsets may not be {unit} (see --offset-unit)"
            )
        labels = v.get("labels") or [SPAN_EVIDENCE]
        label = labels[0]
        if label not in (SPAN_EVIDENCE, SPAN_REFUTES, *SPAN_CELLS):
            raise FormatError(f"{a.question_id}: unknown span label {label!r}")
        spans.append(
            GoldSpan(doc_key=src.doc_key, md_sha256=src.md_sha256, char_start=start, char_end=end, quote=md[start:end],
                     cell=SPAN_CELLS.get(label), refutes=label == SPAN_REFUTES)
        )
    return sorted(spans, key=lambda s: (s.doc_key, s.char_start, s.char_end))


def _mapped(a: Annotation, name: str, table: dict[str, str]) -> str | None:
    value = _result_text(a.result, name, "choices")
    if value is not None and value not in table:
        raise FormatError(f"{a.question_id}: {name} choice {value!r} is not one of {sorted(table)}")
    return table.get(value) if value else None


def apply_review(q: Question, a: Annotation, snap: Snapshot, unit: OffsetUnit) -> Question:
    """`q` with one review annotation applied. The annotator's spans, if any, replace the LLM's; an empty answer box keeps the answer."""
    _check_snapshot(a, snap)
    spans = _spans(a, snap, unit)
    strata = q.strata
    level = _result_text(a.result, "level", "choices")
    if level:
        if level not in LEVELS:
            raise FormatError(f"{a.question_id}: level choice {level!r}")
        strata = strata.model_copy(update={"level": level, "answerable": level != "L6", "l6_kind": strata.l6_kind if level == "L6" else None})
    kind = _mapped(a, "l6_kind", L6_KIND)
    if kind and strata.level == "L6":
        strata = strata.model_copy(update={"l6_kind": kind})
    review = q.review.model_copy(
        update={
            "status": _mapped(a, "decision", DECISION) or q.review.status,
            "annotator": a.annotator,
            "guideline_version": a.data["guideline_version"],
            "lead_time": a.lead_time,
            "annotated_at": a.annotated_at,
            "notes": _result_text(a.result, "notes", "textarea") or q.review.notes,
            "question_check": _mapped(a, "question_check", QUESTION_CHECK) or q.review.question_check,
        }
    )
    update: dict[str, object] = {"strata": strata, "review": review}
    if spans:
        update["gold_evidence"] = spans
    answer = _result_text(a.result, "answer", "textarea")
    if answer:
        update["reference_answer"] = answer
    return q.model_copy(update=update)


def _label(a: Annotation, task: Literal["review", "pool"], chunk_key: str | None = None, grade: int | None = None) -> Label:
    return Label(question_id=a.question_id, task=task, chunk_key=chunk_key, grade=grade, annotator=a.annotator,
                 annotated_at=a.annotated_at, lead_time=a.lead_time, guideline_version=a.data["guideline_version"],
                 snapshot_id=a.data["snapshot_id"])


def import_review(questions: list[Question], annotations: list[Annotation], snap: Snapshot, unit: OffsetUnit) -> tuple[list[Question], list[Label]]:
    by_id: dict[str, Annotation] = {}
    for a in annotations:
        if a.question_id in by_id:
            raise FormatError(
                f"export has two annotated tasks for question {a.question_id} (imported twice into Label Studio?): "
                "delete one task in Label Studio and export again"
            )
        by_id[a.question_id] = a
    known = {q.id for q in questions}
    for qid in by_id:
        if qid not in known:
            raise FormatError(f"export has question {qid}, which the questions file does not")
    out = [apply_review(q, by_id[q.id], snap, unit) if q.id in by_id else q for q in questions]
    return out, [_label(by_id[q.id], "review") for q in questions if q.id in by_id]


def import_pool(annotations: list[Annotation], snap: Snapshot) -> list[Label]:
    labels = []
    for a in annotations:
        _check_snapshot(a, snap)
        grade = _result_text(a.result, "grade", "choices")
        if grade is None:
            continue
        if grade not in POOL_GRADE:
            raise FormatError(f"{a.question_id} {a.data['chunk_key']}: grade choice {grade!r}")
        labels.append(_label(a, "pool", a.data["chunk_key"], POOL_GRADE[grade]))
    return labels


def merge_labels(old: list[Label], new: list[Label]) -> list[Label]:
    """Labels accumulate across imports; importing the same export twice adds nothing."""
    def key(lab: Label) -> tuple[object, ...]:
        return lab.question_id, lab.task, lab.chunk_key, lab.annotator, lab.annotated_at

    seen = {key(lab) for lab in old}
    return [*old, *(lab for lab in new if key(lab) not in seen)]
