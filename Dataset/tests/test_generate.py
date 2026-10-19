"""`generate` against a scripted LLM: candidates fill the plan's root-level slots, in the candidate schema."""

from __future__ import annotations

import math
import re
from collections import Counter
from pathlib import Path

import pytest
from conftest import MINI
from llm_fakes import generator

from seclearn_eval.clusters import build_cluster_map
from seclearn_eval.generate import MAX_TOP_UPS, OOD_BATCH, generate
from seclearn_eval.llm import CachedClient
from seclearn_eval.schema import PlanSlot, SamplePlan
from seclearn_eval.snapshot import load_snapshot
from seclearn_eval.units import build_units


@pytest.fixture
def snap():
    return load_snapshot(MINI)


@pytest.fixture
def units(snap):
    return build_units(snap, build_cluster_map(snap.manifest))[0]


def slot(sid, level, cluster, unit_ids, doc_key=None, split="test", l6_kind=None):
    return PlanSlot(slot_id=sid, split=split, cluster=cluster, level=level, l6_kind=l6_kind, doc_key=doc_key, unit_ids=unit_ids)


SESS = "Session_Management_Cheat_Sheet"


@pytest.fixture
def plan():
    slots = [
        slot("test-00001", "L1", "auth", [f"{SESS}#s01"], SESS),
        slot("test-00002", "L1", "auth", [f"{SESS}#s00"], SESS),
        slot("test-00003", "L3", "auth", [f"{SESS}#s02"], SESS),
        slot("test-00004", "L4", "auth", [f"{SESS}#s01", "wstg-v4.2#WSTG-SESS-02"], SESS),
        slot("test-00005", "L5", "auth", ["wstg-v4.2#WSTG-SESS-01", f"{SESS}#s02"], "wstg-v4.2"),
        # Variants: built from approved questions later (ticket 09), never generated here.
        slot("test-00006", "L2", "auth", [f"{SESS}#s01"], SESS),
        slot("test-00007", "L7", "auth", [f"{SESS}#s01"], SESS),
        slot("test-00008", "L6", "auth", [f"{SESS}#s01"], SESS, l6_kind="false_premise"),
        slot("test-00009", "L6", None, [], l6_kind="not_in_corpus"),
        # L6(a): out of domain, one call for the whole cell.
        slot("test-00010", "L6", None, [], l6_kind="out_of_domain"),
        slot("test-00011", "L6", None, [], l6_kind="out_of_domain"),
        slot("test-00012", "L6", None, [], l6_kind="out_of_domain"),
    ]
    return SamplePlan(snapshot_id="2026-10-18-mini", seed=99, params={}, cells=[], slots=slots)


def test_generate_fills_root_level_slots_about_1_6_times(snap, units, plan):
    client = generator(snap, units)
    candidates, _ = generate(snap, units, plan, client, oversample=1.6)

    per_slot = Counter(c.slot_id for c in candidates)
    # L1 cell (2 slots) → ceil(3.2) = 4 candidates; single-slot cells → 2; L6(a) cell of 3 → ceil(4.8) = 5.
    assert per_slot["test-00001"] + per_slot["test-00002"] == 4
    assert per_slot["test-00003"] == per_slot["test-00004"] == per_slot["test-00005"] == 2
    assert sum(per_slot[f"test-000{n}"] for n in (10, 11, 12)) == 5
    assert not {"test-00006", "test-00007", "test-00008", "test-00009"} & set(per_slot)
    assert len({c.candidate_id for c in candidates}) == len(candidates)


def test_candidates_carry_the_slot_cell_quotes_and_generation(snap, units, plan):
    candidates, _ = generate(snap, units, plan, generator(snap, units), oversample=1.6)
    by_slot = {c.slot_id: c for c in candidates}

    l1 = by_slot["test-00001"]
    assert (l1.split, l1.cluster, l1.level, l1.unit_ids) == ("test", "auth", "L1", [f"{SESS}#s01"])
    assert l1.question.startswith("Câu hỏi") and l1.question_en.startswith("Question")
    assert l1.reference_answer and l1.reference_claims  # L1 / L3: claims first, then the question
    assert [q.doc_key for q in l1.quotes] == [SESS]
    assert l1.generation.model == "claude-fake" and l1.generation.prompt_version == "gen-L1-v1"
    assert l1.generation.seed == 99

    # L4 / L5 quote both units of the pair, each against its own document.
    l5 = by_slot["test-00005"]
    assert [q.doc_key for q in l5.quotes] == ["wstg-v4.2", SESS]
    assert l5.generation.prompt_version == "gen-L5-v1"

    ood = by_slot["test-00010"]
    assert (ood.level, ood.l6_kind, ood.cluster, ood.quotes, ood.reference_answer) == ("L6", "out_of_domain", None, [], None)


