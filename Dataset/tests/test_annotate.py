"""`annotate`: questions → Label Studio tasks → Label Studio export → questions and labels, losing no field (spec user stories 41-46, 51)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from conftest import CANARY, question, span

from seclearn_eval import annotate
from seclearn_eval.cli import main
from seclearn_eval.clusters import build_cluster_map
from seclearn_eval.io import FormatError, read_jsonl, read_questions, write_jsonl, write_questions
from seclearn_eval.schema import Label, PoolEntry, QuestionFileHeader
from seclearn_eval.snapshot import load_snapshot
from seclearn_eval.units import build_units

DATASET = Path(__file__).parents[1]
REAL = DATASET / "corpus" / "2026-10-18-owasp"
OFFSET_TEST = DATASET / "annotation" / "offset-test" / "questions.jsonl"
GUIDELINE = DATASET / "annotation" / "guideline-v0.md"
SESSION = "Session_Management_Cheat_Sheet"
#: Comes after the 🙂 in the Introduction unit (shown as one source), so its UTF-16 offsets are one more than its code point offsets.
AFTER_EMOJI = "A session is a sequence of network HTTP request and response transactions associated with the same user."


def utf16(text: str, codepoint_index: int) -> int:
    """What a browser's JS string index is for a Python string index."""
    return len(text[:codepoint_index].encode("utf-16-le")) // 2


def ls_span(task: dict, source: int, quote: str, label: str = "Bằng chứng", unit: str = "codepoint") -> dict:
    """A region as Label Studio's `<Text>` + `<Labels>` export it. Label Studio 1.13.1 counts code points on the shown
    text (measured in ticket 06: 2011 / 2082 after the 🙂, not 2012 / 2083); `unit="utf16"` mimics a browser's count."""
    text = task["data"][f"source_{source}"]
    at = text.index(quote)
    start, end = (utf16(text, at), utf16(text, at + len(quote))) if unit == "utf16" else (at, at + len(quote))
    value = {"start": start, "end": end, "text": quote, "labels": [label]}
    return {"id": f"r{source}{at}", "from_name": f"span_{source}", "to_name": f"source_{source}", "type": "labels", "value": value}


def ls_choice(name: str, choice: str) -> dict:
    return {"id": f"c-{name}", "from_name": name, "to_name": "question", "type": "choices", "value": {"choices": [choice]}}


def ls_text(name: str, text: str) -> dict:
    return {"id": f"t-{name}", "from_name": name, "to_name": "question", "type": "textarea", "value": {"text": [text]}}


def ls_annotation(result: list[dict], completed_by: int = 1, lead_time: float = 95.5, cancelled: bool = False) -> dict:
    return {
        "id": 11,
        "completed_by": completed_by,
        "result": result,
        "was_cancelled": cancelled,
        "ground_truth": False,
        "created_at": "2026-10-20T08:00:00.000000Z",
        "updated_at": "2026-10-20T08:01:35.500000Z",
        "lead_time": lead_time,
    }


def ls_export(tasks: list[dict], annotations: dict[str, list[dict]], tmp_path: Path) -> Path:
    """What Label Studio's JSON export gives back for the imported tasks."""
    exported = []
    for n, task in enumerate(tasks, start=1):
        exported.append({"id": n, "data": task["data"], "annotations": annotations.get(task["data"]["question_id"], []), "predictions": []})
    out = tmp_path / "export.json"
    out.write_text(json.dumps(exported, ensure_ascii=False), encoding="utf-8")
    return out


def review_setup(snap_dir: Path, tmp_path: Path):
    snap = load_snapshot(snap_dir)
    units = tmp_path / "units.jsonl"
    write_jsonl(units, build_units(snap, build_cluster_map(snap.manifest))[0])
    q1 = question("q1", "test", "auth", "L1", [span(snap_dir, SESSION, "at least 128 bits (16 bytes)")])
    q1 = q1.model_copy(update={"unit_ids": [f"{SESSION}#s00"], "review": q1.review.model_copy(update={"status": "pending", "annotator": None})})
    q2 = question("q2", "test", "auth", "L1", [span(snap_dir, SESSION, "The Secure cookie attribute")])
    q2 = q2.model_copy(update={"unit_ids": [f"{SESSION}#s02"]})
    header = QuestionFileHeader(canary=CANARY, eval_version="1.0.0", snapshot_id="2026-10-18-mini")
    questions = tmp_path / "candidates.jsonl"
    write_questions(questions, header, [q1, q2])
    guideline = tmp_path / "guideline.md"
    guideline.write_text("# Hướng dẫn\n\nguideline_version: v0\n", encoding="utf-8")
    return snap, units, questions, guideline, header, q1, q2


