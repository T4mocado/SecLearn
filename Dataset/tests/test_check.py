"""`check` passes on a consistent eval set and catches each kind of breakage (spec user story 59)."""

from __future__ import annotations

import json
from pathlib import Path

from conftest import CANARY, question, span

from seclearn_eval.check import CheckInputs, discover, run_checks, skipped
from seclearn_eval.io import read_questions, write_json, write_questions
from seclearn_eval.schema import QuestionFileHeader, RunConfig


def inputs(f: dict[str, Path], **override: object) -> CheckInputs:
    base = dict(snapshot=f["snapshot"], questions=[f["questions"]], units=f["units"], plan=f["plan"], runs=[f["run"]])
    return CheckInputs(**{**base, **override})


def checks_failed(problems) -> set[str]:
    return {p.check for p in problems}


def rewrite_questions(f: dict[str, Path], edit) -> None:
    header, questions = read_questions(f["questions"])
    write_questions(f["questions"], header, edit(questions))


def test_consistent_eval_set_passes(eval_files):
    assert run_checks(inputs(eval_files)) == []


def test_format_bad_json_unknown_field_and_duplicate_ids(eval_files):
    lines = eval_files["questions"].read_text(encoding="utf-8").splitlines()
    eval_files["questions"].write_text("\n".join([*lines, lines[1]]) + "\n", encoding="utf-8")
    assert any("id used 2 times" in p.message for p in run_checks(inputs(eval_files)))

    record = json.loads(lines[1])
    record["levle"] = "L1"
    eval_files["questions"].write_text("\n".join([lines[0], json.dumps(record)]) + "\n", encoding="utf-8")
    problems = [p for p in run_checks(inputs(eval_files)) if p.check == "format"]
    assert len(problems) == 1 and "levle" in problems[0].message


def test_snapshot_markdown_changed_after_export(eval_files):
    md = eval_files["snapshot"] / "md" / "Session_Management_Cheat_Sheet.md"
    md.write_bytes(md.read_bytes().replace(b"tightly linked", b"tightly coupled"))
    assert any("sha256 differs" in p.message for p in run_checks(inputs(eval_files)) if p.check == "snapshot")


def test_snapshot_document_missing_from_snapshot(eval_files):
    manifest_path = eval_files["snapshot"] / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["documents"] = [d for d in manifest["documents"] if d["doc_key"] != "wstg-v4.2"]
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    problems = run_checks(inputs(eval_files))
    assert any("wstg-v4.2 not in the manifest" in p.message for p in problems)
    assert any("q2" in p.message and "not in snapshot" in p.message for p in problems)


def test_quote_moved_or_missing(eval_files):
    def shift(questions):
        s = questions[0].gold_evidence[0]
        moved = s.model_copy(update={"char_start": s.char_start + 5, "char_end": s.char_end + 5})
        return [questions[0].model_copy(update={"gold_evidence": [moved]}), *questions[1:]]

    rewrite_questions(eval_files, shift)
    problems = [p for p in run_checks(inputs(eval_files)) if p.check == "quote"]
    assert len(problems) == 1 and "run `reanchor`" in problems[0].message

    def invent(questions):
        s = questions[0].gold_evidence[0].model_copy(update={"quote": "a quote no document contains"})
        return [questions[0].model_copy(update={"gold_evidence": [s]}), *questions[1:]]

    rewrite_questions(eval_files, invent)
    assert any("0 match(es)" in p.message for p in run_checks(inputs(eval_files)) if p.check == "quote")


def test_coverage_no_chunk_covers_half_the_span(eval_files):
    chunks_path = eval_files["snapshot"] / "chunks.sentence-v2.jsonl"
    rows = [json.loads(line) for line in chunks_path.read_text(encoding="utf-8").splitlines()]
    _, questions = read_questions(eval_files["questions"])
    gold = questions[0].gold_evidence[0]
    # Every chunk of the document shrinks to the span's last 3 characters: none holds half of it.
    for r in rows:
        if r["doc_key"] == gold.doc_key:
            r["char_start"], r["char_end"] = gold.char_end - 3, gold.char_end
    chunks_path.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    assert checks_failed(run_checks(inputs(eval_files))) == {"coverage"}


def test_gold_inside_excluded_region(eval_files, snap_dir):
    refs = span(snap_dir, "Cross-Site_Request_Forgery_Prevention_Cheat_Sheet", "OWASP CSRF page.")
    rewrite_questions(eval_files, lambda qs: [*qs[:1], qs[1].model_copy(update={"gold_evidence": [refs]})])
    problems = [p for p in run_checks(inputs(eval_files)) if p.check == "excluded"]
    assert len(problems) == 1 and "references" in problems[0].message


def test_plan_distribution_off(eval_files, snap_dir):
    extra = question("q3", "test", "inj", "L3", [span(snap_dir, "Session_Management_Cheat_Sheet", "at least 64 bits of entropy")])
    rewrite_questions(eval_files, lambda qs: [qs[0], extra])
    messages = [p.message for p in run_checks(inputs(eval_files)) if p.check == "plan"]
    assert any("1 questions, plan wants 2" in m for m in messages)
    assert any("not in the plan" in m for m in messages)