def test_prompts_carry_the_unit_text_and_ood_prompts_carry_none(snap, units, plan):
    client = generator(snap, units)
    generate(snap, units, plan, client, oversample=1.6)
    texts = {u.unit_id: snap.markdown[u.doc_key][u.char_start : u.char_end] for u in units}
    l4_prompt = next(c.prompt for c in client.calls if texts[f"{SESS}#s01"] in c.prompt and texts["wstg-v4.2#WSTG-SESS-02"] in c.prompt)
    assert "L4" in l4_prompt or "compar" in l4_prompt.lower()
    ood_calls = [c for c in client.calls if not any(t in c.prompt for t in texts.values())]
    assert len(ood_calls) == 1


def test_a_short_reply_is_topped_up_with_another_call_on_a_new_seed(snap, units, plan):
    client = None

    def short_first(prompt, schema):
        # The first call of each slot (the plan's seed) brings one question only.
        if client.calls[-1].seed == plan.seed and "L1" in prompt:
            return {"items": [{"claims": [], "question": "Q?", "question_en": "Q?", "answer": "A.", "quotes": []}]}
        return None

    client = generator(snap, units, short_first)
    one_l1 = plan.model_copy(update={"slots": [plan.slots[0]]})  # test-00001, L1: wants ceil(1.6) = 2
    candidates, report = generate(snap, units, one_l1, client, oversample=1.6)
    assert [c.candidate_id for c in candidates] == ["test-00001-c1", "test-00001-c2"]
    assert [c.seed for c in client.calls] == [plan.seed, plan.seed + 1]
    assert "exactly 1 question" in client.calls[1].prompt
    assert [c.generation.seed for c in candidates] == [plan.seed, plan.seed + 1]
    [cell] = report.cells
    assert (cell.level, cell.wanted, cell.got, cell.shortfall, cell.calls) == ("L1", 2, 2, 0, 2)


def test_a_cell_the_model_keeps_short_is_reported_after_bounded_retries(snap, units, plan):
    empty = generator(snap, units, lambda prompt, schema: {"items": []} if "Level L3 (" in prompt else None)
    candidates, report = generate(snap, units, plan, empty, oversample=1.6)
    assert not [c for c in candidates if c.level == "L3"]
    l3_calls = [c for c in empty.calls if "Level L3" in c.prompt]
    assert len(l3_calls) == 1 + MAX_TOP_UPS
    [cell] = [c for c in report.cells if c.level == "L3"]
    assert (cell.wanted, cell.got, cell.shortfall) == (2, 0, 2)
    assert report.n_shortfall == 2
    assert all(c.shortfall == 0 for c in report.cells if c.level != "L3")


def test_a_large_l6a_cell_is_asked_in_bounded_batches(snap, units):
    slots = [slot(f"test-{n:05d}", "L6", None, [], l6_kind="out_of_domain") for n in range(1, 61)]
    big = SamplePlan(snapshot_id="2026-10-18-mini", seed=5, params={}, cells=[], slots=slots)
    client = generator(snap, units)
    candidates, report = generate(snap, units, big, client, oversample=1.6)
    asked = [int(re.search(r"exactly (\d+) question", c.prompt).group(1)) for c in client.calls]
    assert sum(asked) == 96 and max(asked) <= OOD_BATCH and len(asked) == math.ceil(96 / OOD_BATCH)
    assert len({c.seed for c in client.calls}) == len(client.calls)  # same prompt, so each batch needs its own seed
    assert len(candidates) == 96 and len({c.candidate_id for c in candidates}) == 96
    assert report.cells[0].shortfall == 0


def test_rerun_answers_from_the_cache_without_calling_the_api(snap, units, plan, tmp_path):
    fake = generator(snap, units)
    first, _ = generate(snap, units, plan, CachedClient(fake, tmp_path / "cache"), oversample=1.6)
    n_calls = len(fake.calls)
    assert n_calls > 0

    cached = CachedClient(fake, tmp_path / "cache")
    again, _ = generate(snap, units, plan, cached, oversample=1.6)
    assert len(fake.calls) == n_calls and cached.misses == 0 and cached.hits == n_calls
    assert again == first

    # A different seed is a different request.
    generate(snap, units, plan.model_copy(update={"seed": 100}), CachedClient(fake, tmp_path / "cache"), oversample=1.6)
    assert len(fake.calls) == 2 * n_calls
