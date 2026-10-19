"""Error bars (Miller 2024), Wilson intervals and paired comparisons, against numbers worked out by hand."""

from __future__ import annotations

import pytest

from seclearn_eval.stats import (
    cluster_difference,
    clustered_se,
    combine,
    estimate,
    fisher_per_question,
    holm,
    paired_difference,
    randomization_p,
)


def test_clustered_se_miller_eq4():
    # s = 1 0 1 1 0, s̄ = 0.6; residuals .4 -.6 .4 .4 -.6; group sums A -.2, B .4, C -.2.
    # Var(s)/n = .24/5 = .048; cross terms 2(.4)(-.6) in A and in C = -.96, / n² = -.0384; SE² = .0096.
    assert clustered_se([1, 0, 1, 1, 0], ["A", "A", "B", "C", "C"]) == pytest.approx(0.0096**0.5)


def test_clustered_se_is_wider_when_a_group_moves_together():
    # s = 1 1 0 0 in groups AABB: group sums 1 and -1, SE² = 2/16; the CLT SE would be √(.25/4) = .25.
    assert clustered_se([1, 1, 0, 0], ["A", "A", "B", "B"]) == pytest.approx(0.125**0.5)
    assert clustered_se([1, 1, 0, 0], ["A", "B", "C", "D"]) == pytest.approx(0.25)


def test_clustered_se_of_one_question_is_zero():
    assert clustered_se([1], ["A"]) == 0.0


# --- Intervals ------------------------------------------------------------------------------------


def test_small_binary_stratum_gets_a_wilson_interval():
    est = estimate([1, 0, 1, 1, 0], ["A", "A", "B", "C", "C"])
    assert (est.n, est.n_groups, est.method) == (5, 3, "wilson")
    assert est.mean == pytest.approx(0.6) and est.se == pytest.approx(0.0096**0.5)
    # Design effect .0096/.048 < 1 is floored to 1, so n_eff = 5: Wilson(0.6, 5) = (0.230720, 0.882382).
    assert (est.ci_low, est.ci_high) == (pytest.approx(0.230720, abs=1e-6), pytest.approx(0.882382, abs=1e-6))


def test_wilson_shrinks_n_by_the_design_effect():
    # SE² .125 against .0625 for independent questions: design effect 2, n_eff = 2. Wilson(0.5, 2) = (0.094529, 0.905471).
    est = estimate([1, 1, 0, 0], ["A", "A", "B", "B"])
    assert est.method == "wilson"
    assert (est.ci_low, est.ci_high) == (pytest.approx(0.094529, abs=1e-6), pytest.approx(0.905471, abs=1e-6))


def test_graded_scores_and_large_strata_get_a_normal_interval():
    # Not 0/1: SE = √(.5)/3 = .235702, CI .5 ± 1.96 SE.
    est = estimate([1, 0.5, 0], ["A", "B", "C"])
    assert est.method == "normal"
    assert (est.ci_low, est.ci_high) == (pytest.approx(0.038024, abs=1e-6), pytest.approx(0.961976, abs=1e-6))
    # 300 questions is not small: SE = √(.25/300) = .0288675, CI .5 ± .0565803.
    est = estimate([1, 0] * 150, [f"g{i}" for i in range(300)])
    assert est.method == "normal"
    assert (est.ci_low, est.ci_high) == (pytest.approx(0.4434197, abs=1e-6), pytest.approx(0.5565803, abs=1e-6))


# --- Macro and post-stratified ------------------------------------------------------------------


def two_clusters():
    # Cluster x: 1 1 0 0 in groups AABB (mean .5, SE √.125); cluster y: one question, 1 (mean 1, SE 0).
    return {"x": estimate([1, 1, 0, 0], ["A", "A", "B", "B"]), "y": estimate([1], ["C"])}


def test_macro_is_the_plain_mean_of_cluster_means():
    est = combine(two_clusters())
    # Micro would be 3/5 = .6; macro (.5 + 1)/2 = .75, SE √(.125 + 0)/2 = .176777.
    assert (est.n, est.n_groups, est.method) == (5, 3, "normal")
    assert est.mean == pytest.approx(0.75) and est.se == pytest.approx(0.125**0.5 / 2)
    assert est.ci_low == pytest.approx(0.75 - 1.96 * 0.176777, abs=1e-6)


def test_combined_interval_is_cut_to_0_1_like_a_stratum_interval():
    # Macro .75 ± 1.96 × .176777 = [.403, 1.096]: a score cannot pass 1.
    est = combine(two_clusters())
    assert est.ci_high == 1.0
    # A difference of two runs may be negative: no cut.
    diff = combine({"x": paired_difference([0, 0], [1, 1], ["A", "B"]), "y": paired_difference([0], [1], ["C"])}, bounded=False)
    assert diff.mean == -1.0 and diff.ci_low == -1.0