def export_review(snap_dir: Path, units: Path, questions: Path, guideline: Path, tmp_path: Path) -> list[dict]:
    tasks_file = tmp_path / "tasks.json"
    argv = ["annotate", "export", "--snapshot", str(snap_dir), "--questions", str(questions), "--units", str(units)]
    assert main([*argv, "--guideline", str(guideline), "--out", str(tasks_file)]) == 0
    return json.loads(tasks_file.read_text(encoding="utf-8"))


def import_review(snap_dir: Path, questions: Path, export: Path, tmp_path: Path) -> tuple[int, Path, Path]:
    out, labels = tmp_path / "reviewed.jsonl", tmp_path / "judgments" / "labels.jsonl"
    argv = ["annotate", "import", "--snapshot", str(snap_dir), "--questions", str(questions), "--export", str(export)]
    return main([*argv, "--out", str(out), "--labels", str(labels)]), out, labels


def test_round_trip_keeps_every_field_and_code_point_offsets(snap_dir, tmp_path):
    snap, units, questions, guideline, header, q1, q2 = review_setup(snap_dir, tmp_path)
    tasks = export_review(snap_dir, units, questions, guideline, tmp_path)
    assert [t["data"]["question_id"] for t in tasks] == ["q1", "q2"]

    result = [
        ls_choice("question_check", "Tự đứng được"),
        ls_span(tasks[0], 0, AFTER_EMOJI),
        ls_choice("decision", "Sửa"),
        ls_choice("level", "L3"),
        ls_text("answer", "Mã phiên dài ít nhất 128 bit (16 byte)."),
        ls_text("notes", "đáp án LLM thiếu đơn vị"),
    ]
    export = ls_export(tasks, {"q1": [ls_annotation(result)]}, tmp_path)
    code, out, labels = import_review(snap_dir, questions, export, tmp_path)
    assert code == 0

    got_header, (got1, got2) = read_questions(out)
    assert got_header == header
    assert got2 == q2
    when = datetime(2026, 10, 20, 8, 1, 35, 500000, tzinfo=UTC)
    expected_span = span(snap_dir, SESSION, AFTER_EMOJI)
    assert expected_span.char_start == snap.markdown[SESSION].index(AFTER_EMOJI)
    assert got1 == q1.model_copy(
        update={
            "gold_evidence": [expected_span],
            "reference_answer": "Mã phiên dài ít nhất 128 bit (16 byte).",
            "strata": q1.strata.model_copy(update={"level": "L3"}),
            "review": q1.review.model_copy(
                update={
                    "status": "edited",
                    "annotator": "1",
                    "guideline_version": "v0",
                    "lead_time": 95.5,
                    "annotated_at": when,
                    "notes": "đáp án LLM thiếu đơn vị",
                    "question_check": "ok",
                }
            ),
        }
    )
    assert read_jsonl(labels, Label) == [
        Label(
            question_id="q1",
            task="review",
            annotator="1",
            annotated_at=when,
            lead_time=95.5,
            guideline_version="v0",
            snapshot_id="2026-10-18-mini",
        )
    ]


def test_offsets_read_in_the_wrong_unit_fail_instead_of_shifting_spans(snap_dir, tmp_path, capsys):
    _, units, questions, guideline, *_ = review_setup(snap_dir, tmp_path)
    tasks = export_review(snap_dir, units, questions, guideline, tmp_path)
    export = ls_export(tasks, {"q1": [ls_annotation([ls_span(tasks[0], 0, AFTER_EMOJI)])]}, tmp_path)
    out, labels = tmp_path / "reviewed.jsonl", tmp_path / "labels.jsonl"
    argv = ["annotate", "import", "--snapshot", str(snap_dir), "--questions", str(questions), "--export", str(export)]
    assert main([*argv, "--out", str(out), "--labels", str(labels), "--offset-unit", "utf16"]) == 1
    assert "offset" in capsys.readouterr().err
    assert not out.exists() and not labels.exists()


