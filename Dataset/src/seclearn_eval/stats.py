"""Error bars for eval scores: cluster-adjusted standard errors (Miller 2024, "Adding Error Bars to Evals"),
Wilson intervals for small strata, and paired comparisons with a cluster-level randomization test.

A *group* here is the unit questions are correlated within: a document, or a WSTG test case, with variants
gathered by `seed_id`. It is not a topic cluster (`cụm chủ đề`): topic clusters are strata, groups nest in them.
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Hashable, Sequence

from .schema import Estimate


def clustered_se(values: Sequence[float], groups: Sequence[Hashable]) -> float:
    """Standard error of the mean of `values`, adjusted for correlation within `groups` (Miller 2024, eq. 4).

    SE² = Var(s)/n + (1/n²) Σ_groups Σ_i Σ_{j≠i} (s_i − s̄)(s_j − s̄), with Var(s) the population variance
    (1/n, as in Miller's p(1−p) for binary scores). This equals (1/n²) Σ_groups (Σ_i (s_i − s̄))².
    """
    n = len(values)
    if n != len(groups):
        raise ValueError(f"{n} values but {len(groups)} groups")
    if n == 0:
        raise ValueError("no values")
    mean = sum(values) / n
    sums: dict[Hashable, float] = defaultdict(float)
    for v, g in zip(values, groups, strict=True):
        sums[g] += v - mean
    return math.sqrt(sum(s * s for s in sums.values())) / n


#: Strata below this many questions get a Wilson interval (spec user story 62), when the scores are 0/1.
SMALL = 300
Z = 1.96


def wilson(p: float, n: float, z: float = Z) -> tuple[float, float]:
    """Wilson score interval for a proportion `p` over `n` (possibly effective, non-integer) trials."""
    d = 1 + z * z / n
    center = (p + z * z / (2 * n)) / d
    half = z / d * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return max(0.0, center - half), min(1.0, center + half)


def estimate(values: Sequence[float], groups: Sequence[Hashable], small: int = SMALL) -> Estimate:
    """Mean, cluster-adjusted SE and 95% interval of one stratum.

    0/1 scores in a stratum under `small` questions get a Wilson interval on the effective sample size
    n / design effect, the design effect being SE²_clustered / (p(1−p)/n), floored at 1 so clustering never
    narrows the interval. Everything else gets mean ± 1.96 SE, cut to [0, 1] when every score lies there.
    """
    n = len(values)
    mean = sum(values) / n
    se = clustered_se(values, groups)
    if n < small and all(v in (0, 1) for v in values):
        iid = mean * (1 - mean) / n
        deff = max(1.0, se * se / iid) if iid > 0 else 1.0
        low, high = wilson(mean, n / deff)
        method = "wilson"
    else:
        low, high = mean - Z * se, mean + Z * se
        if all(0 <= v <= 1 for v in values):
            low, high = max(0.0, low), min(1.0, high)
        method = "normal"
    return Estimate(n=n, n_groups=len(set(groups)), mean=mean, se=se, ci_low=low, ci_high=high, method=method)


def combine(strata: dict[str, Estimate], weights: dict[str, float] | None = None, *, bounded: bool = True) -> Estimate:
    """Weighted mean of stratum means: equal weights for macro over topic clusters, corpus shares for post-stratified.

    Topic clusters share no error group (groups nest in clusters), so SE² = Σ w_k² SE_k² with weights summing to 1.
    The interval is normal: the combined stratum is the whole split, well above the Wilson threshold. It is cut to
    [0, 1] like `estimate`'s, unless `bounded` is False (differences of two runs, which may be negative).
    """
    raw = weights if weights is not None else {k: 1.0 for k in strata}
    if missing := set(strata) - set(raw):
        raise ValueError(f"no weight for {sorted(missing)}")
    total = sum(raw[k] for k in strata)
    w = {k: raw[k] / total for k in strata}
    mean = sum(w[k] * e.mean for k, e in strata.items())
    se = math.sqrt(sum((w[k] * e.se) ** 2 for k, e in strata.items()))
    low, high = mean - Z * se, mean + Z * se
    if bounded:
        low, high = max(0.0, low), min(1.0, high)
    return Estimate(
        n=sum(e.n for e in strata.values()),
        n_groups=sum(e.n_groups for e in strata.values()),
        mean=mean,
        se=se,
        ci_low=low,
        ci_high=high,
        method="normal",
    )


#: Significance level for concluding that two topic clusters differ (after the Holm adjustment).
ALPHA = 0.05


def cluster_difference(a: Estimate, b: Estimate) -> tuple[Estimate, float]:
    """Topic cluster A minus topic cluster B on one metric, and the two-sided p-value of a z test (spec user story 65).

    The two clusters hold different questions and share no error group, so SE² = SE_A² + SE_B² from their clustered SEs.
    With no spread at all (SE 0, e.g. two one-question clusters) there is nothing to test against: p = 1.
    """
    mean = a.mean - b.mean
    se = math.sqrt(a.se**2 + b.se**2)
    p = math.erfc(abs(mean / se) / math.sqrt(2)) if se > 0 else 1.0
    diff = Estimate(
        n=a.n + b.n, n_groups=a.n_groups + b.n_groups, mean=mean, se=se, ci_low=mean - Z * se, ci_high=mean + Z * se, method="normal"
    )
    return diff, p


def holm(p_values: Sequence[float]) -> list[float]:
    """Holm-Bonferroni adjusted p-values, in the input order: for the family of all cluster pairs on one metric."""
    m = len(p_values)
    order = sorted(range(m), key=lambda i: p_values[i])
    out = [0.0] * m
    running = 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (m - rank) * p_values[i]))
        out[i] = running
    return out


def paired_difference(a: Sequence[float], b: Sequence[float], groups: Sequence[Hashable]) -> Estimate:
    """A − B on the same questions: the mean of per-question differences, with the clustered SE of those differences.

    This is Miller 2024 eq. 8 (Var(A) + Var(B) − 2 Cov(A, B), over n) with the eq. 4 cluster adjustment applied to
    the differences. The interval is always normal: differences are not proportions.
    """
    if len(a) != len(b):
        raise ValueError(f"{len(a)} scores against {len(b)}: a paired comparison needs the same questions")
    d = [x - y for x, y in zip(a, b, strict=True)]
    mean = sum(d) / len(d)
    se = clustered_se(d, groups)
    return Estimate(
        n=len(d), n_groups=len(set(groups)), mean=mean, se=se, ci_low=mean - Z * se, ci_high=mean + Z * se, method="normal"
    )


#: Up to this many error groups the randomization test enumerates every flip (2^16 = 65,536).
EXACT_GROUPS = 16
PERMUTATIONS = 20_000
SEED = 20261018


def randomization_p(
    diffs: Sequence[float],
    groups: Sequence[Hashable],
    weights: Sequence[float] | None = None,
    n_permutations: int = PERMUTATIONS,
    seed: int = SEED,
) -> float:
    """Two-sided p-value of T = Σ w_i d_i under H0 "A and B are exchangeable", swapping A and B for a whole error
    group at once (a sign flip of the group's differences), so questions of one document move together.

    `weights` default to 1/n (micro); macro passes 1/(K · n_cluster). Exact over all 2^G flips when G is at most
    EXACT_GROUPS, else `n_permutations` random flips with a fixed seed, p = (1 + hits) / (1 + n_permutations).
    """
    import numpy as np

    n = len(diffs)
    w = list(weights) if weights is not None else [1.0 / n] * n
    terms: dict[Hashable, float] = defaultdict(float)
    for d, g, wi in zip(diffs, groups, w, strict=True):
        terms[g] += wi * d
    s = np.array([terms[g] for g in sorted(terms, key=str)])
    observed = abs(s.sum()) - 1e-12
    if len(s) <= EXACT_GROUPS:
        bits = (np.arange(2 ** len(s))[:, None] >> np.arange(len(s))) & 1
        stats = np.abs((1 - 2 * bits) @ s)
        return float((stats >= observed).mean())
    rng = np.random.default_rng(seed)
    signs = rng.choice((-1.0, 1.0), size=(n_permutations, len(s)))
    hits = int((np.abs(signs @ s) >= observed).sum())
    return (1 + hits) / (1 + n_permutations)


def fisher_per_question(a: Sequence[float], b: Sequence[float], n_permutations: int = PERMUTATIONS, seed: int = SEED) -> float:
    """ranx's Fisher randomization test (Smucker et al. 2007), swapping single questions; ignores error groups."""
    import numpy as np
    from ranx.statistical_tests import fisher_randomization_test

    p, _ = fisher_randomization_test(
        np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64), n_permutations, 0.05, seed
    )
    return float(p)
