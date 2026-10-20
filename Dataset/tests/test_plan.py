"""Clusters, sampling units and the method-R plan, against numbers worked out by hand."""

from __future__ import annotations

import itertools
import os
import random
import subprocess
import sys
from collections import Counter
from pathlib import Path

import pytest
from conftest import MINI

from seclearn_eval.clusters import UnmappedDocuments, build_cluster_map
from seclearn_eval.plan import (
    PlanError,
    PlanParams,
    _unit_counts,
    build_plan,
    capped_shares,
    floored_quotas,
    largest_remainder,
    match_margins,
)
from seclearn_eval.schema import Unit
from seclearn_eval.snapshot import load_snapshot
from seclearn_eval.units import _cheat_sheet_regions, build_units

# --- Clusters and units ---------------------------------------------------------------------------


def test_cluster_map_from_names_and_unmapped_documents():
    manifest = load_snapshot(MINI).manifest
    cmap = build_cluster_map(manifest)
    assert cmap.documents == {
        "Cross-Site_Request_Forgery_Prevention_Cheat_Sheet": "browser",
        "Session_Management_Cheat_Sheet": "auth",
    }
    assert cmap.wstg_groups["SESS"] == "auth" and cmap.wstg_groups["CLNT"] == "browser"
    odd = manifest.documents[0].model_copy(update={"doc_key": "Quantum_Teleportation_Cheat_Sheet"})
    with pytest.raises(UnmappedDocuments, match="Quantum_Teleportation_Cheat_Sheet"):
        build_cluster_map(manifest.model_copy(update={"documents": [*manifest.documents, odd]}))


def test_units_of_the_mini_snapshot():
    snap = load_snapshot(MINI)
    units, warnings = build_units(snap, build_cluster_map(snap.manifest))
    assert warnings == []
    excluded = {u.unit_id: u.exclude_reason for u in units if not u.sampleable}
    assert excluded == {
        "Cross-Site_Request_Forgery_Prevention_Cheat_Sheet#s02": "references",
        "wstg-v4.2#wstg_front00": "table of contents",
        "wstg-v4.2#WSTG-SESS-09": "stub",
        "wstg-v4.2#wstg_back06": "table of contents",
        "wstg-v4.2#wstg_back07": "tool list",
        "wstg-v4.2#wstg_back08": "references",
        "wstg-v4.2#wstg_back09": "payloads",
        "wstg-v4.2#wstg_back10": "payloads",
        "wstg-v4.2#wstg_back11": "history",
    }
    by_id = {u.unit_id: u for u in units}
    assert by_id["wstg-v4.2#WSTG-SESS-01"].cluster == "auth"
    assert by_id["wstg-v4.2#wstg_back05"].title == "Reporting" and by_id["wstg-v4.2#wstg_back05"].sampleable
    assert by_id["wstg-v4.2#wstg_back12"].title == "Appendix: Leveraging Dev Tools" and by_id["wstg-v4.2#wstg_back12"].sampleable
    # Every chunk weighs exactly one unit of its document.
    assert sum(u.weight_chunks for u in units) == len(snap.chunks)
    # Units tile each document: no gap, no overlap.
    for doc in snap.manifest.documents:
        mine = sorted((u for u in units if u.doc_key == doc.doc_key), key=lambda u: u.char_start)
        assert all(a.char_end == b.char_start for a, b in itertools.pairwise(mine))


def test_cheat_sheet_sections_merge_generic_and_empty_headings():
    md = (
        "# X\n\n## X Cheat Sheet\n## Introduction\n"
        + "Intro text that is long enough to stand as a section of its own. " * 2
        + "\n## Storage\nStore it well, with enough words to be a real section here.\n## Do\nUse a vault.\n"
        + "## Don't\nCommit secrets.\n## References\nSome link.\n"
    )
    regions = _cheat_sheet_regions(md, "supply")
    assert [(r.title, r.sampleable) for r in regions] == [("Introduction", True), ("Storage", True), ("References", False)]
    assert "## Don't" in md[regions[1].start : regions[1].end]


# --- Allocation -----------------------------------------------------------------------------------