def test_utf16_offsets_still_import_when_asked(snap_dir, tmp_path):
    # Another Label Studio version may count UTF-16 units like the browser does.
    _, units, questions, guideline, *_ = review_setup(snap_dir, tmp_path)
    tasks = export_review(snap_dir, units, questions, guideline, tmp_path)
    export = ls_export(tasks, {"q1": [ls_annotation([ls_span(tasks[0], 0, AFTER_EMOJI, unit="utf16")])]}, tmp_path)
    out, labels = tmp_path / "reviewed.jsonl", tmp_path / "labels.jsonl"
    argv = ["annotate", "import", "--snapshot", str(snap_dir), "--questions", str(questions), "--export", str(export)]
    assert main([*argv, "--out", str(out), "--labels", str(labels), "--offset-unit", "utf16"]) == 0
    (got, _), = [read_questions(out)[1]]
    assert got.gold_evidence[0] == span(snap_dir, SESSION, AFTER_EMOJI)


def test_skipped_task_stays_pending_and_reimport_adds_no_labels(snap_dir, tmp_path):
    _, units, questions, guideline, _, q1, q2 = review_setup(snap_dir, tmp_path)
    tasks = export_review(snap_dir, units, questions, guideline, tmp_path)
    export = ls_export(
        tasks,
        {"q1": [ls_annotation([ls_choice("decision", "Chấp nhận")])], "q2": [ls_annotation([], cancelled=True)]},
        tmp_path,
    )
    assert import_review(snap_dir, questions, export, tmp_path)[0] == 0
    code, out, labels = import_review(snap_dir, questions, export, tmp_path)
    assert code == 0
    _, (got1, got2) = read_questions(out)
    assert got1.review.status == "accepted" and got1.gold_evidence == q1.gold_evidence
    assert got2 == q2
    assert [lab.question_id for lab in read_jsonl(labels, Label)] == ["q1"]


def test_l4_pair_cells_and_l6c_refuting_span(snap_dir, tmp_path):
    _, units, _, guideline, header, *_ = review_setup(snap_dir, tmp_path)
    cookies = "The HttpOnly cookie attribute instructs web browsers not to allow scripts to access the cookies"
    wstg = "Testers should check that the Secure, HttpOnly and SameSite attributes are set on session cookies."
    l4 = question("q4", "test", "auth", "L4", []).model_copy(update={"unit_ids": [f"{SESSION}#s02", "wstg-v4.2#WSTG-SESS-02"]})
    l6 = question("q6", "test", "auth", "L6", [], seed_id="q4")
    l6 = l6.model_copy(update={"unit_ids": [f"{SESSION}#s00"], "reference_answer": None})
    questions = tmp_path / "pair.jsonl"
    write_questions(questions, header, [l4, l6])
    tasks = export_review(snap_dir, units, questions, guideline, tmp_path)
    assert tasks[0]["data"]["source_1"].startswith("## WSTG-SESS-02")
    assert tasks[1]["data"]["source_1"] == "(không có đoạn nguồn thứ hai)"

    annotations = {
        "q4": [ls_annotation([ls_span(tasks[0], 0, cookies, "Ô 1"), ls_span(tasks[0], 1, wstg, "Ô 2")])],
        "q6": [ls_annotation([ls_span(tasks[1], 0, AFTER_EMOJI, "Bác bỏ tiền đề"), ls_choice("l6_kind", "Tiền đề sai")])],
    }
    code, out, _ = import_review(snap_dir, questions, ls_export(tasks, annotations, tmp_path), tmp_path)
    assert code == 0
    _, (got4, got6) = read_questions(out)
    assert got4.gold_evidence == [
        span(snap_dir, SESSION, cookies).model_copy(update={"cell": 0}),
        span(snap_dir, "wstg-v4.2", wstg).model_copy(update={"cell": 1}),
    ]
    assert got6.gold_evidence == [span(snap_dir, SESSION, AFTER_EMOJI).model_copy(update={"refutes": True})]
    assert got6.strata.l6_kind == "false_premise"


