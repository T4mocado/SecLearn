"""The 40-question smoke set (quotes from pdftotext, no offsets) moved onto a snapshot as gold spans (spec user story 71)."""

from __future__ import annotations

import json
from pathlib import Path

from conftest import CANARY

from seclearn_eval.check import CheckInputs, run_checks
from seclearn_eval.cli import main
from seclearn_eval.clusters import build_cluster_map
from seclearn_eval.io import read_questions, write_jsonl
from seclearn_eval.smoke import Pick, convert_smoke, read_smoke
from seclearn_eval.snapshot import load_snapshot
from seclearn_eval.units import build_units

SESSION = "Session_Management_Cheat_Sheet"
CSRF = "Cross-Site_Request_Forgery_Prevention_Cheat_Sheet"


def raw(qid: str, level: str, evidence: list[dict], **extra) -> dict:
    """One line of data/eval/set-*.jsonl, as the smoke set was written."""
    record = {
        "id": qid,
        "split": "dev" if "-a" in qid else "test",
        "version": "1.0",
        "question": f"Câu {qid}?",
        "language": "vi",
        "question_style": "accented",
        "turns": [],
        "level": level,
        "type": "lookup",
        "compare_cells": [],
        "answerable": level != "L6",
        "unanswerable_reason": None,
        "reference_answer": "…",
        "reference_claims": ["một ý"],
        "gold_evidence": evidence,
        "source": {"method": "manual", "generator": None, "seed": None, "prompt_version": None},
        "review": {"status": "draft", "annotators": [], "notes": ""},
    }
    return record | extra


def ev(doc: str, quote: str, grade: int = 2, **extra) -> dict:
    return {"document": f"{doc}.pdf", "quote": quote, "grade": grade} | extra


def setup(snap_dir: Path):
    snap = load_snapshot(snap_dir)
    cmap = build_cluster_map(snap.manifest)
    units, _ = build_units(snap, cmap)
    return snap, cmap, units


def test_an_exact_quote_becomes_a_span_on_the_snapshot_markdown(snap_dir):
    snap, cmap, units = setup(snap_dir)
    quote = "The session ID length must be at least 128 bits (16 bytes)."
    [q], unmapped = convert_smoke([raw("seclearn-smoke-a01", "L1", [ev(SESSION, quote)])], snap, units, {})
    assert unmapped == []
    [s] = q.gold_evidence
    md = snap.markdown[SESSION]
    assert md[s.char_start : s.char_end] == quote
    assert s.doc_key == SESSION and s.md_sha256 == snap.document(SESSION).md_sha256 and s.grade == 2
    assert q.cluster == "auth" and q.unit_ids == [f"{SESSION}#s01"]
    assert q.seed_id == q.id and q.split == "dev"
    assert q.strata.level == "L1" and q.strata.answerable and q.strata.gold_source == "cheat_sheet"
    assert q.review.status == "pending" and q.generation.model == "manual"


def test_pdftotext_quote_marks_and_line_wraps_still_match(snap_dir):
    snap, cmap, units = setup(snap_dir)
    # Curly apostrophe and a line break where the markdown has a straight one and a space.
    quote = "causes a user’s web\nbrowser to perform an unwanted action"
    [q], unmapped = convert_smoke([raw("seclearn-smoke-a02", "L1", [ev(CSRF, quote)])], snap, units, {})
    assert unmapped == []
    [s] = q.gold_evidence
    assert s.quote == "causes a user's web browser to perform an unwanted action"
    assert snap.markdown[CSRF][s.char_start : s.char_end] == s.quote
    assert q.cluster == "browser"


def test_a_quote_found_several_times_needs_a_pick_or_is_reported(snap_dir):
    snap, cmap, units = setup(snap_dir)
    quote = "The session ID"  # 4 times in the Session ID Properties section
    record = raw("seclearn-smoke-b01", "L1", [ev(SESSION, quote), ev(SESSION, "at least 64 bits of entropy")])

    [q], unmapped = convert_smoke([record], snap, units, {})
    assert [s.quote for s in q.gold_evidence] == ["at least 64 bits of entropy"]
    assert unmapped == ["seclearn-smoke-b01/0: quote found 4 times in Session_Management_Cheat_Sheet, no pick"]

    [q], unmapped = convert_smoke([record], snap, units, {"seclearn-smoke-b01/0": Pick(occurrence=2, why="t")})
    md = snap.markdown[SESSION]
    assert unmapped == []
    assert md[q.gold_evidence[0].char_start :].startswith("The session ID length")

    [q], _ = convert_smoke([record], snap, units, {"seclearn-smoke-b01/0": Pick(occurrence="all", why="t")})
    assert len(q.gold_evidence) == 5


