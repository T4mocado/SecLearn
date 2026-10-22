"""`variants`: L2 / L7 / L6(c) questions made from reviewed L1 / L3 questions, against a scripted LLM (ticket 09)."""

from __future__ import annotations

import pytest
from conftest import question, span

from seclearn_eval.clusters import build_cluster_map
from seclearn_eval.llm import FakeClient
from seclearn_eval.schema import LLMConfig, ModelRef, PlanCell, Review, SamplePlan
from seclearn_eval.snapshot import load_snapshot
from seclearn_eval.units import build_units
from seclearn_eval.variants import build_variants, strip_accents

SESS = "Session_Management_Cheat_Sheet"
CONFIG = LLMConfig(
    generator=ModelRef(provider="claude", model="claude-fake"),
    judge=ModelRef(provider="gemini", model="gemini-fake"),
    embedder=ModelRef(provider="gemini", model="gemini-embed-fake"),
)


@pytest.fixture
def snap(snap_dir):
    return load_snapshot(snap_dir)


@pytest.fixture
def units(snap):
    return build_units(snap, build_cluster_map(snap.manifest))[0]


@pytest.fixture
def seeds(snap_dir):
    """Four reviewed auth questions on the test split, each on Session Management's s01."""
    gold = span(snap_dir, SESS, "at least 128 bits (16 bytes)")
    out = []
    for n, level in enumerate(["L1", "L1", "L3", "L1"], start=1):
        q = question(f"test-0000{n}-c1", "test", "auth", level, [gold])
        out.append(q.model_copy(update={"unit_ids": [f"{SESS}#s01"]}))
    # A pending (unreviewed) question is not a seed.
    out[3] = out[3].model_copy(update={"review": Review()})
    return out


def plan(*cells):
    return SamplePlan(snapshot_id="2026-10-18-mini", seed=7, params={}, cells=list(cells), slots=[])


def cell(level, target, kind=None, cluster="auth", split="test"):
    return PlanCell(split=split, cluster=cluster, level=level, l6_kind=kind, target=target)


def writer(refute="at least 128 bits (16 bytes)"):
    """Replies to every variant prompt; records them on `.calls`."""

    def reply(prompt, schema):
        props = schema["properties"]
        if "turns" in props:
            return {"turns": [{"role": "user", "content": "Session ID là gì?"}, {"role": "assistant", "content": "Là mã định danh phiên."}],
                    "question": "Nó cần dài bao nhiêu?", "question_en": "How long does it need to be?"}
        if "refuting_quote" in props:
            return {"false_premise": "Session IDs need only 32 bits.", "question": "Vì sao session ID chỉ cần 32 bit?",
                    "question_en": "Why do session IDs need only 32 bits?", "answer": "Sai: cần ít nhất 128 bit.", "refuting_quote": refute}
        return {"question": "Mã phiên phải có độ ngẫu nhiên tối thiểu là bao nhiêu?", "question_en": "How random must a login token be at minimum?"}

    return FakeClient(model="claude-fake", reply=reply)


def test_variants_keep_the_seed_id_split_cluster_and_gold_of_their_seed(snap, units, seeds):
    client = writer()
    out, _ = build_variants(seeds, plan(cell("L2", 1), cell("L7", 1)), snap, units, client, config=CONFIG)
    by_level = {q.strata.level: q for q in out}
    assert set(by_level) == {"L2", "L7"}
    by_id = {q.id: q for q in seeds}
    for q in out:
        seed = by_id[q.seed_id]
        assert seed.strata.level in ("L1", "L3") and seed.review.status in ("accepted", "edited")
        assert (q.split, q.cluster, q.unit_ids, q.gold_evidence) == (seed.split, seed.cluster, seed.unit_ids, seed.gold_evidence)
        assert q.review.status == "pending" and q.strata.answerable
    assert by_level["L7"].turns and by_level["L7"].question == "Nó cần dài bao nhiêu?"
    assert by_level["L2"].generation.prompt_version.startswith("var-L2")


