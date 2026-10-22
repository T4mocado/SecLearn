"""Quotas on kept questions (ticket 09): a short cell is topped up and only it; an over-full cell is cut by a fixed seed;
dev / test are written by `seed_id` and pass `check`."""

from __future__ import annotations

import pytest
from conftest import CANARY, question, span
from llm_fakes import generator, unit_texts

from seclearn_eval.check import CheckInputs, run_checks
from seclearn_eval.clusters import build_cluster_map
from seclearn_eval.generate import generate
from seclearn_eval.io import read_questions, write_json, write_jsonl
from seclearn_eval.quota import cut_to_plan, doc_load, refused_units, split_files, topup_plan
from seclearn_eval.schema import (
    GenerationReport,
    PlanCell,
    QuestionFileHeader,
    RefusedSlot,
    Review,
    SamplePlan,
    SubstitutedSlot,
)
from seclearn_eval.snapshot import load_snapshot
from seclearn_eval.units import build_units

SESS = "Session_Management_Cheat_Sheet"


@pytest.fixture
def snap(snap_dir):
    return load_snapshot(snap_dir)


@pytest.fixture
def units(snap):
    return build_units(snap, build_cluster_map(snap.manifest))[0]


@pytest.fixture
def gold(snap_dir):
    return span(snap_dir, SESS, "at least 128 bits (16 bytes)")


def plan(*cells, seed=7, cap=20):
    return SamplePlan(snapshot_id="2026-10-18-mini", seed=seed, params={"cap": cap}, cells=list(cells), slots=[])


def cell(level, target, kind=None, cluster="auth", split="test"):
    return PlanCell(split=split, cluster=cluster, level=level, l6_kind=kind, target=target)


def q(qid, level, gold, status="accepted", units=(f"{SESS}#s01",), split="test", cluster="auth", kind=None, seed_id=None):
    out = question(qid, split, cluster, level, [gold] if level != "L6" else [], seed_id=seed_id)
    strata = out.strata.model_copy(update={"l6_kind": kind})
    return out.model_copy(update={"unit_ids": list(units), "strata": strata, "review": Review(status=status)})


# --- Top-up ------------------------------------------------------------------------------------------


def test_only_short_cells_get_new_slots_and_only_they_are_generated(snap, units, gold):
    the_plan = plan(cell("L1", 2), cell("L3", 1), cell("L4", 1), cell("L6", 1, "out_of_domain", cluster=None))
    have = [
        q("a", "L1", gold), q("b", "L1", gold),  # L1 full
        q("c", "L3", gold, status="rejected", units=(f"{SESS}#s02",)),  # rejected: L3 is short by one
        q("d", "L6", gold, cluster=None, kind="out_of_domain", units=()),  # L6(a) full
    ]
    extra, _ = topup_plan(the_plan, have, units, round=1)
    assert sorted((s.level, s.cluster) for s in extra.slots) == [("L3", "auth"), ("L4", "auth")]
    assert all(s.slot_id.startswith("test-r1-") for s in extra.slots)

    client = generator(snap, units)
    candidates, _ = generate(snap, units, extra, client, oversample=1.6, prefer_other_doc=True)
    assert {c.level for c in candidates} == {"L3", "L4"}
    assert not any("Level L1 (" in c.prompt or "Level L6(a)" in c.prompt for c in client.calls)
    # A new seed per round: the same unit as an earlier slot is a new request to the cache.
    assert all(c.seed >= the_plan.seed + 1000 for c in client.calls)


def test_an_l4_top_up_pairs_units_that_are_about_the_same_thing(snap, units, gold):
    # Ticket 05, 2026-10-22: most L4 losses were forced comparisons of unrelated units.
    extra, _ = topup_plan(plan(cell("L4", 1)), [], units, round=1, texts=unit_texts(snap, units))
    [s] = extra.slots
    assert set(s.unit_ids) == {f"{SESS}#s02", "wstg-v4.2#WSTG-SESS-02"}  # "Cookies" and "Testing for Cookies Attributes"