def test_pool_round_trip_grades_blind(snap_dir, tmp_path):
    _, _, questions, guideline, *_ = review_setup(snap_dir, tmp_path)
    pool = tmp_path / "pool.jsonl"
    entries = [
        PoolEntry(question_id="q1", chunk_key=f"{SESSION}#1", systems=["bm25"], covers_gold=True, llm_grade=3),
        PoolEntry(question_id="q1", chunk_key=f"{SESSION}#2", systems=["bge-m3-vi"], covers_gold=False, llm_grade=0),
    ]
    write_jsonl(pool, entries)
    tasks_file = tmp_path / "pool-tasks.json"
    argv = ["annotate", "export", "--kind", "pool", "--snapshot", str(snap_dir), "--questions", str(questions)]
    assert main([*argv, "--pool", str(pool), "--guideline", str(guideline), "--out", str(tasks_file)]) == 0
    tasks = json.loads(tasks_file.read_text(encoding="utf-8"))
    assert [t["data"]["chunk_key"] for t in tasks] == [f"{SESSION}#1", f"{SESSION}#2"]
    assert all("llm" not in key for t in tasks for key in t["data"])

    def graded(task: dict, n: int, choice: str) -> dict:
        result = [{"from_name": "grade", "to_name": "chunk", "type": "choices", "value": {"choices": [choice]}}]
        return {**task, "id": n, "annotations": [ls_annotation(result, completed_by=2, lead_time=12.0)]}

    choices = ["2 - Có đáp án nhưng lẫn / không rõ", "0 - Không liên quan"]
    export = tmp_path / "pool-export.json"
    export.write_text(json.dumps([graded(t, n, c) for n, (t, c) in enumerate(zip(tasks, choices, strict=True))], ensure_ascii=False), encoding="utf-8")
    labels = tmp_path / "labels.jsonl"
    argv = ["annotate", "import", "--kind", "pool", "--snapshot", str(snap_dir), "--export", str(export)]
    assert main([*argv, "--labels", str(labels)]) == 0
    got = read_jsonl(labels, Label)
    assert [(lab.chunk_key, lab.grade, lab.annotator, lab.lead_time, lab.guideline_version, lab.task) for lab in got] == [
        (f"{SESSION}#1", 2, "2", 12.0, "v0", "pool"),
        (f"{SESSION}#2", 0, "2", 12.0, "v0", "pool"),
    ]


def test_annotation_without_a_timestamp_is_a_format_error(snap_dir, tmp_path):
    _, units, questions, guideline, *_ = review_setup(snap_dir, tmp_path)
    tasks = export_review(snap_dir, units, questions, guideline, tmp_path)
    undated = {k: v for k, v in ls_annotation([ls_choice("decision", "Chấp nhận")]).items() if k not in ("created_at", "updated_at")}
    export = ls_export(tasks, {"q1": [undated]}, tmp_path)
    with pytest.raises(FormatError, match=r"q1.*(updated_at|created_at)"):
        annotate.read_export(export)


def test_two_tasks_for_one_question_are_an_error_not_a_silent_pick(snap_dir, tmp_path, capsys):
    _, units, questions, guideline, *_ = review_setup(snap_dir, tmp_path)
    tasks = export_review(snap_dir, units, questions, guideline, tmp_path)
    # The same question imported twice into the project: two tasks, each annotated.
    annotations = {"q1": [ls_annotation([ls_choice("decision", "Chấp nhận")])]}
    code, out, labels = import_review(snap_dir, questions, ls_export([tasks[0], tasks[0]], annotations, tmp_path), tmp_path)
    assert code == 1
    assert "q1" in capsys.readouterr().err
    assert not out.exists() and not labels.exists()


@pytest.mark.skipif(not REAL.exists(), reason="real snapshot not checked out")
def test_offset_test_task_on_the_real_snapshot(tmp_path):
    """The task the human marks in real Label Studio (ticket 06, criterion 2): a span after the 🙂 in NodeJS_Docker_Cheat_Sheet."""
    tasks_file = tmp_path / "tasks.json"
    argv = ["annotate", "export", "--snapshot", str(REAL), "--questions", str(OFFSET_TEST)]
    assert main([*argv, "--guideline", str(GUIDELINE), "--out", str(tasks_file)]) == 0
    tasks = json.loads(tasks_file.read_text(encoding="utf-8"))
    sentence = "Build arguments passed like that to Docker are kept in the history log."
    region = ls_span(tasks[0], 0, sentence)
    # What real Label Studio 1.13.1 exported for this sentence (ticket 06): code points, one less than UTF-16's 2012 / 2083.
    assert (region["value"]["start"], region["value"]["end"]) == (2011, 2082)

    export = ls_export(tasks, {"offset-test-1": [ls_annotation([region])]}, tmp_path)
    code, out, _ = import_review(REAL, OFFSET_TEST, export, tmp_path)
    assert code == 0
    [got] = read_questions(out)[1]
    assert [(s.char_start, s.char_end, s.quote) for s in got.gold_evidence] == [(19397, 19468, sentence)]