def test_strip_accents_writes_vietnamese_without_diacritics():
    assert strip_accents("Độ dài tối thiểu của mã phiên là bao nhiêu?") == "Do dai toi thieu cua ma phien la bao nhieu?"


def test_a_false_premise_variant_carries_the_span_that_refutes_it(snap, units, seeds):
    out, _ = build_variants(seeds, plan(cell("L6", 1, "false_premise")), snap, units, writer(), config=CONFIG)
    assert len(out) == 2  # ceil(1.6 × 1), from the two reviewed L1 seeds
    q = out[0]
    assert (q.strata.level, q.strata.l6_kind, q.strata.answerable) == ("L6", "false_premise", False)
    assert seeds[[s.id for s in seeds].index(q.seed_id)].strata.level == "L1"  # L6(c) only from L1
    [refute] = q.gold_evidence
    assert refute.refutes and refute.doc_key == SESS
    assert snap.markdown[SESS][refute.char_start : refute.char_end] == "at least 128 bits (16 bytes)"
    assert q.reference_answer == "Sai: cần ít nhất 128 bit."


def test_a_false_premise_whose_quote_is_not_in_the_seed_unit_is_dropped_and_reported(snap, units, seeds):
    out, report = build_variants(seeds, plan(cell("L6", 1, "false_premise")), snap, units, writer(refute="Sessions never expire."), config=CONFIG)
    assert out == []
    # Each of the two L1 seeds was tried once (ceil(1.6 × 1) = 2 wanted), both dropped.
    assert [r.reason for r in report.rejected] == ["quote_not_found", "quote_not_found"]
    [c] = report.cells
    assert (c.target, c.kept, c.wanted, c.made, c.calls) == (1, 0, 2, 0, 2)


def test_every_other_l2_variant_is_written_without_diacritics(snap, units, seeds):
    out, _ = build_variants(seeds, plan(cell("L2", 2)), snap, units, writer(), config=CONFIG)
    styles = [q.strata.question_style for q in out]
    assert styles == ["accented", "unaccented", "accented"]  # ceil(1.6 × 2) = 4 wanted, 3 reviewed seeds
    assert out[1].question == "Ma phien phai co do ngau nhien toi thieu la bao nhieu?"


def test_an_l2_worded_like_its_evidence_is_dropped(snap, units, seeds):
    close = FakeClient(model="claude-fake", reply=lambda p, s: {"question": "Bao nhiêu bit?", "question_en": "At least 128 bits?"})
    out, report = build_variants(seeds, plan(cell("L2", 1)), snap, units, close, config=CONFIG)
    assert out == [] and {r.reason for r in report.rejected} == {"too_close_to_document"}


def test_only_cells_short_of_their_target_get_variants(snap, units, seeds):
    client = writer()
    first, _ = build_variants(seeds, plan(cell("L2", 1), cell("L7", 1)), snap, units, client, config=CONFIG)
    l7 = [q for q in first if q.strata.level == "L7"][:1]
    n_calls = len(client.calls)
    # The L7 cell now holds its one question: a second run writes L2 only.
    again, report = build_variants(seeds + l7, plan(cell("L2", 1), cell("L7", 1)), snap, units, client, config=CONFIG)
    assert {q.strata.level for q in again} == {"L2"}
    assert all("Level L2" in c.prompt for c in client.calls[n_calls:])
    assert [(c.level, c.made) for c in report.cells] == [("L2", 2)]


def test_seeds_are_picked_in_an_order_fixed_by_the_plan_seed(snap, units, seeds):
    one = build_variants(seeds, plan(cell("L2", 1)), snap, units, writer(), config=CONFIG)[0]
    two = build_variants(list(reversed(seeds)), plan(cell("L2", 1)), snap, units, writer(), config=CONFIG)[0]
    assert [q.id for q in one] == [q.id for q in two]