def test_top_up_slots_skip_units_refused_before_and_documents_at_their_cap(units, gold):
    report = GenerationReport(
        cells=[], n_candidates=0, n_shortfall=0,
        refused=[RefusedSlot(slot_id="x", level="L3", unit_ids=[f"{SESS}#s02"], tried_unit_ids=[["wstg-v4.2#WSTG-SESS-09"]])],
        substituted=[SubstitutedSlot(slot_id="y", level="L4", from_unit_ids=[f"{SESS}#s01", "wstg-v4.2#WSTG-SESS-02"],
                                     to_unit_ids=[f"{SESS}#s01", "wstg-v4.2#WSTG-SESS-01"])],
    )
    banned = refused_units([report])
    assert banned == {f"{SESS}#s02", "wstg-v4.2#WSTG-SESS-09", "wstg-v4.2#WSTG-SESS-02"}

    extra, _ = topup_plan(plan(cell("L3", 1)), [], units, round=1, banned=banned)
    assert [s.unit_ids for s in extra.slots] == [["wstg-v4.2#WSTG-SESS-01"]]
    # Session Management already holds its cap of questions: the L1 top-up goes to WSTG.
    full = [q("a", "L1", gold, status="accepted"), q("b", "L1", gold, status="pending")]
    extra, _ = topup_plan(plan(cell("L1", 3), cap=2), full, units, round=2)
    [s] = extra.slots
    assert s.unit_ids[0].startswith("wstg-v4.2#") and s.slot_id == "test-r2-00001"


# --- Cut and split -----------------------------------------------------------------------------------


def test_an_over_full_cell_is_cut_to_its_target_the_same_way_every_time(gold):
    have = [q(f"q{n}", "L1", gold) for n in range(6)] + [q("r", "L1", gold, status="rejected")]
    kept1, dropped1 = cut_to_plan(have, plan(cell("L1", 4)))
    kept2, dropped2 = cut_to_plan(list(reversed(have)), plan(cell("L1", 4)))
    assert len(kept1) == 4 and len(dropped1) == 2 and "r" not in {x.id for x in kept1 + dropped1}
    assert {x.id for x in kept1} == {x.id for x in kept2} and {x.id for x in dropped1} == {x.id for x in dropped2}
    # Another seed is another cut (over 6-choose-4 subsets, at least one of these seeds differs).
    others = {frozenset(x.id for x in cut_to_plan(have, plan(cell("L1", 4), seed=s))[0]) for s in range(8)}
    assert len(others) > 1


def test_a_cut_keeps_the_seeds_of_kept_variants(gold):
    seeds = [q(f"q{n}", "L1", gold) for n in range(5)]
    variant = q("q3-L2", "L2", gold, seed_id="q3")
    for s in range(10):
        kept, _ = cut_to_plan([*seeds, variant], plan(cell("L1", 1), cell("L2", 1), seed=s))
        assert {x.id for x in kept} == {"q3", "q3-L2"}


def test_split_files_part_by_seed_id_and_pass_check(snap_dir, tmp_path, gold):
    have = [
        q("t1", "L1", gold), q("t1-L2", "L2", gold, seed_id="t1"), q("t1-L7", "L7", gold, seed_id="t1"),
        q("d1", "L1", gold, split="dev"), q("d1-L2", "L2", gold, split="dev", seed_id="d1"),
        q("x", "L1", gold, status="rejected"),
    ]
    the_plan = plan(cell("L1", 1), cell("L2", 1), cell("L7", 1), cell("L1", 1, split="dev"), cell("L2", 1, split="dev"))
    header = QuestionFileHeader(canary=CANARY, eval_version="1.0.0", snapshot_id="2026-10-18-mini")
    out = tmp_path / "gold"
    split_files(have, the_plan, header, out)

    _, test = read_questions(out / "test.jsonl")
    _, dev = read_questions(out / "dev.jsonl")
    assert {x.id for x in test} == {"t1", "t1-L2", "t1-L7"} and {x.id for x in dev} == {"d1", "d1-L2"}
    assert not {x.seed_id for x in test} & {x.seed_id for x in dev}

    snap = load_snapshot(snap_dir)
    write_jsonl(tmp_path / "units.jsonl", build_units(snap, build_cluster_map(snap.manifest))[0])
    write_json(tmp_path / "plan.json", the_plan)
    problems = run_checks(CheckInputs(snapshot=snap_dir, questions=[out / "test.jsonl", out / "dev.jsonl"],
                                      units=tmp_path / "units.jsonl", plan=tmp_path / "plan.json"))
    assert problems == []