def test_floored_quotas_by_hand():
    # √100, √25, √4 = 10, 5, 2 over 30: c (3.5) is raised to 8; then 22 over 10 : 5 puts b at 7.3, raised to 8; a gets 14.
    assert floored_quotas({"a": 10.0, "b": 5.0, "c": 2.0}, 30, 8, random.Random(1)) == {"a": 14, "b": 8, "c": 8}


def test_capped_shares_moves_the_excess():
    assert capped_shares({"x": 4.0, "y": 1.0}, 10, {"x": 5.0, "y": 50.0}) == {"x": 5.0, "y": 5.0}
    with pytest.raises(PlanError):
        capped_shares({"x": 1.0}, 10, {"x": 5.0})


def test_largest_remainder_sums_and_is_seeded():
    w = {k: 1.0 for k in "abc"}
    a = largest_remainder(w, 7, random.Random(3))
    assert sum(a.values()) == 7 and sorted(a.values()) == [2, 2, 3]
    assert a == largest_remainder(w, 7, random.Random(3))


def test_match_margins_hits_both_margins():
    rows = {"a": 23, "b": 19, "c": 18}
    cols = {"L1": 10, "L2": 10, "L3": 10, "L4": 10, "L5": 10, "L7": 10}
    t = match_margins(rows, cols, random.Random(0))
    assert all(sum(t[(r, c)] for c in cols) == n for r, n in rows.items())
    assert all(sum(t[(r, c)] for r in rows) == n for c, n in cols.items())


# --- The plan -------------------------------------------------------------------------------------


def unit(uid: str, doc: str, cluster: str, weight: int, kind: str = "section", sampleable: bool = True) -> Unit:
    return Unit(
        unit_id=uid, doc_key=doc, kind=kind, title=uid, cluster=cluster, char_start=0, char_end=1,
        chunks=weight, weight_chunks=weight, sampleable=sampleable, exclude_reason=None if sampleable else "references",
    )  # fmt: skip


UNITS = [
    unit("A#s0", "A", "auth", 6),
    unit("A#s1", "A", "auth", 3),
    unit("A#s2", "A", "auth", 1),
    unit("A#refs", "A", "auth", 50, sampleable=False),
    unit("wstg-v4.2#WSTG-SESS-01", "wstg-v4.2", "auth", 4, "wstg_case"),
    unit("wstg-v4.2#WSTG-SESS-02", "wstg-v4.2", "auth", 2, "wstg_case"),
    unit("B#s0", "B", "browser", 5),
    unit("B#s1", "B", "browser", 5),
    unit("wstg-v4.2#wstg_front01", "wstg-v4.2", "arch", 9, "wstg_front"),
]
PARAMS = PlanParams(seed=7, test_answerable=60, test_floor=15, test_l6=[2, 4, 2], dev_answerable=12, dev_l6=[1, 2, 1])


def test_plan_quotas_by_hand():
    plan = build_plan("snap", UNITS, PARAMS)
    test = [s for s in plan.slots if s.split == "test" and s.level != "L6"]
    # Clusters: √16 = 4 (A 10 + WSTG 6), √10, √9 over 60 → 23.6, 18.7, 17.7 → 23, 19, 18.
    assert Counter(s.cluster for s in test) == {"auth": 23, "browser": 19, "arch": 18}
    # auth: A √10 vs its WSTG part √6 (one document) → 13, 10; WSTG by √4 : √2 → 6, 4; A's sections by 6 : 3 : 1 → 8, 4, 1.
    anchors = Counter(s.unit_ids[0] for s in test if s.cluster == "auth")
    assert anchors == {"A#s0": 8, "A#s1": 4, "A#s2": 1, "wstg-v4.2#WSTG-SESS-01": 6, "wstg-v4.2#WSTG-SESS-02": 4}


