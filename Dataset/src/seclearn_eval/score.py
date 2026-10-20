"""Scores of one run (and its paired comparison with a baseline) on the answerable questions, with error bars.

Retrieval metrics per question come from ranx (Hit@k, MRR@10, nDCG@10, Recall@k) and ir-measures (Judged@10);
everything after that (micro, macro over topic clusters, levels, post-stratified, SEs, intervals, comparisons)
is `stats`. L6 questions never enter these numbers: they are scored apart as refusals.
"""

from __future__ import annotations

import math
import warnings
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from itertools import combinations

from .clusters import WSTG_KEY
from .schema import (
    AnswerLine,
    ClusterDifference,
    Comparison,
    Estimate,
    QrelLine,
    Question,
    Refusals,
    RunLine,
    ScoreReport,
    SeSensitivity,
    Stratum,
    Unit,
)
from .stats import (
    SEED,
    cluster_difference,
    clustered_se,
    combine,
    estimate,
    fisher_per_question,
    holm,
    paired_difference,
    randomization_p,
)

#: Reported metrics. Binary ones (hit, MRR, recall) count a chunk relevant from `min_grade`; nDCG uses the grades.
METRICS = ["hit@1", "hit@5", "hit@10", "mrr@10", "ndcg@10", "recall@5", "recall@10", "judged@10"]
MIN_GRADE = 2
_RANX = {"hit": "hit_rate", "mrr": "mrr", "ndcg": "ndcg", "recall": "recall"}


class ScoreError(Exception):
    """Inputs that cannot be scored (say, an answerable question without a relevant chunk in qrels)."""


def error_group(q: Question, by_id: dict[str, Question]) -> str:
    """The unit a question's score is correlated within: its document, or its WSTG test case (any WSTG unit),
    taken from the question it was made from (`seed_id`) so variants fall in their seed's group.

    L4 / L5 questions span two units of one cluster; they go with their first unit.
    """
    seed = by_id.get(q.seed_id, q)
    if seed.unit_ids:
        return _unit_group(seed.unit_ids[0])
    if seed.gold_evidence:
        return seed.gold_evidence[0].doc_key
    return f"seed:{seed.id}"


def _unit_group(unit: str) -> str:
    doc = unit.split("#", 1)[0]
    return unit if doc == WSTG_KEY else doc


#: Levels whose questions span two units (of one topic cluster): the only ones `pair_merged_groups` merges for.
PAIR_LEVELS = ("L4", "L5")


def pair_merged_groups(questions: Sequence[Question], by_id: dict[str, Question]) -> dict[str, str]:
    """qid → error group when every L4 / L5 question joins the groups of all its units (union-find), so the
    documents it spans, and every question in them, share one group.

    A merge never crosses topic clusters: a unit's group joins only when every question already in the two groups
    is in the L4 / L5 question's own cluster (a group's cluster is that of the questions whose main group it is).
    Questions of other levels never merge, whatever their `unit_ids`."""
    parent: dict[str, str] = {}
    main = {q.id: error_group(q, by_id) for q in questions}
    clusters: dict[str, set[str | None]] = defaultdict(set)
    for q in questions:
        clusters[main[q.id]].add(q.cluster)

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for q in questions:
        if q.strata.level not in PAIR_LEVELS:
            continue
        for unit in by_id.get(q.seed_id, q).unit_ids[1:]:
            a, b = find(main[q.id]), find(_unit_group(unit))
            if a == b or not (clusters[a] | clusters[b]) <= {q.cluster}:
                continue
            root, child = min(a, b), max(a, b)
            parent[child] = root
            clusters[root] |= clusters.pop(child, set())
    return {qid: find(g) for qid, g in main.items()}