def test_split_files_refuse_a_seed_in_two_splits(tmp_path, gold):
    have = [q("t1", "L1", gold), q("t1-L2", "L2", gold, split="dev", seed_id="t1")]
    header = QuestionFileHeader(canary=CANARY, eval_version="1.0.0", snapshot_id="2026-10-18-mini")
    with pytest.raises(ValueError, match="t1"):
        split_files(have, plan(cell("L1", 1), cell("L2", 1, split="dev")), header, tmp_path)


# --- Review fixes ------------------------------------------------------------------------------------


def test_a_round_never_asks_one_unit_twice_for_a_cell_and_reports_what_it_could_not_place(units):
    # Two auth units have >= 2 chunks: the same unit twice would be the same request, the same cached questions.
    extra, unplaced = topup_plan(plan(cell("L3", 3)), [], units, round=1)
    assert sorted(s.unit_ids[0] for s in extra.slots) == [f"{SESS}#s02", "wstg-v4.2#WSTG-SESS-01"]
    assert unplaced == {("test", "auth", "L3", None): 1}


def test_variants_do_not_count_towards_a_documents_cap(units, gold):
    # Cap 2 on Session Management: one kept L1 there plus its two variants (same units) leave room for one more.
    have = [q("a", "L1", gold), q("a-L2", "L2", gold, seed_id="a"), q("a-L7", "L7", gold, seed_id="a")]
    extra, _ = topup_plan(plan(cell("L1", 2), cap=2), have, units, round=1)
    [s] = extra.slots
    assert s.doc_key == SESS


def test_a_top_up_substitute_keeps_to_the_cap_counted_on_kept_questions(snap, units, gold):
    # WSTG holds its cap (1) with a kept question; the refused slot must not move there, other document or not.
    have = [q("w", "L1", gold, units=("wstg-v4.2#WSTG-SESS-02",))]
    the_plan = plan(cell("L1", 2), cap=1)
    extra, _ = topup_plan(the_plan, have, units, round=1)
    [s] = extra.slots
    texts = unit_texts(snap, units)
    own = texts[s.unit_ids[0]]

    def refuse_own(prompt, schema):
        if own in prompt:
            from seclearn_eval.llm import ModelRefusal

            raise ModelRefusal("claude-fake: stopped with refusal")
        return None

    client = generator(snap, units, refuse_own)
    generate(snap, units, extra, client, oversample=1.0, prefer_other_doc=True, doc_load=doc_load(have, units))
    asked = {uid for c in client.calls for uid, t in texts.items() if t in c.prompt}
    assert not {u for u in asked if u.startswith("wstg-v4.2#")}


def test_the_cut_keeps_a_seed_for_every_variant_it_keeps(gold):
    for s in range(10):
        have = [q("q1", "L1", gold), q("q2", "L1", gold), q("q1-L2", "L2", gold, seed_id="q1"), q("q2-L2", "L2", gold, seed_id="q2")]
        kept, _ = cut_to_plan(have, plan(cell("L1", 1), cell("L2", 1), seed=s))
        [l1] = [x for x in kept if x.strata.level == "L1"]
        [l2] = [x for x in kept if x.strata.level == "L2"]
        assert l2.seed_id == l1.id


def test_split_leaves_out_questions_not_reviewed_yet(tmp_path, gold):
    have = [q("t1", "L1", gold), q("t2", "L1", gold, status="pending")]
    header = QuestionFileHeader(canary=CANARY, eval_version="1.0.0", snapshot_id="2026-10-18-mini")
    kept, _ = split_files(have, plan(cell("L1", 2)), header, tmp_path)
    assert [x.id for x in kept] == ["t1"]
