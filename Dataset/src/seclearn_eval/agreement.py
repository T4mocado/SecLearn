"""How far the LLM judge can be trusted on the pool (spec user story 56), and how stable the one annotator is (user story 50).

Gemini × human is computed on the chunks the human graded: every Gemini grade ≥ 1 and the fixed-seed sample of Gemini
zeros. That set over-represents Gemini's positives, so a second quadratic κ weights each sampled zero by
n_zero / n_sampled, as if the whole pool had been graded. The dangerous error of a pool judge is the false negative
(Gemini 0, really relevant): that chunk never reaches qrels and the systems that found it look worse. The sample of
zeros estimates its rate, with a Wilson interval.

The human grade of a chunk is its latest pool label, as in qrels. Stability pairs the first and the latest grade of a
chunk graded twice by the same annotator, at least `STABILITY_MIN_DAYS` apart.
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


def weighted_kappa(pairs: Sequence[tuple[int, int]], weights: Weights, sample_weights: Sequence[float] | None = None, k: int = GRADES) -> float | None:
    """Cohen's weighted κ of (rater a, rater b) grades 0..k-1: 1 - observed / expected disagreement (Cohen 1968)."""
    w = list(sample_weights) if sample_weights is not None else [1.0] * len(pairs)
    total = sum(w)
    if not pairs or total == 0:
        return None
    power = 1 if weights == "linear" else 2
    dis = lambda i, j: abs(i - j) ** power  # noqa: E731
    observed = sum(wt * dis(a, b) for (a, b), wt in zip(pairs, w, strict=True)) / total
    rows, cols = [0.0] * k, [0.0] * k
    for (a, b), wt in zip(pairs, w, strict=True):
        rows[a] += wt
        cols[b] += wt
    expected = sum(rows[i] * cols[j] * dis(i, j) for i in range(k) for j in range(k)) / (total * total)
    if expected == 0:
        return 1.0 if observed == 0 else None
    return 1 - observed / expected


def confusion(pairs: Sequence[tuple[int, int]], k: int = GRADES) -> list[list[int]]:
    m = [[0] * k for _ in range(k)]
    for a, b in pairs:
        m[a][b] += 1
    return m


def _binary(pairs: Sequence[tuple[int, int]]) -> list[list[int]]:
    return confusion([(int(a >= RELEVANT), int(b >= RELEVANT)) for a, b in pairs], k=2)


def _exact(pairs: Sequence[tuple[int, int]]) -> float | None:
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


def stability(labels: list[Label], min_days: int = STABILITY_MIN_DAYS) -> Stability:
    graded: dict[tuple[str, str, str], list[Label]] = defaultdict(list)
    for lab in labels:
        if lab.task == "pool" and lab.grade is not None and lab.chunk_key:
            graded[(lab.question_id, lab.chunk_key, lab.annotator)].append(lab)
    pairs: list[tuple[int, int]] = []
    gaps: list[float] = []
    too_close = 0
    for ls in graded.values():
        if len(ls) < 2:
            continue
        ls.sort(key=lambda lab: lab.annotated_at)
        first, last = ls[0], ls[-1]
        gap = (last.annotated_at - first.annotated_at).total_seconds() / 86400
        if gap < min_days:
            too_close += 1
            continue
        pairs.append((first.grade, last.grade))  # type: ignore[arg-type]
        gaps.append(gap)
    return Stability(
        min_days=min_days,
        n_pairs=len(pairs),
        n_too_close=too_close,
        min_gap_days=min(gaps) if gaps else None,
        exact=_exact(pairs),
        kappa_linear=weighted_kappa(pairs, "linear"),
        kappa_quadratic=weighted_kappa(pairs, "quadratic"),
    )