def test_two_clusters_differ_by_their_means_with_independent_ses():
    # x .5 ± √.125, y 1 ± 0: diff −.5, SE √.125 = .353553, z = −√2 → p = erfc(1) = .157299.
    x, y = two_clusters().values()
    diff, p = cluster_difference(x, y)
    assert diff.mean == pytest.approx(-0.5) and diff.se == pytest.approx(0.125**0.5)
    assert (diff.n, diff.n_groups, diff.method) == (5, 3, "normal")
    assert diff.ci_low == pytest.approx(-0.5 - 1.96 * 0.353553, abs=1e-6)
    assert p == pytest.approx(0.157299, abs=1e-6)
    # No spread at all (two one-question clusters): nothing to test against.
    assert cluster_difference(estimate([1], ["A"]), estimate([0], ["B"]))[1] == 1.0


def test_holm_adjusts_a_family_of_p_values():
    # Sorted .01, .03, .04 → × 3, × 2, × 1 = .03, .06, .04, kept monotone → .03, .06, .06.
    assert holm([0.01, 0.04, 0.03]) == pytest.approx([0.03, 0.06, 0.06])
    assert holm([0.6, 0.9]) == pytest.approx([1.0, 1.0])
    assert holm([]) == []


def test_post_stratified_weighs_clusters_by_corpus_share():
    # Weights 3 : 1 → .75 × .5 + .25 × 1 = .625; SE √(.75² × .125) = .265165.
    est = combine(two_clusters(), {"x": 3, "y": 1})
    assert est.mean == pytest.approx(0.625) and est.se == pytest.approx(0.265165, abs=1e-6)


# --- Paired comparison ----------------------------------------------------------------------------


def test_paired_difference_has_a_clustered_se_and_a_normal_interval():
    # d = A − B = 1 0 1 0, mean .5; residuals ±.5, group sums G1 0, G2 .5, G3 −.5 → SE² = .5/16.
    diff = paired_difference([1, 1, 1, 0], [0, 1, 0, 0], ["G1", "G1", "G2", "G3"])
    assert (diff.n, diff.n_groups, diff.method) == (4, 3, "normal")
    assert diff.mean == pytest.approx(0.5) and diff.se == pytest.approx(0.03125**0.5)
    assert diff.ci_low == pytest.approx(0.5 - 1.96 * 0.176777, abs=1e-6)


def test_randomization_flips_whole_groups():
    # Group sums of d: G1 1, G2 1, G3 0. Of the 8 sign flips, 4 give |Σ| ≥ 2: p = .5.
    assert randomization_p([1, 0, 1, 0], ["G1", "G1", "G2", "G3"]) == pytest.approx(0.5)
    # Four wins in one document are one piece of evidence, not four: every flip of G1 gives |Σ| = 4, p = 1 …
    d, groups = [1, 1, 1, 1, 0], ["G1"] * 4 + ["G2"]
    assert randomization_p(d, groups) == pytest.approx(1.0)
    # … while flipping single questions (ranx's Fisher test) finds 2 of 16 flips as extreme: p = .125.
    assert fisher_per_question([1, 1, 1, 1, 0], [0, 0, 0, 0, 0]) == pytest.approx(0.125, abs=0.02)


def test_randomization_weights_give_the_macro_statistic():
    # Macro over x (G1, G2) and y (G3): weights 1/(2·2), 1/(2·2), 1/(2·1); d = 1, −1, 1.
    # Group terms (¼, −¼, ½), T_obs = ½. With G3 kept, ±¼ ∓ ¼ gives 0, ½, −½, 0 → T = ½, 1, 0, ½;
    # with G3 flipped, the mirror image. |T| ≥ ½ in 6 of 8 flips → p = .75 (micro weights would give 1.0).
    w = [0.25, 0.25, 0.5]
    assert randomization_p([1, -1, 1], ["G1", "G2", "G3"], weights=w) == pytest.approx(0.75)
    assert randomization_p([1, -1, 1], ["G1", "G2", "G3"]) == pytest.approx(1.0)


def test_randomization_samples_flips_when_groups_are_many():
    # 30 groups, 3 with d = 1: exactly 2 of the 8 flips of those three reach |Σ| = 3, p = .25.
    d, groups = [1, 1, 1] + [0] * 27, [f"g{i}" for i in range(30)]
    p = randomization_p(d, groups, n_permutations=20000, seed=7)
    assert p == pytest.approx(0.25, abs=0.015)
    assert randomization_p(d, groups, n_permutations=20000, seed=7) == p