def per_question(
    qrels: Sequence[QrelLine], run: Sequence[RunLine], qids: Sequence[str], min_grade: int = MIN_GRADE
) -> dict[str, dict[str, float]]:
    """metric → qid → score for every qid in `qids`; a question the run has nothing for scores 0.

    The ranking is the run's `rank` column (scores are ignored, so ties in score cannot reorder chunks).
    """
    import ir_measures
    from ranx import Qrels, Run, evaluate

    wanted = set(qids)
    graded: dict[str, dict[str, int]] = defaultdict(dict)
    for line in qrels:
        if line.qid in wanted:
            graded[line.qid][line.chunk_key] = line.grade
    if no_rel := sorted(q for q in qids if not any(g >= min_grade for g in graded.get(q, {}).values())):
        raise ScoreError(f"{len(no_rel)} answerable question(s) without a chunk of grade ≥ {min_grade} in qrels: {no_rel[:5]}")
    ranked: dict[str, dict[str, float]] = defaultdict(dict)
    for line in run:
        if line.qid in wanted:
            ranked[line.qid][line.chunk_key] = 1.0 / line.rank

    out = {m: {q: 0.0 for q in qids} for m in METRICS}
    ranx_metrics = {m: _ranx_name(m, min_grade) for m in METRICS if not m.startswith("judged")}
    present = [q for q in qids if ranked.get(q)]
    if present:
        r = Run({q: ranked[q] for q in present}, name="run")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            evaluate(Qrels({q: graded[q] for q in present}), r, list(ranx_metrics.values()), return_mean=False)
        for m, name in ranx_metrics.items():
            for q, v in r.scores[name].items():
                out[m][q] = float(v)
        judged = ir_measures.parse_measure("Judged@10")
        qrels_ir = [ir_measures.Qrel(q, c, g) for q in present for c, g in graded[q].items()]
        run_ir = [ir_measures.ScoredDoc(q, c, s) for q in present for c, s in ranked[q].items()]
        for metric in ir_measures.iter_calc([judged], qrels_ir, run_ir):
            out["judged@10"][metric.query_id] = float(metric.value)
    return out


def _ranx_name(metric: str, min_grade: int) -> str:
    name, k = metric.split("@")
    base = f"{_RANX[name]}@{k}"
    return base if name == "ndcg" else f"{base}-l{min_grade}"


def poststrat_weights(units: Sequence[Unit], clusters: Sequence[str]) -> dict[str, float]:
    """Share of the corpus' sampleable chunks in each topic cluster that has questions, summing to 1."""
    chunks: dict[str, int] = defaultdict(int)
    for u in units:
        if u.sampleable and u.cluster in clusters:
            chunks[u.cluster] += u.weight_chunks
    total = sum(chunks.values())
    return {c: chunks[c] / total for c in sorted(clusters) if total}


@dataclass
class ScoreInputs:
    run_id: str
    questions: list[Question]
    qrels: list[QrelLine]
    run: list[RunLine]
    questions_file: str = ""
    qrels_file: str = ""
    baseline_id: str | None = None
    baseline: list[RunLine] | None = None
    units: list[Unit] | None = None
    answers: list[AnswerLine] | None = None
    min_grade: int = MIN_GRADE
    seed: int = SEED


