"""Markdown and LaTeX tables from one ScoreReport: both are rendered from the same rows, so they cannot disagree."""

from __future__ import annotations

from dataclasses import dataclass

from .schema import Estimate, ScoreReport, Stratum
from .stats import ALPHA

SCOPE_NAMES = {"macro": "macro (số chính)", "micro": "micro", "poststrat": "hậu phân tầng"}


@dataclass
class Table:
    title: str
    header: list[str]
    rows: list[list[str]]
    note: str = ""


def _num(x: float) -> str:
    return f"{x:.3f}"


def _full(e: Estimate) -> str:
    return f"{_num(e.mean)} ± {_num(e.se)} [{_num(e.ci_low)}, {_num(e.ci_high)}]"


def _short(e: Estimate) -> str:
    return f"{_num(e.mean)} [{_num(e.ci_low)}, {_num(e.ci_high)}]"


def tables(r: ScoreReport) -> list[Table]:
    by_scope = {s.scope: s for s in r.strata if s.key is None}
    scopes = [s for s in ("macro", "micro", "poststrat") if s in by_scope]
    out = [
        Table(
            "Tổng (câu trả lời được)",
            ["độ đo", *(SCOPE_NAMES[s] for s in scopes)],
            [[m, *(_full(by_scope[s].estimates[m]) for s in scopes)] for m in r.metrics],
            "trung bình ± sai số chuẩn theo cụm [khoảng tin cậy 95%]",
        )
    ]

    def strata_table(title: str, first: str, rows: list[Stratum]) -> Table:
        body = []
        for s in rows:
            any_est = s.estimates[r.metrics[0]]
            body.append([s.key or "", str(any_est.n), str(any_est.n_groups), *(_short(s.estimates[m]) for m in r.metrics)])
        wilson = any(e.method == "wilson" for s in rows for e in s.estimates.values())
        note = "khoảng Wilson trên cỡ mẫu hiệu dụng cho tầng 0/1 dưới 300 câu" if wilson else ""
        return Table(title, [first, "số câu", "số tài liệu / test case", *r.metrics], body, note)

    out.append(strata_table("Theo cụm chủ đề", "cụm", [s for s in r.strata if s.scope == "cluster"]))
    out.append(strata_table("Theo mức", "mức", [s for s in r.strata if s.scope == "level"]))

    if r.comparisons:
        rows = [
            [
                c.metric,
                c.key or SCOPE_NAMES.get(c.scope, c.scope),
                _num(c.diff.mean),
                _num(c.diff.se),
                f"[{_num(c.diff.ci_low)}, {_num(c.diff.ci_high)}]",
                _num(c.p_value),
                _num(c.p_value_per_question) if c.p_value_per_question is not None else "",
            ]
            for c in r.comparisons
        ]
        out.append(
            Table(
                f"So sánh ghép cặp {r.run_id} − {r.baseline_id}",
                ["độ đo", "phạm vi", "hiệu", "SE", "KTC 95%", "p (theo nhóm)", "p (theo câu, ranx)"],
                rows,
                "p theo nhóm: kiểm định ngẫu nhiên hoá đổi nhãn cả tài liệu / test case; chỉ kết luận khác biệt khi p nhỏ",
            )
        )

    if r.cluster_differences:
        significant = [d for d in r.cluster_differences if d.p_adjusted < ALPHA]
        n_pairs = len({(d.cluster_a, d.cluster_b) for d in r.cluster_differences})
        rows = [
            [d.metric, d.cluster_a, d.cluster_b, _num(d.diff.mean), _num(d.diff.se), _num(d.p_value), _num(d.p_adjusted)]
            for d in significant
        ] or [["(không cặp nào)", "", "", "", "", "", ""]]
        out.append(
            Table(
                "Khác biệt giữa hai cụm có ý nghĩa thống kê",
                ["độ đo", "cụm A", "cụm B", "hiệu A − B", "SE", "p", "p (Holm)"],
                rows,
                f"kiểm z trên SE theo cụm của hai cụm; {n_pairs} cặp cụm × {len(r.metrics)} độ đo, p hiệu chỉnh Holm "
                f"trong từng độ đo; chỉ liệt kê cặp có p (Holm) < {ALPHA}, các cặp khác không kết luận được khác biệt",
            )
        )

    refusals = r.refusals
    if refusals.measured:
        rows = [[f"L6 {k}", str(e.n), _full(e)] for k, e in refusals.correct_refusal.items()]
        if refusals.false_refusal is not None:
            rows.append(["từ chối sai (câu trả lời được)", str(refusals.false_refusal.n), _full(refusals.false_refusal)])
        out.append(Table("L6: từ chối (báo riêng)", ["", "số câu", "tỉ lệ"], rows))
    else:
        out.append(
            Table(
                "L6: từ chối (báo riêng)",
                ["", "số câu", "tỉ lệ"],
                [["L6 từ chối đúng", str(refusals.l6_questions), "chưa đo"], ["từ chối sai", str(refusals.answerable_questions), "chưa đo"]],
                "cần answers.jsonl của bộ chạy SecLearn",
            )
        )
    return out


def _header(r: ScoreReport) -> list[str]:
    base = f" so với {r.baseline_id}" if r.baseline_id else ""
    return [
        f"Lượt chạy {r.run_id}{base}",
        f"câu hỏi: {r.questions_file}; qrels: {r.qrels_file}; liên quan từ mức {r.min_grade} (nDCG dùng mức)",
    ]


def render_markdown(r: ScoreReport) -> str:
    title, sub = _header(r)
    lines = [f"# {title}", "", sub, ""]
    for t in tables(r):
        lines += [f"## {t.title}", ""]
        lines.append("| " + " | ".join(t.header) + " |")
        lines.append("|" + "---|" * len(t.header))
        lines += ["| " + " | ".join(row) + " |" for row in t.rows]
        if t.note:
            lines += ["", f"_{t.note}_"]
        lines.append("")
    return "\n".join(lines)


_TEX = {"\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#", "_": r"\_", "{": r"\{", "}": r"\}"}


def _tex(s: str) -> str:
    s = "".join(_TEX.get(ch, ch) for ch in s)
    return s.replace("±", r"$\pm$").replace("−", "$-$")


def render_latex(r: ScoreReport) -> str:
    title, sub = _header(r)
    lines = [f"% {_tex(title)}", f"% {_tex(sub)}", "% needs \\usepackage{booktabs}", ""]
    for t in tables(r):
        lines += [
            "\\begin{table}[ht]",
            "\\centering",
            f"\\caption{{{_tex(t.title)}}}",
            "\\begin{tabular}{l" + "r" * (len(t.header) - 1) + "}",
            "\\toprule",
            " & ".join(_tex(h) for h in t.header) + " \\\\",
            "\\midrule",
        ]
        lines += [" & ".join(_tex(c) for c in row) + " \\\\" for row in t.rows]
        lines += ["\\bottomrule", "\\end{tabular}"]
        if t.note:
            lines.append(f"\\par\\smallskip\\footnotesize {_tex(t.note)}")
        lines += ["\\end{table}", ""]
    return "\n".join(lines)