def agreement_report(pool: list[PoolEntry], labels: list[Label]) -> AgreementReport:
    human = {k: lab.grade for k, lab in latest_pool_labels(labels).items()}
    judged = [(e, human[(e.question_id, e.chunk_key)]) for e in pool if e.llm_grade is not None and (e.question_id, e.chunk_key) in human]
    pairs = [(e.llm_grade, h) for e, h in judged]
    fn = _false_negatives(pool, human)  # type: ignore[arg-type]
    zero_weight = fn.n_llm_zero / fn.n_sampled if fn.n_sampled else 1.0
    weights = [zero_weight if e.llm_grade == 0 and e.for_human else 1.0 for e, _ in judged]
    per_level: dict[str, float] = {}
    for g in range(GRADES):
        at = [a for a, b in pairs if b == g]
        if at:
            per_level[str(g)] = sum(a == g for a in at) / len(at)
    return AgreementReport(
        judge_models=sorted({e.llm_model for e in pool if e.llm_model}),
        prompt_versions=sorted({e.llm_prompt_version for e in pool if e.llm_prompt_version}),
        n_judged=len(pairs),
        exact=_exact(pairs),  # type: ignore[arg-type]
        per_level=per_level,
        kappa_linear=weighted_kappa(pairs, "linear"),  # type: ignore[arg-type]
        kappa_quadratic=weighted_kappa(pairs, "quadratic"),  # type: ignore[arg-type]
        kappa_quadratic_pool_weighted=weighted_kappa(pairs, "quadratic", weights),  # type: ignore[arg-type]
        confusion=confusion(pairs),  # type: ignore[arg-type]
        confusion_binary=_binary(pairs),  # type: ignore[arg-type]
        false_negatives=fn,
        stability=stability(labels),
    )


# --- Markdown ------------------------------------------------------------------------------------


def _f(x: float | None, digits: int = 3) -> str:
    return "-" if x is None else f"{x:.{digits}f}"


def render_agreement(r: AgreementReport) -> str:
    fn, s = r.false_negatives, r.stability
    lines = [
        "# Độ đồng ý Gemini × người trên pool",
        "",
        f"Judge: {', '.join(r.judge_models) or '-'}; prompt: {', '.join(r.prompt_versions) or '-'}; {r.n_judged} chunk người đã chấm.",
        "",
        "| Chỉ số | Giá trị |",
        "|---|---|",
        f"| Đồng ý tuyệt đối | {_f(r.exact)} |",
        f"| κ trọng số tuyến tính | {_f(r.kappa_linear)} |",
        f"| κ trọng số bậc hai | {_f(r.kappa_quadratic)} |",
        f"| κ bậc hai, gia trọng như chấm toàn pool | {_f(r.kappa_quadratic_pool_weighted)} |",
        "",
        "Tỉ lệ đồng ý theo mức (trong các chunk người chấm mức đó, phần Gemini chấm cùng mức): "
        + ", ".join(f"mức {g}: {_f(v)}" for g, v in r.per_level.items()),
        "",
        "## Ma trận nhầm lẫn (hàng Gemini, cột người)",
        "",
        "| Gemini \\ người | 0 | 1 | 2 | 3 |",
        "|---|---|---|---|---|",
        *(f"| {i} | " + " | ".join(str(n) for n in row) + " |" for i, row in enumerate(r.confusion)),
        "",
        f"Gộp liên quan (≥ {RELEVANT}) / không liên quan:",
        "",
        "| Gemini \\ người | không | có |",
        "|---|---|---|",
        f"| không | {r.confusion_binary[0][0]} | {r.confusion_binary[0][1]} |",
        f"| có | {r.confusion_binary[1][0]} | {r.confusion_binary[1][1]} |",
        "",
        "## Âm tính giả (Gemini cho 0, người chấm ≥ 2)",
        "",
        f"Mẫu {fn.n_sampled} trên {fn.n_llm_zero} chunk Gemini cho 0; người chấm ≥ {RELEVANT}: {fn.n_missed}. "
        f"Tỉ lệ {_f(fn.rate)} (Wilson 95%: {_f(fn.ci_low)}-{_f(fn.ci_high)}), ước khoảng {_f(fn.est_missed, 1)} chunk liên quan vắng khỏi qrels.",
        "",
        "## Độ ổn định của người gán",
        "",
        f"{s.n_pairs} chunk chấm lại cách ít nhất {s.min_days} ngày (gần nhất {_f(s.min_gap_days, 1)} ngày); "
        f"{s.n_too_close} cặp quá gần bị bỏ. Đồng ý tuyệt đối {_f(s.exact)}, κ tuyến tính {_f(s.kappa_linear)}, "
        f"κ bậc hai {_f(s.kappa_quadratic)}.",
        "",
    ]
    return "\n".join(lines)