def score(inputs: ScoreInputs) -> ScoreReport:
    by_id = {q.id: q for q in inputs.questions}
    answerable = [q for q in inputs.questions if q.strata.answerable]
    if missing := [q.id for q in answerable if q.cluster is None]:
        raise ScoreError(f"answerable question(s) without a topic cluster: {missing[:5]}")
    qids = [q.id for q in answerable]
    groups = {q.id: error_group(q, by_id) for q in answerable}
    scores = per_question(inputs.qrels, inputs.run, qids, inputs.min_grade)

    by_cluster: dict[str, list[str]] = defaultdict(list)
    by_level: dict[str, list[str]] = defaultdict(list)
    for q in answerable:
        by_cluster[q.cluster].append(q.id)
        by_level[q.strata.level].append(q.id)

    def est(metric: str, ids: list[str]) -> Estimate:
        return estimate([scores[metric][i] for i in ids], [groups[i] for i in ids])

    weights = poststrat_weights(inputs.units, list(by_cluster)) if inputs.units is not None else {}
    strata = [Stratum(scope="micro", estimates={m: est(m, qids) for m in METRICS})]
    cluster_est = {m: {c: est(m, ids) for c, ids in by_cluster.items()} for m in METRICS}
    strata.append(Stratum(scope="macro", estimates={m: combine(cluster_est[m]) for m in METRICS}))
    if weights:
        strata.append(Stratum(scope="poststrat", estimates={m: combine(cluster_est[m], weights) for m in METRICS}))
    strata += [Stratum(scope="cluster", key=c, estimates={m: cluster_est[m][c] for m in METRICS}) for c in sorted(by_cluster)]
    strata += [Stratum(scope="level", key=lv, estimates={m: est(m, by_level[lv]) for m in METRICS}) for lv in sorted(by_level)]

    sens = se_sensitivity(
        scores, strata, by_cluster, by_level, pair_merged_groups(answerable, by_id), {q.id: q.cluster for q in answerable}
    )

    comparisons: list[Comparison] = []
    if inputs.baseline is not None:
        base = per_question(inputs.qrels, inputs.baseline, qids, inputs.min_grade)
        comparisons = _compare(scores, base, qids, groups, by_cluster, inputs.seed)

    return ScoreReport(
        run_id=inputs.run_id,
        baseline_id=inputs.baseline_id,
        questions_file=inputs.questions_file,
        qrels_file=inputs.qrels_file,
        min_grade=inputs.min_grade,
        metrics=METRICS,
        poststrat_weights=weights,
        strata=strata,
        se_sensitivity=sens,
        comparisons=comparisons,
        cluster_differences=cluster_differences(cluster_est),
        refusals=refusals(inputs.questions, inputs.answers, by_id),
    )


def se_sensitivity(
    scores: dict[str, dict[str, float]],
    strata: list[Stratum],
    by_cluster: dict[str, list[str]],
    by_level: dict[str, list[str]],
    merged: dict[str, str],
    topic: dict[str, str],
) -> list[SeSensitivity]:
    """The SEs of the main strata recomputed with pair-merged groups (micro, macro, clusters, levels) and with
    group = topic cluster (micro only), each beside the main SE it is a check on (ticket 13)."""
    main = {(s.scope, s.key): s for s in strata}

    def regrouped_se(ids: list[str], groups: dict[str, str]) -> tuple[int, dict[str, float]]:
        """(number of groups, metric → clustered SE) of the questions `ids` under the grouping `groups`."""
        g = [groups[i] for i in ids]
        return len(set(g)), {m: clustered_se([scores[m][i] for i in ids], g) for m in METRICS}

    def beside_main(grouping: str, scope: str, key: str | None, n_groups: int, se: dict[str, float]) -> SeSensitivity:
        est = main[(scope, key)].estimates
        return SeSensitivity(
            grouping=grouping,
            scope=scope,
            key=key,
            n_groups=n_groups,
            n_groups_main=est[METRICS[0]].n_groups,
            se=se,
            ratio={m: se[m] / est[m].se if est[m].se > 0 else None for m in METRICS},
        )

    qids = [i for ids in by_cluster.values() for i in ids]
    clusters = {c: regrouped_se(ids, merged) for c, ids in by_cluster.items()}
    k = len(clusters)
    # Macro, as in `stats.combine`: groups nest in topic clusters (merges never cross them), so SE² = Σ (1/K)² SE²_cluster.
    macro_se = {m: math.sqrt(sum((se[m] / k) ** 2 for _, se in clusters.values())) for m in METRICS}
    return [
        beside_main("pair_merged", "micro", None, *regrouped_se(qids, merged)),
        beside_main("topic_cluster", "micro", None, *regrouped_se(qids, topic)),
        beside_main("pair_merged", "macro", None, sum(n for n, _ in clusters.values()), macro_se),
        *(beside_main("pair_merged", "cluster", c, *clusters[c]) for c in sorted(clusters)),
        *(beside_main("pair_merged", "level", lv, *regrouped_se(by_level[lv], merged)) for lv in sorted(by_level)),
    ]


