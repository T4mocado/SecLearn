"""`qrels`: gold spans → TREC qrels for one chunker_version, by the 50% / whole-span rule, human pool labels on top.

Chunks of the mini snapshot used here (body offsets, sentence-v2):
  Session_Management_Cheat_Sheet#1  262-537
  Session_Management_Cheat_Sheet#2  550-795
  Session_Management_Cheat_Sheet#3  796-893
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from conftest import CANARY, MINI, question, span

from seclearn_eval.cli import main
from seclearn_eval.io import read_qrels, write_jsonl, write_questions, write_run
from seclearn_eval.qrels import build_qrels, verify_generated
from seclearn_eval.schema import GoldSpan, Label, PoolEntry, QrelLine, QuestionFileHeader, RunLine
from seclearn_eval.snapshot import load_snapshot

SESS = "Session_Management_Cheat_Sheet"
T0 = datetime(2026, 11, 1, tzinfo=UTC)


@pytest.fixture
def snap():
    return load_snapshot(MINI)


def raw_span(snap, start: int, end: int, grade: int = 2) -> GoldSpan:
    md = snap.markdown[SESS]
    return GoldSpan(doc_key=SESS, md_sha256=snap.document(SESS).md_sha256, char_start=start, char_end=end, quote=md[start:end], grade=grade)


def lines(result) -> set[tuple[str, str, int]]:
    return {(lab.qid, lab.chunk_key, lab.grade) for lab in result.lines}


def pool_label(qid: str, chunk: str, grade: int, at: datetime = T0) -> Label:
    return Label(question_id=qid, task="pool", chunk_key=chunk, grade=grade, annotator="me", annotated_at=at,
                 guideline_version="v1", snapshot_id="2026-10-18-mini")


def entry(qid: str, chunk: str, llm_grade: int, chunker: str = "sentence-v2") -> PoolEntry:
    return PoolEntry(question_id=qid, chunk_key=chunk, systems=["bm25"], covers_gold=False, llm_grade=llm_grade, chunker_version=chunker)


def test_a_span_inside_one_chunk_makes_that_chunk_relevant_with_the_span_grade(snap):
    q = question("q1", "test", "auth", "L1", [span(MINI, SESS, "at least 128 bits (16 bytes)")])
    q.gold_evidence[0].grade = 3
    assert lines(build_qrels([q], snap, [], [])) == {("q1", f"{SESS}#1", 3)}


def test_a_span_across_two_chunks_goes_to_the_chunk_holding_at_least_half_of_it(snap):
    # 791-801: #2 holds 791-795 (4 of 10), #3 holds 796-801 (5 of 10, exactly half).
    q = question("q1", "test", "auth", "L1", [raw_span(snap, 791, 801)])
    assert lines(build_qrels([q], snap, [], [])) == {("q1", f"{SESS}#3", 2)}
    # 789-801: #2 holds 6 of 12, #3 holds 5 of 12.
    q = question("q1", "test", "auth", "L1", [raw_span(snap, 789, 801)])
    assert lines(build_qrels([q], snap, [], [])) == {("q1", f"{SESS}#2", 2)}


def test_a_chunk_relevant_to_two_spans_keeps_the_higher_grade(snap):
    q = question("q1", "test", "auth", "L1", [raw_span(snap, 300, 320, grade=1), raw_span(snap, 400, 420, grade=3)])
    assert lines(build_qrels([q], snap, [], [])) == {("q1", f"{SESS}#1", 3)}


def test_human_pool_labels_override_and_add_and_the_latest_label_wins(snap):
    q = question("q1", "test", "auth", "L1", [span(MINI, SESS, "at least 128 bits (16 bytes)")])
    pool = [entry("q1", f"{SESS}#1", 3), entry("q1", f"{SESS}#2", 2), entry("q1", f"{SESS}#3", 0)]
    labels = [
        pool_label("q1", f"{SESS}#1", 1),  # the gold chunk, demoted by the annotator
        pool_label("q1", f"{SESS}#2", 0),
        pool_label("q1", f"{SESS}#2", 3, T0 + timedelta(days=8)),  # graded again later
    ]
    assert lines(build_qrels([q], snap, pool, labels)) == {
        ("q1", f"{SESS}#1", 1),
        ("q1", f"{SESS}#2", 3),
        ("q1", f"{SESS}#3", 0),  # Gemini's 0, not graded by a human: judged, not relevant
    }


def test_labels_made_on_another_snapshot_are_not_applied_even_when_later(snap):
    q = question("q1", "test", "auth", "L1", [span(MINI, SESS, "at least 128 bits (16 bytes)")])
    pool = [entry("q1", f"{SESS}#2", 2)]
    other = pool_label("q1", f"{SESS}#2", 0, T0 + timedelta(days=8)).model_copy(update={"snapshot_id": "2026-09-01-old"})
    labels = [pool_label("q1", f"{SESS}#2", 3), other]
    assert lines(build_qrels([q], snap, pool, labels)) == {("q1", f"{SESS}#1", 2), ("q1", f"{SESS}#2", 3)}


def test_labels_from_a_pool_on_another_chunker_are_not_applied(snap):
    q = question("q1", "test", "auth", "L1", [span(MINI, SESS, "at least 128 bits (16 bytes)")])
    pool = [entry("q1", f"{SESS}#2", 2, chunker="sentence-v1")]
    result = build_qrels([q], snap, pool, [pool_label("q1", f"{SESS}#2", 3)])
    assert lines(result) == {("q1", f"{SESS}#1", 2)}
    assert any("sentence-v1" in w for w in result.warnings)


def test_rejected_and_unanswerable_questions_get_no_qrels_and_lines_are_sorted(snap):
    keep = question("q2", "test", "auth", "L1", [span(MINI, SESS, "at least 128 bits (16 bytes)")])
    first = question("q1", "test", "auth", "L1", [raw_span(snap, 560, 600), raw_span(snap, 300, 320)])
    rejected = question("q3", "test", "auth", "L1", [span(MINI, SESS, "at least 128 bits (16 bytes)")])
    rejected.review.status = "rejected"
    l6 = question("q4", "test", None, "L6", [])
    result = build_qrels([keep, rejected, l6, first], snap, [], [])
    assert result.lines == [
        QrelLine(qid="q1", chunk_key=f"{SESS}#1", grade=2),
        QrelLine(qid="q1", chunk_key=f"{SESS}#2", grade=2),
        QrelLine(qid="q2", chunk_key=f"{SESS}#1", grade=2),
    ]


# --- The command: files in, files out ------------------------------------------------------------


def qrels_files(snap_dir, tmp_path):
    q = question("q1", "test", "auth", "L1", [span(snap_dir, SESS, "at least 128 bits (16 bytes)")])
    files = {"questions": tmp_path / "test.jsonl", "pool": tmp_path / "pool.jsonl", "labels": tmp_path / "labels.jsonl"}
    write_questions(files["questions"], QuestionFileHeader(canary=CANARY, eval_version="1.0.0", snapshot_id="2026-10-18-mini"), [q])
    write_jsonl(files["pool"], [entry("q1", f"{SESS}#1", 3), entry("q1", f"{SESS}#2", 2)])
    write_jsonl(files["labels"], [pool_label("q1", f"{SESS}#2", 3)])
    return files


def run_qrels(snap_dir, files, out):
    return main(["qrels", "--snapshot", str(snap_dir), "--questions", str(files["questions"]), "--pool", str(files["pool"]),
                 "--labels", str(files["labels"]), "--out", str(out)])


def test_the_command_writes_trec_qrels_and_a_provenance_file_and_is_reproducible(snap_dir, tmp_path):
    files = qrels_files(snap_dir, tmp_path)
    out = tmp_path / "qrels" / "sentence-v2.qrels"
    assert run_qrels(snap_dir, files, out) == 0
    first = out.read_bytes()
    assert first == f"q1 0 {SESS}#1 2\nq1 0 {SESS}#2 3\n".encode()
    assert [lab.grade for lab in read_qrels(out)] == [2, 3]
    meta = out.with_name(out.name + ".meta.json").read_text(encoding="utf-8")
    assert '"chunker_version": "sentence-v2"' in meta and "test.jsonl" in meta
    assert run_qrels(snap_dir, files, out) == 0
    assert out.read_bytes() == first


def test_qrels_edited_by_hand_are_caught_and_score_refuses_them(snap_dir, tmp_path, capsys):
    files = qrels_files(snap_dir, tmp_path)
    out = tmp_path / "sentence-v2.qrels"
    run_qrels(snap_dir, files, out)
    assert verify_generated(out) is None
    out.write_text(out.read_text(encoding="utf-8").replace(f"{SESS}#2 3", f"{SESS}#2 1"), encoding="utf-8", newline="\n")
    assert "edited" in verify_generated(out)
    run_dir = tmp_path / "runs" / "r1"
    write_run(run_dir / "run.trec", [RunLine(qid="q1", chunk_key=f"{SESS}#1", rank=1, score=1.0, tag="r1")])
    assert main(["score", "--questions", str(files["questions"]), "--qrels", str(out), "--run", str(run_dir)]) == 1
    assert "edited" in capsys.readouterr().err
