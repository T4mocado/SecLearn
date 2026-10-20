"""`judge grade` / `judge expand`: Gemini grades the whole pool through a scripted client, the human's share is picked
reproducibly, and chunks the human graded 2-3 outside the gold become new gold spans."""

from __future__ import annotations

import re
from dataclasses import replace
from datetime import UTC, datetime

import pytest
from conftest import CANARY, MINI, question, span

from seclearn_eval.cli import main
from seclearn_eval.io import read_jsonl, read_questions, write_jsonl, write_questions
from seclearn_eval.judge import expand_gold, grade_pool, select_for_human
from seclearn_eval.llm import CachedClient, FakeClient, LLMError
from seclearn_eval.prompts import JUDGE_VERSION, pool_judge_prompt
from seclearn_eval.schema import Label, PoolEntry, QuestionFileHeader
from seclearn_eval.snapshot import load_snapshot
from seclearn_eval.spans import quote_at

SESS = "Session_Management_Cheat_Sheet"
T0 = datetime(2026, 11, 1, tzinfo=UTC)


@pytest.fixture
def snap():
    return load_snapshot(MINI)


def entry(qid: str, chunk: str, llm: int | None = None) -> PoolEntry:
    return PoolEntry(question_id=qid, chunk_key=chunk, systems=["bm25"], covers_gold=False, llm_grade=llm, chunker_version="sentence-v2")


def gemini(grades: dict[str, int]) -> FakeClient:
    """Grades a chunk by a phrase of its text found in the prompt; 0 otherwise."""

    def reply(prompt, schema):
        grade = next((g for phrase, g in grades.items() if phrase in prompt), 0)
        return {"needed": "…", "found": "…", "grade": grade}

    return FakeClient(model="gemini-fake", reply=reply)


def test_the_judge_prompt_has_numbered_steps_and_a_definition_for_every_grade_and_a_version():
    prompt = pool_judge_prompt("Session ID cần dài bao nhiêu?", "How long must a session ID be?", "## Session ID Properties\n…")
    steps = re.findall(r"^(\d)\. ", prompt, re.MULTILINE)
    assert steps[:4] == ["1", "2", "3", "4"]
    for grade in "0123":
        assert re.search(rf"^{grade}( =|:) \S.{{20,}}", prompt, re.MULTILINE), f"grade {grade} is not defined in words"
    assert "Session ID cần dài bao nhiêu?" in prompt and "## Session ID Properties" in prompt
    assert re.fullmatch(r"judge-\w+-v\d+", JUDGE_VERSION)


def test_gemini_grades_every_pool_entry_and_the_model_and_prompt_version_are_kept(snap):
    q = question("q1", "test", "auth", "L1", [])
    pool = [entry("q1", f"{SESS}#1"), entry("q1", f"{SESS}#2"), entry("q1", f"{SESS}#3")]
    client = gemini({"at least 128 bits": 3, "HttpOnly cookie attribute": 1})
    graded = grade_pool(pool, [q], snap, client)
    assert [e.llm_grade for e in graded] == [3, 1, 0]
    assert {(e.llm_model, e.llm_prompt_version) for e in graded} == {("gemini-fake", JUDGE_VERSION)}
    assert len(client.calls) == 3 and all("Câu hỏi q1?" in c.prompt for c in client.calls)


def test_grading_again_is_answered_from_the_cache(snap, tmp_path):
    q = question("q1", "test", "auth", "L1", [])
    pool = [entry("q1", f"{SESS}#1"), entry("q1", f"{SESS}#2")]
    inner = gemini({"at least 128 bits": 3})
    first = grade_pool(pool, [q], snap, CachedClient(inner, tmp_path / "cache"))
    again = CachedClient(inner, tmp_path / "cache")
    assert grade_pool(pool, [q], snap, again) == first
    assert (again.hits, again.misses, len(inner.calls)) == (2, 0, 2)


def test_only_pool_entries_without_a_grade_go_to_the_judge(snap):
    """A grown pool keeps its old grades (`pool`): grading it again sends only the new entries to Gemini."""
    q = question("q1", "test", "auth", "L1", [])
    old = entry("q1", f"{SESS}#1", 2).model_copy(update={"llm_model": "gemini-old", "llm_prompt_version": "judge-old-v0", "for_human": True})
    client = gemini({"at least 128 bits": 3})
    graded = grade_pool([old, entry("q1", f"{SESS}#2")], [q], snap, client)
    assert graded[0] == old
    assert (graded[1].llm_grade, graded[1].llm_model) == (0, "gemini-fake")
    assert len(client.calls) == 1


def test_a_grade_outside_0_to_3_is_an_error(snap):
    q = question("q1", "test", "auth", "L1", [])
    bad = FakeClient(model="gemini-fake", reply=lambda p, s: {"needed": "", "found": "", "grade": 5})
    with pytest.raises(LLMError):
        grade_pool([entry("q1", f"{SESS}#1")], [q], snap, bad)


def pool_of(n_zero: int, n_positive: int) -> list[PoolEntry]:
    zeros = [entry(f"q{i % 7}", f"doc#{i}", 0) for i in range(n_zero)]
    positives = [entry(f"q{i % 7}", f"pos#{i}", 1 + i % 3) for i in range(n_positive)]
    return zeros + positives


