"""How far the LLM judge can be trusted on the pool (spec user story 56), and how stable the one annotator is (user story 50).

Gemini × human is computed on the chunks the human graded: every Gemini grade ≥ 1 and the fixed-seed sample of Gemini
zeros. That set over-represents Gemini's positives, so a second quadratic κ weights each sampled zero by
n_zero / n_sampled, as if the whole pool had been graded. The dangerous error of a pool judge is the false negative
(Gemini 0, really relevant): that chunk never reaches qrels and the systems that found it look worse. The sample of
zeros estimates its rate, with a Wilson interval.

The human grade of a chunk is its latest pool label, as in qrels. Stability pairs the latest grade of a chunk graded
twice by the same annotator with the first grade made under the same guideline version, at least `STABILITY_MIN_DAYS`
apart: a grade changed by a new guideline is not instability.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from typing import Literal

from .qrels import latest_pool_labels
from .schema import AgreementReport, FalseNegatives, Label, PoolEntry, Stability
from .stats import wilson

GRADES = 4
#: A chunk at this grade or above is relevant (binary confusion matrix, false negatives), as in `score`.
RELEVANT = 2
STABILITY_MIN_DAYS = 7

Weights = Literal["linear", "quadratic"]
#: (rater a, rater b) grades of one item.
GradePair = tuple[int, int]


def weighted_kappa(pairs: Sequence[GradePair], weights: Weights, sample_weights: Sequence[float] | None = None, k: int = GRADES) -> float | None:
    """Cohen's weighted κ of (rater a, rater b) grades 0..k-1: 1 - observed / expected disagreement (Cohen 1968)."""
    w = list(sample_weights) if sample_weights is not None else [1.0] * len(pairs)
    total = sum(w)
    if not pairs or total == 0:
        return None
    power = 1 if weights == "linear" else 2

    def disagreement(i: int, j: int) -> int:
        return abs(i - j) ** power

    observed = sum(wt * disagreement(a, b) for (a, b), wt in zip(pairs, w, strict=True)) / total
    rows, cols = [0.0] * k, [0.0] * k
    for (a, b), wt in zip(pairs, w, strict=True):
        rows[a] += wt
        cols[b] += wt
    expected = sum(rows[i] * cols[j] * disagreement(i, j) for i in range(k) for j in range(k)) / (total * total)
    if expected == 0:
        return 1.0 if observed == 0 else None
    return 1 - observed / expected


def confusion(pairs: Sequence[GradePair], k: int = GRADES) -> list[list[int]]:
    m = [[0] * k for _ in range(k)]
    for a, b in pairs:
        m[a][b] += 1
    return m


def _binary(pairs: Sequence[GradePair]) -> list[list[int]]:
    return confusion([(int(a >= RELEVANT), int(b >= RELEVANT)) for a, b in pairs], k=2)


def _exact(pairs: Sequence[GradePair]) -> float | None:
    return sum(a == b for a, b in pairs) / len(pairs) if pairs else None


def _false_negatives(pool: list[PoolEntry], human: dict[tuple[str, str], int]) -> FalseNegatives:
    zeros = [e for e in pool if e.llm_grade == 0]
    sampled = [human[(e.question_id, e.chunk_key)] for e in zeros if e.for_human and (e.question_id, e.chunk_key) in human]
    missed = sum(g >= RELEVANT for g in sampled)
    if not sampled:
        return FalseNegatives(n_llm_zero=len(zeros), n_sampled=0, n_missed=0, rate=None, ci_low=None, ci_high=None, est_missed=None)
    rate = missed / len(sampled)
    low, high = wilson(rate, len(sampled))
    return FalseNegatives(n_llm_zero=len(zeros), n_sampled=len(sampled), n_missed=missed, rate=rate, ci_low=low, ci_high=high,
                          est_missed=rate * len(zeros))


def _grade(lab: Label) -> int:
    if lab.grade is None:
        raise ValueError(f"{lab.question_id} {lab.chunk_key}: pool label without a grade")
    return lab.grade


def stability(labels: list[Label], min_days: int = STABILITY_MIN_DAYS) -> Stability:
    graded: dict[tuple[str, str, str], list[Label]] = defaultdict(list)
    for lab in labels:
        if lab.task == "pool" and lab.grade is not None and lab.chunk_key:
            graded[(lab.question_id, lab.chunk_key, lab.annotator)].append(lab)
    pairs: list[GradePair] = []
    gaps: list[float] = []
    too_close = version_mismatch = 0
    for grades in graded.values():
        if len(grades) < 2:
            continue
        grades.sort(key=lambda lab: lab.annotated_at)
        last = grades[-1]
        same_version = [lab for lab in grades if lab.guideline_version == last.guideline_version]
        if len(same_version) < 2:
            version_mismatch += 1
            continue
        first = same_version[0]
        gap = (last.annotated_at - first.annotated_at).total_seconds() / 86400
        if gap < min_days:
            too_close += 1
            continue
        pairs.append((_grade(first), _grade(last)))
        gaps.append(gap)
    return Stability(
        min_days=min_days,
        n_pairs=len(pairs),
        n_too_close=too_close,
        n_version_mismatch=version_mismatch,
        min_gap_days=min(gaps) if gaps else None,
        exact=_exact(pairs),
        kappa_linear=weighted_kappa(pairs, "linear"),
        kappa_quadratic=weighted_kappa(pairs, "quadratic"),
    )


