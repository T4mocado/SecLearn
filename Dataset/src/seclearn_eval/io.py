"""Reading and writing eval-set files through the schema. Errors name the file and line."""

from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from .schema import QrelLine, Question, QuestionFileHeader, RunLine

M = TypeVar("M", bound=BaseModel)


class FormatError(Exception):
    """A file that does not match the schema."""


def _validate[M: BaseModel](model: type[M], data: object, where: str) -> M:
    try:
        return model.model_validate(data)
    except ValidationError as err:
        problems = "; ".join(f"{'.'.join(map(str, e['loc'])) or '<root>'}: {e['msg']}" for e in err.errors())
        raise FormatError(f"{where}: {problems}") from None


def _loads(text: str, where: str) -> object:
    try:
        return json.loads(text)
    except json.JSONDecodeError as err:
        raise FormatError(f"{where}: invalid JSON ({err.msg})") from None


def read_json[M: BaseModel](path: Path, model: type[M]) -> M:
    return _validate(model, _loads(path.read_text(encoding="utf-8"), str(path)), str(path))


def write_json(path: Path, record: BaseModel) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(record.model_dump_json(indent=2) + "\n", encoding="utf-8", newline="\n")


def write_text(path: Path, text: str) -> None:
    """A UTF-8 text file with LF line ends (reports, plan tables)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def write_plain_json(path: Path, data: object) -> None:
    """JSON that is not one of our records (Label Studio tasks), kept readable: no `\\u` escapes."""
    write_text(path, json.dumps(data, ensure_ascii=False, indent=1) + "\n")


def read_jsonl[M: BaseModel](path: Path, model: type[M]) -> list[M]:
    out: list[M] = []
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if line.strip():
            where = f"{path}:{n}"
            out.append(_validate(model, _loads(line, where), where))
    return out


def write_jsonl(path: Path, records: Iterable[BaseModel]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [r.model_dump_json(exclude_none=False) for r in records]
    path.write_text("".join(f"{line}\n" for line in lines), encoding="utf-8", newline="\n")


def read_questions(path: Path) -> tuple[QuestionFileHeader, list[Question]]:
    """A question file: a `{"_meta": {...}}` header line with the canary, then one question per line."""
    lines = [(n, line) for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1) if line.strip()]
    if not lines:
        raise FormatError(f"{path}: empty question file")
    first = _loads(lines[0][1], f"{path}:{lines[0][0]}")
    if not isinstance(first, dict) or "_meta" not in first:
        raise FormatError(f"{path}:{lines[0][0]}: first line must be the {{\"_meta\": ...}} header with the canary")
    header = _validate(QuestionFileHeader, first["_meta"], f"{path}:{lines[0][0]}")
    questions = [_validate(Question, _loads(line, f"{path}:{n}"), f"{path}:{n}") for n, line in lines[1:]]
    return header, questions


def write_questions(path: Path, header: QuestionFileHeader, questions: Iterable[Question]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps({"_meta": header.model_dump(mode="json")}, ensure_ascii=False)]
    lines += [q.model_dump_json() for q in questions]
    path.write_text("".join(f"{line}\n" for line in lines), encoding="utf-8", newline="\n")


def read_qrels(path: Path) -> list[QrelLine]:
    out: list[QrelLine] = []
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        parts = line.split()
        if not parts:
            continue
        if len(parts) != 4:
            raise FormatError(f"{path}:{n}: qrels line needs 4 fields (qid 0 chunk_key grade)")
        out.append(_validate(QrelLine, {"qid": parts[0], "chunk_key": parts[2], "grade": parts[3]}, f"{path}:{n}"))
    return out


def write_qrels(path: Path, lines: Iterable[QrelLine]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(f"{q.qid} 0 {q.chunk_key} {q.grade}\n" for q in lines), encoding="utf-8", newline="\n")


def read_run(path: Path) -> list[RunLine]:
    out: list[RunLine] = []
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        parts = line.split()
        if not parts:
            continue
        if len(parts) != 6:
            raise FormatError(f"{path}:{n}: run line needs 6 fields (qid Q0 chunk_key rank score tag)")
        data = {"qid": parts[0], "chunk_key": parts[2], "rank": parts[3], "score": parts[4], "tag": parts[5]}
        out.append(_validate(RunLine, data, f"{path}:{n}"))
    return out


def write_run(path: Path, lines: Iterable[RunLine]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = "".join(f"{r.qid} Q0 {r.chunk_key} {r.rank} {r.score} {r.tag}\n" for r in lines)
    path.write_text(text, encoding="utf-8", newline="\n")