def human_keys(pool: list[PoolEntry]) -> set[tuple[str, str]]:
    return {(e.question_id, e.chunk_key) for e in pool if e.for_human}


def test_the_human_gets_every_gemini_positive_and_a_fixed_seed_tenth_of_the_zeros():
    pool = pool_of(95, 12)
    picked = select_for_human(pool, rate=0.1, seed=20261020)
    zeros = [e for e in picked if e.for_human and e.llm_grade == 0]
    assert len(zeros) == 10  # ceil(9.5)
    assert all(e.for_human for e in picked if e.llm_grade >= 1)
    # Same seed: same sample, whatever the order of the pool file.
    assert human_keys(select_for_human(list(reversed(pool)), rate=0.1, seed=20261020)) == human_keys(picked)
    assert human_keys(select_for_human(pool, rate=0.1, seed=7)) != human_keys(picked)


def test_choosing_again_keeps_the_zeros_already_sampled():
    """Re-running `judge grade` on a pool the human already started must not move the sample."""
    pool = select_for_human(pool_of(95, 12), rate=0.1, seed=1)
    bigger = pool + [entry("q9", f"new#{i}", 0) for i in range(10)]
    again = select_for_human(bigger, rate=0.1, seed=1)
    assert human_keys(pool) <= human_keys(again)
    assert sum(e.for_human and e.llm_grade == 0 for e in again) == 11  # ceil(10.5)


# --- Gold expansion ------------------------------------------------------------------------------


def label(chunk: str, grade: int) -> Label:
    return Label(question_id="q1", task="pool", chunk_key=chunk, grade=grade, annotator="me", annotated_at=T0,
                 guideline_version="v1", snapshot_id="2026-10-18-mini")


def test_a_chunk_graded_2_or_3_outside_the_gold_becomes_a_new_gold_span(snap):
    gold = span(MINI, SESS, "at least 128 bits (16 bytes)")
    q = question("q1", "test", "auth", "L1", [gold])
    labels = [label(f"{SESS}#1", 3), label(f"{SESS}#2", 3), label(f"{SESS}#3", 1), label("wstg-v4.2#4", 2)]
    [out], added = expand_gold([q], labels, snap)
    assert added == 2
    new = [s for s in out.gold_evidence if s.source == "pool"]
    assert {(s.doc_key, s.char_start, s.char_end, s.grade) for s in new} == {(SESS, 550, 795, 3), ("wstg-v4.2", 872, 1053, 2)}
    assert all(quote_at(snap.markdown[s.doc_key], s, s.quote) for s in new)
    # Expanding again adds nothing.
    assert expand_gold([out], labels, snap)[1] == 0


def test_a_labelled_chunk_whose_document_is_not_in_the_snapshot_is_a_format_error(snap):
    from seclearn_eval.io import FormatError

    q = question("q1", "test", "auth", "L1", [])
    docs = [d for d in snap.manifest.documents if d.doc_key != SESS]
    broken = replace(snap, manifest=snap.manifest.model_copy(update={"documents": docs}))
    with pytest.raises(FormatError, match=SESS):
        expand_gold([q], [label(f"{SESS}#1", 3)], broken)


def test_the_commands_grade_pick_and_expand_through_files(snap_dir, tmp_path, monkeypatch):
    from seclearn_eval import cli

    gold = span(snap_dir, SESS, "at least 128 bits (16 bytes)")
    questions = tmp_path / "test.jsonl"
    write_questions(questions, QuestionFileHeader(canary=CANARY, eval_version="1.0.0", snapshot_id="2026-10-18-mini"),
                    [question("q1", "test", "auth", "L1", [gold])])
    pool = tmp_path / "pool.jsonl"
    write_jsonl(pool, [entry("q1", f"{SESS}#{i}") for i in range(4)])
    monkeypatch.setattr(cli, "make_clients", lambda config, cache: {"judge": gemini({"at least 128 bits": 3, "SameSite attribute lets": 2})})
    common = ["--snapshot", str(snap_dir), "--questions", str(questions)]
    human = tmp_path / "pool-human.jsonl"
    config = MINI.parents[2] / "llm-config.json"
    assert main(["judge", "grade", *common, "--config", str(config), "--pool", str(pool), "--human-out", str(human), "--no-cache"]) == 0
    graded = read_jsonl(pool, PoolEntry)
    assert [e.llm_grade for e in graded] == [0, 3, 0, 2]
    picked = [e.chunk_key for e in read_jsonl(human, PoolEntry)]
    assert len(picked) == 3 and {f"{SESS}#1", f"{SESS}#3"} <= set(picked)  # both positives, ceil(10% of 2 zeros) = 1

    labels = tmp_path / "labels.jsonl"
    write_jsonl(labels, [label(f"{SESS}#3", 2)])
    out = tmp_path / "expanded.jsonl"
    assert main(["judge", "expand", *common, "--labels", str(labels), "--out", str(out)]) == 0
    [q] = read_questions(out)[1]
    assert [(s.char_start, s.source) for s in q.gold_evidence] == [(gold.char_start, "review"), (796, "pool")]

    report = tmp_path / "agreement.json"
    assert main(["judge", "agreement", "--pool", str(pool), "--labels", str(labels), "--out", str(report)]) == 0
    assert report.with_suffix(".md").read_text(encoding="utf-8").startswith("# Độ đồng ý")