def agreement_report(pool: list[PoolEntry], labels: list[Label]) -> AgreementReport:
    # The pool file holds no snapshot id: agreement takes the pool labels of every snapshot.
    human = {k: _grade(lab) for k, lab in latest_pool_labels(labels, None).items()}
    judged = [(e, e.llm_grade, human[(e.question_id, e.chunk_key)]) for e in pool
              if e.llm_grade is not None and (e.question_id, e.chunk_key) in human]
    pairs: list[GradePair] = [(llm, h) for _, llm, h in judged]
    fn = _false_negatives(pool, human)
    zero_weight = fn.n_llm_zero / fn.n_sampled if fn.n_sampled else 1.0
    weights = [zero_weight if e.llm_grade == 0 and e.for_human else 1.0 for e, _, _ in judged]
    per_level: dict[str, float] = {}
    for g in range(GRADES):
        at = [a for a, b in pairs if b == g]
        if at:
            per_level[str(g)] = sum(a == g for a in at) / len(at)
    return AgreementReport(
        judge_models=sorted({e.llm_model for e in pool if e.llm_model}),
        prompt_versions=sorted({e.llm_prompt_version for e in pool if e.llm_prompt_version}),
        n_judged=len(pairs),
        exact=_exact(pairs),
        per_level=per_level,
        kappa_linear=weighted_kappa(pairs, "linear"),
        kappa_quadratic=weighted_kappa(pairs, "quadratic"),
        kappa_quadratic_pool_weighted=weighted_kappa(pairs, "quadratic", weights),
        confusion=confusion(pairs),
        confusion_binary=_binary(pairs),
        false_negatives=fn,
        stability=stability(labels),
    )


# --- Markdown ------------------------------------------------------------------------------------


def fmt(x: float | None, digits: int = 3) -> str:
    """A number of the agreement report, "-" when it could not be computed."""
    return "-" if x is None else f"{x:.{digits}f}"


def render_judge_agreement(r: AgreementReport, heading: str = "##") -> str:
    """Gemini × human: κ, per-level agreement, both confusion matrices and false negatives, sections at `heading`."""
    fn = r.false_negatives
    lines = [
        f"Judge: {', '.join(r.judge_models) or '-'}; prompt: {', '.join(r.prompt_versions) or '-'}; {r.n_judged} chunk người đã chấm.",
        "",
        "| Chỉ số | Giá trị |",
        "|---|---|",
        f"| Đồng ý tuyệt đối | {fmt(r.exact)} |",
        f"| κ trọng số tuyến tính | {fmt(r.kappa_linear)} |",
        f"| κ trọng số bậc hai | {fmt(r.kappa_quadratic)} |",
        f"| κ bậc hai, gia trọng như chấm toàn pool | {fmt(r.kappa_quadratic_pool_weighted)} |",
        "",
        "Tỉ lệ đồng ý theo mức (trong các chunk người chấm mức đó, phần Gemini chấm cùng mức): "
        + ", ".join(f"mức {g}: {fmt(v)}" for g, v in r.per_level.items()),
        "",
        f"{heading} Ma trận nhầm lẫn (hàng Gemini, cột người)",
        "",
        "| Gemini \\ người | 0 | 1 | 2 | 3 |",
        "|---|---|---|---|---|",
        *(f"| {i} | " + " | ".join(str(n) for n in counts) + " |" for i, counts in enumerate(r.confusion)),
        "",
        f"Gộp liên quan (≥ {RELEVANT}) / không liên quan:",
        "",
        "| Gemini \\ người | không | có |",
        "|---|---|---|",
        f"| không | {r.confusion_binary[0][0]} | {r.confusion_binary[0][1]} |",
        f"| có | {r.confusion_binary[1][0]} | {r.confusion_binary[1][1]} |",
        "",
        f"{heading} Âm tính giả (Gemini cho 0, người chấm ≥ {RELEVANT})",
        "",
        f"Mẫu {fn.n_sampled} trên {fn.n_llm_zero} chunk Gemini cho 0; người chấm ≥ {RELEVANT}: {fn.n_missed}. "
        f"Tỉ lệ {fmt(fn.rate)} (Wilson 95%: {fmt(fn.ci_low)}-{fmt(fn.ci_high)}), ước khoảng {fmt(fn.est_missed, 1)} chunk liên quan vắng khỏi qrels.",
        "",
    ]
    return "\n".join(lines)


def render_stability(s: Stability) -> str:
    return (
        f"{s.n_pairs} chunk chấm lại cách ít nhất {s.min_days} ngày, cùng phiên bản hướng dẫn (gần nhất "
        f"{fmt(s.min_gap_days, 1)} ngày); bỏ {s.n_too_close} cặp quá gần và {s.n_version_mismatch} cặp khác phiên bản "
        f"hướng dẫn. Đồng ý tuyệt đối {fmt(s.exact)}, κ tuyến tính {fmt(s.kappa_linear)}, κ bậc hai {fmt(s.kappa_quadratic)}.\n"
    )


def render_agreement(r: AgreementReport) -> str:
    return (
        "# Độ đồng ý Gemini × người trên pool\n\n"
        + render_judge_agreement(r, "##")
        + "\n## Độ ổn định của người gán\n\n"
        + render_stability(r.stability)
    )
