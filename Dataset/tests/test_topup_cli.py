"""Ticket 09's commands end to end on the mini snapshot, every LLM and model a fake: topup, variants, l6b, split, check."""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import CANARY, question, span
from llm_fakes import generator
from test_absence import l6b_writer
from test_variants import writer

from seclearn_eval import cli
from seclearn_eval.clusters import build_cluster_map
from seclearn_eval.io import read_json, read_jsonl, read_questions, write_json, write_jsonl, write_questions
from seclearn_eval.schema import (
    Candidate,
    GenerationReport,
    LLMConfig,
    ModelRef,
    PlanCell,
    QuestionFileHeader,
    RefusedSlot,
    Review,
    SamplePlan,
)
from seclearn_eval.snapshot import load_snapshot
from seclearn_eval.units import build_units

SESS = "Session_Management_Cheat_Sheet"


class FakeEncoder:
    model = "fake-m3"

    def encode(self, texts, *, query):
        return [[float(len(t)), 1.0] for t in texts]


@pytest.fixture
def setup(snap_dir: Path, tmp_path: Path, monkeypatch):
    snap = load_snapshot(snap_dir)
    units = build_units(snap, build_cluster_map(snap.manifest))[0]
    write_jsonl(tmp_path / "units.jsonl", units)
    write_json(tmp_path / "llm-config.json", LLMConfig(
        generator=ModelRef(provider="claude", model="claude-fake"),
        judge=ModelRef(provider="gemini", model="gemini-fake"),
        embedder=ModelRef(provider="gemini", model="gemini-embed-fake"),
    ))
    cells = [PlanCell(split="test", cluster="auth", level=lv, target=n) for lv, n in (("L1", 2), ("L3", 1), ("L2", 1), ("L7", 1))]
    cells += [PlanCell(split="test", cluster="auth", level="L6", l6_kind="false_premise", target=1),
              PlanCell(split="test", cluster=None, level="L6", l6_kind="not_in_corpus", target=1)]
    write_json(tmp_path / "plan.json", SamplePlan(snapshot_id=snap.snapshot_id, seed=7, params={"cap": 20}, cells=cells, slots=[]))
    gold = span(snap_dir, SESS, "at least 128 bits (16 bytes)")
    reviewed = [question(f"test-0000{n}-c1", "test", "auth", "L1", [gold]).model_copy(update={"unit_ids": [f"{SESS}#s01"]}) for n in (1, 2)]
    header = QuestionFileHeader(canary=CANARY, eval_version="1.0.0", snapshot_id=snap.snapshot_id)
    write_questions(tmp_path / "reviewed.jsonl", header, reviewed)

    clients = {"generator": generator(snap, units)}
    monkeypatch.setattr(cli, "make_clients", lambda config, cache: clients)
    monkeypatch.setattr(cli, "model_factory", lambda allow_unpinned=False: lambda kind, ref: FakeEncoder())
    common = ["--snapshot", str(snap_dir), "--units", str(tmp_path / "units.jsonl"), "--config", str(tmp_path / "llm-config.json"),
              "--plan", str(tmp_path / "plan.json")]
    return {"root": tmp_path, "snap": snap_dir, "common": common, "clients": clients, "units": units, "snapshot": snap}


def test_topup_writes_candidates_for_the_short_l3_cell_only_and_leaves_out_refused_units(setup):
    root = setup["root"]
    write_json(root / "generate-report.json", GenerationReport(
        cells=[], n_candidates=0, n_shortfall=0, refused=[RefusedSlot(slot_id="x", level="L3", unit_ids=[f"{SESS}#s02"])]))
    out = root / "candidates-r1.jsonl"
    argv = ["topup", *setup["common"], "--questions", str(root / "reviewed.jsonl"), "--refusals", str(root / "generate-report.json"),
            "--out", str(out), "--no-cache"]
    assert cli.main(argv) == 0
    candidates = read_jsonl(out, Candidate)
    assert {c.level for c in candidates} == {"L3"} and len(candidates) == 2  # ceil(1.6 × 1)
    assert all(c.unit_ids == ["wstg-v4.2#WSTG-SESS-01"] for c in candidates)  # s02 was refused before
    assert read_json(root / "generate-report-r1.json", GenerationReport).n_candidates == 2
    assert [s.slot_id for s in read_json(root / "topup-plan-r1.json", SamplePlan).slots] == ["test-r1-00001"]


def test_variants_l6b_and_split_write_files_that_pass_check(setup, capsys):
    root, common = setup["root"], setup["common"]
    # No L3 here: this test writes no root question, only variants and L6(b).
    plan = read_json(root / "plan.json", SamplePlan)
    write_json(root / "plan.json", plan.model_copy(update={"cells": [c for c in plan.cells if c.level != "L3"]}))
    setup["clients"]["generator"] = writer()
    assert cli.main(["variants", *common, "--questions", str(root / "reviewed.jsonl"), "--out", str(root / "variants.jsonl"), "--no-cache"]) == 0
    _, variants = read_questions(root / "variants.jsonl")
    assert sorted(q.strata.level for q in variants) == ["L2", "L2", "L6", "L6", "L7", "L7"]

    setup["clients"]["generator"] = l6b_writer()
    assert cli.main(["l6b", *common, "--questions", str(root / "reviewed.jsonl"), "--out", str(root / "l6b.jsonl"),
                     "--embeddings", str(root / "emb"), "--no-cache"]) == 0
    _, l6b = read_questions(root / "l6b.jsonl")
    assert {r.system for q in l6b for r in q.absence_evidence.retrieved} == {"bm25-en", "bge-m3-vi"}
    assert "with keyword hits" in capsys.readouterr().out

    # The review accepts everything; the oversampled cells are then cut back to the plan.
    reviewed = root / "all-reviewed.jsonl"
    header, seeds = read_questions(root / "reviewed.jsonl")
    accepted = [q.model_copy(update={"review": Review(status="accepted")}) for q in [*variants, *l6b]]
    pending = variants[0].model_copy(update={"id": "not-reviewed-yet"})
    write_questions(reviewed, header, [*seeds, *accepted, pending])
    out = root / "gold"
    assert cli.main(["split", "--snapshot", str(setup["snap"]), "--plan", str(root / "plan.json"), "--questions", str(reviewed),
                     "--out-dir", str(out)]) == 0
    _, test = read_questions(out / "test.jsonl")
    assert len(test) == 2 + 1 + 1 + 1 + 1  # L1 ×2, L2, L7, L6(c), L6(b)
    printed = capsys.readouterr().out
    assert "short:" not in printed and "1 question(s) not reviewed yet are left out" in printed
    assert len(read_json_plain(out / "split-report.json")["cut"]) == 4

    check = ["check", "--snapshot", str(setup["snap"]), "--units", str(root / "units.jsonl"), "--plan", str(root / "plan.json"),
             "--questions", str(out / "test.jsonl"), str(out / "dev.jsonl"), "--runs"]
    assert cli.main(check) == 0
    assert "check: OK" in capsys.readouterr().out


def read_json_plain(path: Path) -> dict:
    import json

    return json.loads(path.read_text(encoding="utf-8"))