def cluster_differences(cluster_est: dict[str, dict[str, Estimate]]) -> list[ClusterDifference]:
    """Every pair of topic clusters on every metric, p-values Holm-adjusted over the pairs of one metric."""
    out: list[ClusterDifference] = []
    for m, by_cluster in cluster_est.items():
        pairs = list(combinations(sorted(by_cluster), 2))
        tested = [cluster_difference(by_cluster[a], by_cluster[b]) for a, b in pairs]
        adjusted = holm([p for _, p in tested])
        out += [
            ClusterDifference(metric=m, cluster_a=a, cluster_b=b, diff=diff, p_value=p, p_adjusted=p_adj)
            for (a, b), (diff, p), p_adj in zip(pairs, tested, adjusted, strict=True)
        ]
    return out


def _compare(
    a: dict[str, dict[str, float]],
    b: dict[str, dict[str, float]],
    qids: list[str],
    groups: dict[str, str],
    by_cluster: dict[str, list[str]],
    seed: int,
) -> list[Comparison]:
    out: list[Comparison] = []
    k = len(by_cluster)
    for m in METRICS:
        def paired(ids: list[str], m: str = m) -> Estimate:
            return paired_difference([a[m][i] for i in ids], [b[m][i] for i in ids], [groups[i] for i in ids])

        def diffs(ids: list[str], m: str = m) -> list[float]:
            return [a[m][i] - b[m][i] for i in ids]

        g = [groups[i] for i in qids]
        out.append(
            Comparison(
                metric=m,
                scope="micro",
                diff=paired(qids),
                p_value=randomization_p(diffs(qids), g, seed=seed),
                p_value_per_question=fisher_per_question([a[m][i] for i in qids], [b[m][i] for i in qids], seed=seed),
            )
        )
        per_cluster = {c: paired(ids) for c, ids in by_cluster.items()}
        ordered = [i for c in by_cluster for i in by_cluster[c]]
        w = [1.0 / (k * len(by_cluster[c])) for c in by_cluster for _ in by_cluster[c]]
        out.append(
            Comparison(
                metric=m,
                scope="macro",
                diff=combine(per_cluster, bounded=False),
                p_value=randomization_p(diffs(ordered), [groups[i] for i in ordered], weights=w, seed=seed),
            )
        )
        for c in sorted(by_cluster):
            ids = by_cluster[c]
            p = randomization_p(diffs(ids), [groups[i] for i in ids], seed=seed)
            out.append(Comparison(metric=m, scope="cluster", key=c, diff=per_cluster[c], p_value=p))
    return out


def refusals(questions: list[Question], answers: list[AnswerLine] | None, by_id: dict[str, Question]) -> Refusals:
    """Correct refusals on L6 (overall and per kind) and false refusals on answerable questions, per question the
    share of its K answers that refused. Unmeasured until a run has answers."""
    l6 = [q for q in questions if not q.strata.answerable]
    answerable = [q for q in questions if q.strata.answerable]
    out = Refusals(l6_questions=len(l6), answerable_questions=len(answerable), measured=answers is not None)
    if answers is None:
        return out
    refused: dict[str, list[bool]] = defaultdict(list)
    for a in answers:
        refused[a.qid].append(a.refused)
    if missing := [q.id for q in questions if q.id not in refused]:
        raise ScoreError(f"{len(missing)} question(s) without an answer: {missing[:5]}")

    def est(qs: list[Question]) -> Estimate:
        rates = [sum(refused[q.id]) / len(refused[q.id]) for q in qs]
        return estimate(rates, [error_group(q, by_id) for q in qs])

    kinds: dict[str, list[Question]] = defaultdict(list)
    for q in l6:
        kinds[q.strata.l6_kind or "unknown"].append(q)
    out.correct_refusal = ({"all": est(l6)} | {k: est(v) for k, v in sorted(kinds.items())}) if l6 else {}
    out.false_refusal = est(answerable) if answerable else None
    return out