def test_a_clusters_wstg_part_is_capped_like_a_document():
    # WSTG √200 against a cheat sheet's √1 would take 28 of 30; as one document it stops at the cap of 20.
    units = [
        unit("C#s0", "C", "inj", 1),
        unit("wstg-v4.2#WSTG-INPV-01", "wstg-v4.2", "inj", 100, "wstg_case"),
        unit("wstg-v4.2#WSTG-INPV-05", "wstg-v4.2", "inj", 100, "wstg_case"),
    ]
    counts = _unit_counts(units, 30, 20, random.Random(0))
    assert counts["wstg-v4.2#WSTG-INPV-01"] + counts["wstg-v4.2#WSTG-INPV-05"] == 20
    assert counts["C#s0"] == 10


def test_plan_levels_l6_and_capabilities():
    plan = build_plan("snap", UNITS, PARAMS)
    by_id = {u.unit_id: u for u in UNITS}
    for split, answerable, l6 in (("test", 60, [2, 4, 2]), ("dev", 12, [1, 2, 1])):
        slots = [s for s in plan.slots if s.split == split]
        levels = Counter(s.level for s in slots if s.level != "L6")
        assert sum(levels.values()) == answerable and len(set(levels.values())) == 1
        assert [sum(s.l6_kind == k for s in slots) for k in ("out_of_domain", "not_in_corpus", "false_premise")] == l6
    for s in plan.slots:
        assert all(by_id[u].sampleable for u in s.unit_ids)
        if s.level == "L3":
            assert by_id[s.unit_ids[0]].chunks >= 2
        if s.level in ("L4", "L5"):
            a, b = s.unit_ids
            assert a != b and by_id[a].cluster == by_id[b].cluster == s.cluster
        elif s.l6_kind in ("out_of_domain", "not_in_corpus"):
            assert s.cluster is None and s.unit_ids == []
        else:
            assert len(s.unit_ids) == 1
    assert len({s.slot_id for s in plan.slots}) == len(plan.slots)
    assert sum(c.target for c in plan.cells) == len(plan.slots)


def test_plan_is_seeded():
    assert build_plan("snap", UNITS, PARAMS) == build_plan("snap", UNITS, PARAMS)
    other = build_plan("snap", UNITS, PlanParams(**{**PARAMS.__dict__, "seed": 8}))
    assert other.slots != build_plan("snap", UNITS, PARAMS).slots


def test_plan_is_the_same_in_every_process():
    # Set order changes with PYTHONHASHSEED; a plan run in another process must not change with it.
    # Floor 19 puts two clusters at the floor at once, the case where set order once leaked into the plan.
    script = (
        "import hashlib, sys; sys.path.insert(0, 'tests'); from test_plan import UNITS, PARAMS; "
        "from seclearn_eval.plan import PlanParams, build_plan; "
        "p = PlanParams(**{**PARAMS.__dict__, 'test_floor': 19}); "
        "print(hashlib.sha1(build_plan('snap', UNITS, p).model_dump_json().encode()).hexdigest())"
    )
    root = Path(__file__).parent.parent
    digests = {
        subprocess.run(
            [sys.executable, "-c", script], cwd=root, env={**os.environ, "PYTHONHASHSEED": seed}, capture_output=True, text=True, check=True
        ).stdout.strip()
        for seed in ("1", "2", "3")
    }
    assert len(digests) == 1


def test_plan_refuses_l3_without_units_of_two_chunks():
    flat = [u.model_copy(update={"chunks": 1}) for u in UNITS]
    with pytest.raises(PlanError, match="L3"):
        build_plan("snap", flat, PARAMS)


def test_plan_cli_on_the_mini_snapshot(snap_dir: Path, tmp_path: Path, capsys):
    from seclearn_eval.cli import main

    clusters = tmp_path / "clusters.json"
    assert main(["clusters", "--snapshot", str(snap_dir), "--out", str(clusters)]) == 0
    assert main(["clusters", "--snapshot", str(snap_dir), "--out", str(clusters)]) == 1  # never overwrites a review
    assert main(["units", "--snapshot", str(snap_dir), "--clusters", str(clusters)]) == 0
    out = tmp_path / "plan.json"
    args = ["plan", "--snapshot", str(snap_dir), "--out", str(out), "--test-answerable", "30", "--test-floor", "5", "--dev-answerable", "12"]
    assert main(args) == 0
    assert "| total |" in capsys.readouterr().out and out.with_suffix(".md").is_file()
