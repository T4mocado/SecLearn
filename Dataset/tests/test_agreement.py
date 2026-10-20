"""`judge agreement`: Gemini × human on the pool, and the annotator against themself, on numbers worked out by hand.

Gemini × human, six chunks (llm, human): (0,0) (1,1) (2,2) (3,3) (0,1) (2,3).
  Gemini margins 2 1 2 1, human margins 1 2 1 2, N = 6.
  Linear:    observed Σ|i-j| = 2,  expected Σ a_i b_j |i-j| = 46  → κ = 1 - (2/6)/(46/36) = 17/23.
  Quadratic: observed Σ(i-j)² = 2, expected Σ a_i b_j (i-j)² = 92 → κ = 1 - (2/6)/(92/36) = 20/23.

Stability, four chunks graded twice (first, again): (3,3) (2,1) (0,0) (1,1).
  Linear κ = 1 - (1/4)/(20/16) = 0.8, quadratic κ = 1 - (1/4)/(40/16) = 0.9, exact 3/4.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from seclearn_eval.agreement import agreement_report, render_agreement, weighted_kappa
from seclearn_eval.schema import Label, PoolEntry

T0 = datetime(2026, 11, 1, tzinfo=UTC)
PAIRS = [(0, 0), (1, 1), (2, 2), (3, 3), (0, 1), (2, 3)]


def entry(qid: str, chunk: str, llm: int, for_human: bool = True) -> PoolEntry:
    return PoolEntry(question_id=qid, chunk_key=chunk, systems=["bm25"], covers_gold=False, llm_grade=llm,
                     chunker_version="sentence-v2", for_human=for_human)


def label(qid: str, chunk: str, grade: int, at: datetime = T0) -> Label:
    return Label(question_id=qid, task="pool", chunk_key=chunk, grade=grade, annotator="me", annotated_at=at,
                 guideline_version="v1", snapshot_id="s")


def test_weighted_kappa_matches_the_hand_computed_values():
    assert weighted_kappa(PAIRS, "linear") == pytest.approx(17 / 23)
    assert weighted_kappa(PAIRS, "quadratic") == pytest.approx(20 / 23)
    assert weighted_kappa([(0, 0), (3, 3), (1, 1)], "quadratic") == pytest.approx(1.0)


def test_a_sample_weight_counts_like_repeating_the_item():
    repeated = [*PAIRS, (0, 1), (0, 1)]
    weights = [1, 1, 1, 1, 3, 1]
    assert weighted_kappa(PAIRS, "quadratic", weights) == pytest.approx(weighted_kappa(repeated, "quadratic"))


def test_report_gives_kappa_per_level_agreement_and_both_confusion_matrices():
    pool = [entry("q1", f"c#{i}", llm) for i, (llm, _) in enumerate(PAIRS)]
    labels = [label("q1", f"c#{i}", human) for i, (_, human) in enumerate(PAIRS)]
    r = agreement_report(pool, labels)
    assert r.n_judged == 6
    assert r.exact == pytest.approx(4 / 6)
    assert r.kappa_linear == pytest.approx(17 / 23)
    assert r.kappa_quadratic == pytest.approx(20 / 23)
    # Share of chunks at each human grade that Gemini graded the same.
    assert r.per_level == {"0": pytest.approx(1.0), "1": pytest.approx(0.5), "2": pytest.approx(1.0), "3": pytest.approx(0.5)}
    # Rows Gemini, columns human.
    assert r.confusion == [[1, 1, 0, 0], [0, 1, 0, 0], [0, 0, 1, 1], [0, 0, 0, 1]]
    assert r.confusion_binary == [[3, 0], [0, 3]]  # [not relevant, relevant (≥ 2)]
    assert "17/23" not in render_agreement(r) and "0.739" in render_agreement(r)


def test_false_negatives_are_estimated_from_the_sample_of_gemini_zeros():
    # 40 Gemini zeros in the pool, 10 sampled for the human: one of them is really relevant (human 2).
    pool = [entry("q1", f"z#{i}", 0, for_human=i < 10) for i in range(40)] + [entry("q1", "p#0", 3)]
    labels = [label("q1", f"z#{i}", 2 if i == 0 else (1 if i == 1 else 0)) for i in range(10)] + [label("q1", "p#0", 3)]
    fn = agreement_report(pool, labels).false_negatives
    assert (fn.n_llm_zero, fn.n_sampled, fn.n_missed) == (40, 10, 1)
    assert fn.rate == pytest.approx(0.1)
    assert (fn.ci_low, fn.ci_high) == (pytest.approx(0.0179, abs=1e-3), pytest.approx(0.4042, abs=1e-3))
    assert fn.est_missed == pytest.approx(4.0)


def test_stability_pairs_the_first_and_the_latest_grade_at_least_a_week_apart():
    graded = [(3, 3), (2, 1), (0, 0), (1, 1)]
    labels = [label("q1", f"c#{i}", a) for i, (a, _) in enumerate(graded)]
    labels += [label("q1", f"c#{i}", b, T0 + timedelta(days=8)) for i, (_, b) in enumerate(graded)]
    # Graded again the next day: not a stability pair.
    labels += [label("q2", "c#9", 0), label("q2", "c#9", 3, T0 + timedelta(days=1))]
    s = agreement_report([], labels).stability
    assert (s.n_pairs, s.n_too_close) == (4, 1)
    assert s.exact == pytest.approx(0.75)
    assert s.kappa_linear == pytest.approx(0.8)
    assert s.kappa_quadratic == pytest.approx(0.9)
    assert s.min_gap_days == pytest.approx(8.0)