def test_seed_in_two_splits(eval_files, tmp_path, snap_dir):
    variant = question("q1-l2", "dev", "auth", "L2", [span(snap_dir, "Session_Management_Cheat_Sheet", "at least 128 bits (16 bytes)")], seed_id="q1")
    dev = tmp_path / "questions" / "dev.jsonl"
    write_questions(dev, QuestionFileHeader(canary=CANARY, eval_version="1.0.0", snapshot_id="2026-10-18-mini"), [variant])
    problems = run_checks(inputs(eval_files, questions=[eval_files["questions"], dev]))
    assert [p.message for p in problems if p.check == "split"] == ["seed q1: in splits ['dev', 'test']"]


def test_run_config_missing_or_dirty(eval_files, tmp_path):
    assert "run" in checks_failed(run_checks(inputs(eval_files, runs=[tmp_path / "runs" / "nothing"])))
    config = RunConfig.model_validate_json((eval_files["run"] / "config.json").read_text(encoding="utf-8"))
    write_json(eval_files["run"] / "config.json", config.model_copy(update={"git_dirty": True}))
    assert any("uncommitted" in p.message for p in run_checks(inputs(eval_files)))


def test_canary_missing_or_wrong(eval_files):
    header, questions = read_questions(eval_files["questions"])
    write_questions(eval_files["questions"], header.model_copy(update={"canary": "other"}), questions)
    assert checks_failed(run_checks(inputs(eval_files))) == {"canary"}

    lines = eval_files["questions"].read_text(encoding="utf-8").splitlines()
    eval_files["questions"].write_text("\n".join(lines[1:]) + "\n", encoding="utf-8")
    # The file no longer loads, so its questions also miss from the plan; the canary is what is reported for it.
    problems = [p for p in run_checks(inputs(eval_files)) if p.check == "canary"]
    assert len(problems) == 1 and "header with the canary" in problems[0].message


def test_snapshot_from_uncommitted_app_code(eval_files):
    manifest_path = eval_files["snapshot"] / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["source_git_dirty"] = True
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    assert any("uncommitted app code" in p.message for p in run_checks(inputs(eval_files)) if p.check == "snapshot")


def test_discover_finds_inputs_at_their_usual_places(eval_files, tmp_path):
    root = tmp_path / "evalset"
    qdir = root / "questions" / "v1.0"
    qdir.mkdir(parents=True)
    (qdir / "test.jsonl").write_bytes(eval_files["questions"].read_bytes())
    (qdir / "sample-plan.json").write_bytes(eval_files["plan"].read_bytes())
    (eval_files["snapshot"] / "units.jsonl").write_bytes(eval_files["units"].read_bytes())
    (root / "runs" / "r1").mkdir(parents=True)
    (root / "runs" / "r1" / "config.json").write_bytes((eval_files["run"] / "config.json").read_bytes())

    found = discover(eval_files["snapshot"], root, "v1.0")
    assert found.questions == [qdir / "test.jsonl"]
    assert found.units == eval_files["snapshot"] / "units.jsonl"
    assert found.plan == qdir / "sample-plan.json"
    assert found.runs == [root / "runs" / "r1"]
    assert skipped(found) == [] and run_checks(found) == []


def test_discover_reads_the_split_files_not_the_working_files_beside_them(eval_files, tmp_path):
    # questions/v1.0 also holds candidates (not question files), filtered, pilot, variants…: each a draft of the same
    # questions, so reading them all fails on format and on every id twice.
    qdir = tmp_path / "evalset" / "questions" / "v1.0"
    qdir.mkdir(parents=True)
    for name in ("test.jsonl", "dev.jsonl", "filtered.jsonl", "pilot.jsonl"):
        (qdir / name).write_bytes(eval_files["questions"].read_bytes())
    (qdir / "candidates.jsonl").write_text('{"candidate_id": "x"}\n', encoding="utf-8")
    found = discover(eval_files["snapshot"], tmp_path / "evalset", "v1.0")
    assert found.questions == [qdir / "dev.jsonl", qdir / "test.jsonl"]


def test_skipped_says_what_was_not_checked(eval_files, tmp_path):
    bare = discover(eval_files["snapshot"], tmp_path / "empty", "v1.0")
    assert run_checks(bare) == []
    assert skipped(bare) == [
        "quote, coverage, excluded, split, canary: no question files",
        "plan: no sample-plan.json",
        "run: no runs/<run_id>/ directories",
    ]
    # A plan with no questions yet is not compared (every cell would read 0), and says so.
    with_plan = CheckInputs(snapshot=eval_files["snapshot"], plan=eval_files["plan"])
    assert run_checks(with_plan) == []
    assert "plan: no question files to compare with the plan" in skipped(with_plan)


def test_check_cli_reports_skipped_checks(eval_files, tmp_path, capsys):
    from seclearn_eval.cli import main

    assert main(["check", "--snapshot", str(eval_files["snapshot"]), "--root", str(tmp_path / "empty")]) == 0
    out = capsys.readouterr().out
    assert "skipped: run: no runs/<run_id>/ directories" in out and "check: OK" in out