def test_a_quote_or_document_not_in_the_snapshot_is_reported(snap_dir):
    snap, cmap, units = setup(snap_dir)
    record = raw("seclearn-smoke-b02", "L1", [ev(SESSION, "not in the cheat sheet"), ev("NIST_CSWP_29", "anything")])
    [q], unmapped = convert_smoke([record], snap, units, {})
    assert q.gold_evidence == []
    assert unmapped == [
        "seclearn-smoke-b02/0: quote not found in Session_Management_Cheat_Sheet",
        "seclearn-smoke-b02/1: document NIST_CSWP_29 not in snapshot 2026-10-18-mini",
    ]


def test_l6_kinds_cells_and_turns_carry_over(snap_dir):
    snap, cmap, units = setup(snap_dir)
    ood = raw("seclearn-smoke-a16", "L6", [], type="unanswerable", unanswerable_reason="out_of_domain", reference_answer="Từ chối.")
    premise = raw(
        "seclearn-smoke-a19",
        "L6",
        [ev(SESSION, "The session ID content must be meaningless")],
        type="false_premise",
        unanswerable_reason="false_premise",
    )
    compare = raw(
        "seclearn-smoke-a10",
        "L4",
        [ev(SESSION, "at least 64 bits of entropy", cell=0), ev(CSRF, "The synchronizer token pattern", grade=1, cell=1)],
        type="comparison",
        compare_cells=[{"item": "session", "aspect": "x"}, {"item": "csrf", "aspect": "x"}],
        turns=[{"role": "user", "content": "Trước đó?"}, {"role": "assistant", "content": "Đáp."}],
    )
    (q_ood, q_premise, q_cmp), unmapped = convert_smoke([ood, premise, compare], snap, units, {})
    assert unmapped == []
    assert q_ood.cluster is None and q_ood.strata.l6_kind == "out_of_domain" and not q_ood.strata.answerable
    assert q_ood.strata.gold_source is None
    assert q_premise.strata.l6_kind == "false_premise" and q_premise.cluster == "auth"
    assert q_premise.gold_evidence[0].refutes
    assert [s.cell for s in q_cmp.gold_evidence] == [0, 1] and [s.grade for s in q_cmp.gold_evidence] == [2, 1]
    assert q_cmp.unit_ids == [f"{SESSION}#s01", f"{CSRF}#s01"]
    assert q_cmp.compare_cells[1].item == "csrf" and len(q_cmp.turns) == 2


def test_cli_writes_one_file_per_split_that_passes_check(snap_dir, tmp_path):
    snap, cmap, units = setup(snap_dir)
    source = tmp_path / "source" / "set.jsonl"
    source.parent.mkdir()
    records = [
        raw("seclearn-smoke-a01", "L1", [ev(SESSION, "at least 128 bits (16 bytes)")]),
        raw("seclearn-smoke-b01", "L1", [ev(CSRF, "The synchronizer token pattern is one of the most popular")]),
        raw("seclearn-smoke-b02", "L1", [ev(SESSION, "The session ID content must be meaningless")]),
    ]
    source.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8")
    picks = tmp_path / "anchor-picks.json"
    picks.write_text(json.dumps({"seclearn-smoke-b02/0": {"occurrence": 1, "why": "the first"}}), encoding="utf-8")
    units_file = tmp_path / "units.jsonl"
    write_jsonl(units_file, units)
    out = tmp_path / "questions" / "smoke"

    argv = ["smoke", "--snapshot", str(snap_dir), "--source", str(source), "--picks", str(picks)]
    argv += ["--units", str(units_file), "--out-dir", str(out), "--eval-version", "0.1.0"]
    assert main(argv) == 0

    header, dev = read_questions(out / "dev.jsonl")
    _, test = read_questions(out / "test.jsonl")
    assert header.canary == CANARY and header.eval_version == "0.1.0" and header.snapshot_id == snap.snapshot_id
    assert [q.id for q in dev] == ["seclearn-smoke-a01"] and [q.id for q in test] == ["seclearn-smoke-b01", "seclearn-smoke-b02"]
    files = [out / "dev.jsonl", out / "test.jsonl"]
    assert run_checks(CheckInputs(snapshot=snap_dir, questions=files, units=units_file)) == []


def test_read_smoke_rejects_an_unknown_field(tmp_path):
    path = tmp_path / "set.jsonl"
    path.write_text(json.dumps(raw("x", "L1", []) | {"surprise": 1}) + "\n", encoding="utf-8")
    try:
        read_smoke(path)
    except Exception as err:  # noqa: BLE001
        assert "surprise" in str(err)
    else:
        raise AssertionError("an unknown field must not pass")
