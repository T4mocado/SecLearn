"""`score` and `report`: files in, files out, against numbers worked out by hand (spec user stories 61-67).

The eval set below: four answerable questions in two topic clusters and one L6 question.

    q1  auth  L1  Session_Management_Cheat_Sheet#s01      qrels S#0 (2)
    q5  auth  L2  variant of q1 (seed_id q1)               qrels S#0 (2)
    q2  auth  L1  wstg-v4.2#WSTG-SESS-01                   qrels W#3 (2), W#4 (1, below the relevance grade)
    q3  inj   L1  SQL_Injection_Prevention_Cheat_Sheet#s00 qrels Q#1 (2)
    q6  L6 out of domain                                   no qrels

Error groups: {q1, q5} (one document, and q5 is q1's variant), {q2} (a WSTG test case), {q3}.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import CANARY, question

from seclearn_eval.cli import main
from seclearn_eval.io import read_json, write_jsonl, write_qrels, write_questions, write_run
from seclearn_eval.schema import AnswerLine, QrelLine, QuestionFileHeader, RunLine, ScoreReport, Strata, Unit

S, W3, W4, Q = (
    "Session_Management_Cheat_Sheet#0",
    "wstg-v4.2#3",
    "wstg-v4.2#4",
    "SQL_Injection_Prevention_Cheat_Sheet#1",
)


def run_lines(ranked: dict[str, list[str]], tag: str) -> list[RunLine]:
    return [
        RunLine(qid=qid, chunk_key=c, rank=r, score=10.0 - r, tag=tag)
        for qid, chunks in ranked.items()
        for r, c in enumerate(chunks, start=1)
    ]


@pytest.fixture
def files(tmp_path: Path) -> dict[str, Path]:
    def q(qid, cluster, level, unit, seed_id=None):
        return question(qid, "test", cluster, level, [], seed_id).model_copy(update={"unit_ids": [unit] if unit else []})

    l6 = q("q6", None, "L6", None)
    l6 = l6.model_copy(update={"strata": Strata(level="L6", answerable=False, l6_kind="out_of_domain")})
    questions = [
        q("q1", "auth", "L1", "Session_Management_Cheat_Sheet#s01"),
        q("q5", "auth", "L2", "Session_Management_Cheat_Sheet#s01", seed_id="q1"),
        q("q2", "auth", "L1", "wstg-v4.2#WSTG-SESS-01"),
        q("q3", "inj", "L1", "SQL_Injection_Prevention_Cheat_Sheet#s00"),
        l6,
    ]
    header = QuestionFileHeader(canary=CANARY, eval_version="1.0.0", snapshot_id="2026-10-18-mini")
    out = {"questions": tmp_path / "questions" / "test.jsonl", "qrels": tmp_path / "qrels" / "sentence-v2.qrels"}
    write_questions(out["questions"], header, questions)
    grades = [("q1", S, 2), ("q5", S, 2), ("q2", W3, 2), ("q2", W4, 1), ("q3", Q, 2)]
    write_qrels(out["qrels"], [QrelLine(qid=a, chunk_key=b, grade=g) for a, b, g in grades])

    # Run A: q1 hit at 1; q5 misses; q2 has the grade-1 chunk first, the relevant one second; q3 retrieves nothing.
    # The L6 question q6 retrieves q1's chunk: it must not count anywhere.
    out["run_a"] = tmp_path / "runs" / "A"
    write_run(out["run_a"] / "run.trec", run_lines({"q1": [S], "q5": ["X#9"], "q2": [W4, W3], "q6": [S]}, "A"))
    # Run B: q1 misses, q5 and q2 hit at 1.
    out["run_b"] = tmp_path / "runs" / "B"
    write_run(out["run_b"] / "run.trec", run_lines({"q1": ["X#9"], "q5": [S], "q2": [W3]}, "B"))

    def unit(uid, cluster, weight):
        return Unit(unit_id=uid, doc_key=uid.split("#")[0], kind="section", title="t", cluster=cluster,
                    chunks=weight, weight_chunks=weight, sampleable=True, char_start=0, char_end=1)

    # Corpus shares for the post-stratified score: auth 3 chunks, inj 1 (the excluded unit does not count).
    out["units"] = tmp_path / "units.jsonl"
    excluded = unit("Session_Management_Cheat_Sheet#s09", "auth", 50).model_copy(update={"sampleable": False})
    write_jsonl(out["units"], [unit("a#s00", "auth", 2), unit("a#s01", "auth", 1), unit("b#s00", "inj", 1), excluded])
    return out


def score(files: dict[str, Path], tmp_path: Path, *extra: str) -> ScoreReport:
    out = tmp_path / "scores" / "A.json"
    args = ["score", "--questions", str(files["questions"]), "--qrels", str(files["qrels"]), "--run", str(files["run_a"])]
    assert main([*args, "--out", str(out), *extra]) == 0
    return read_json(out, ScoreReport)


def row(report: ScoreReport, scope: str, key: str | None = None):
    [r] = [s for s in report.strata if s.scope == scope and s.key == key]
    return r.estimates


def test_micro_scores_of_answerable_questions(files, tmp_path):
    report = score(files, tmp_path)
    micro = row(report, "micro")
    # Per question (q1, q5, q2, q3): hit@1 1 0 0 0; hit@5 1 0 1 0; MRR@10 1 0 ½ 0;
    # nDCG@10 of q2 (gains 1, 2 against ideal 2, 1) = (1 + 2/log2 3) / (2 + 1/log2 3) = .859719;
    # Judged@10: q1 1/1, q5 0/1, q2 2/2, q3 nothing retrieved = 0.
    assert micro["hit@1"].mean == pytest.approx(0.25)
    assert micro["hit@5"].mean == pytest.approx(0.5)
    assert micro["mrr@10"].mean == pytest.approx(0.375)
    assert micro["ndcg@10"].mean == pytest.approx((1 + 0.859719) / 4, abs=1e-6)
    assert micro["recall@10"].mean == pytest.approx(0.5)
    assert micro["judged@10"].mean == pytest.approx(0.5)
    # hit@1: s̄ = .25, group sums {q1,q5} .5, {q2} −.25, {q3} −.25 → SE² = .375/16.
    assert (micro["hit@1"].n, micro["hit@1"].n_groups) == (4, 3)
    assert micro["hit@1"].se == pytest.approx((0.375 / 16) ** 0.5)
    assert micro["hit@1"].method == "wilson"


def test_macro_clusters_levels_and_post_stratified(files, tmp_path):
    report = score(files, tmp_path, "--units", str(files["units"]))
    auth, inj = row(report, "cluster", "auth")["hit@1"], row(report, "cluster", "inj")["hit@1"]
    # auth: q1 1, q5 0, q2 0 in 2 groups: mean ⅓, group sums ⅓ and −⅓ → SE² = (2/9)/9.
    assert (auth.n, auth.n_groups, auth.mean) == (3, 2, pytest.approx(1 / 3))
    assert auth.se == pytest.approx((2 / 81) ** 0.5)
    assert (inj.n, inj.n_groups, inj.mean, inj.se) == (1, 1, 0.0, 0.0)
    macro = row(report, "macro")["hit@1"]
    assert macro.mean == pytest.approx(1 / 6) and macro.se == pytest.approx((2 / 81) ** 0.5 / 2)
    assert row(report, "level", "L1")["hit@1"].mean == pytest.approx(1 / 3)
    assert row(report, "level", "L2")["hit@1"].mean == 0.0
    # Weights auth 3 : inj 1 → .75 × ⅓ = .25.
    assert report.poststrat_weights == {"auth": 0.75, "inj": 0.25}
    assert row(report, "poststrat")["hit@1"].mean == pytest.approx(0.25)


def test_l6_is_reported_apart(files, tmp_path):
    report = score(files, tmp_path)
    assert all(e.n == 4 for e in row(report, "micro").values())
    assert {s.key for s in report.strata if s.scope == "level"} == {"L1", "L2"}
    assert {s.key for s in report.strata if s.scope == "cluster"} == {"auth", "inj"}
    assert (report.refusals.l6_questions, report.refusals.answerable_questions) == (1, 4)
    assert report.refusals.measured is False


def test_refusals_from_answers_stay_out_of_answerable_scores(files, tmp_path):
    def answers(qid, refused_runs):
        return [AnswerLine(qid=qid, k=k, answer="…", refused=k < refused_runs) for k in range(3)]

    # K = 3: q6 (L6) refuses 3 of 3; q1 refuses 1 of 3; the other answerable questions never refuse.
    lines = answers("q6", 3) + answers("q1", 1) + answers("q5", 0) + answers("q2", 0) + answers("q3", 0)
    write_jsonl(files["run_a"] / "answers.jsonl", lines)
    report = score(files, tmp_path)
    r = report.refusals
    assert r.measured is True
    assert set(r.correct_refusal) == {"all", "out_of_domain"}
    assert (r.correct_refusal["all"].n, r.correct_refusal["all"].mean) == (1, 1.0)
    # False refusals: (⅓ + 0 + 0 + 0) / 4 = 1/12.
    assert (r.false_refusal.n, r.false_refusal.mean) == (4, pytest.approx(1 / 12))
    assert row(report, "micro")["hit@1"].mean == pytest.approx(0.25)


def test_report_writes_markdown_and_latex_from_the_same_scores(files, tmp_path):
    score(files, tmp_path, "--baseline", str(files["run_b"]))
    assert main(["report", "--scores", str(tmp_path / "scores" / "A.json"), "--out", str(tmp_path / "report" / "A")]) == 0
    md = (tmp_path / "report" / "A.md").read_text(encoding="utf-8")
    tex = (tmp_path / "report" / "A.tex").read_text(encoding="utf-8")
    for text in (md, tex):
        # Macro hit@1 1/6 with SE .0786, CI 1/6 ± 1.96 × .0786 = [0.013, 0.321].
        assert "0.167" in text and "0.079" in text and "0.013" in text and "0.321" in text
        # Cluster rows: auth 3 questions in 2 documents / test cases.
        assert "auth" in text and "inj" in text
        # Paired comparison: micro hit@1 −0.250, p = 1.000.
        assert "-0.250" in text and "1.000" in text
        # L6 apart, not measured yet.
        assert "L6" in text
    assert "| auth | 3 | 2 |" in md
    assert "\\begin{tabular}" in tex and "auth & 3 & 2 &" in tex
    assert md.count("macro") >= 1 and "micro" in md


def test_paired_comparison_with_a_baseline(files, tmp_path):
    report = score(files, tmp_path, "--baseline", str(files["run_b"]))
    assert report.baseline_id == "B"
    [c] = [c for c in report.comparisons if c.metric == "hit@1" and c.scope == "micro"]
    # A − B per question (q1, q5, q2, q3): 1 −1 −1 0, mean −.25; residuals 1.25 −.75 −.75 .25,
    # group sums .5, −.75, .25 → SE² = .875/16. Group terms 0, −¼, 0: every flip gives |T| = ¼ → p = 1.
    assert c.diff.mean == pytest.approx(-0.25)
    assert c.diff.se == pytest.approx((0.875 / 16) ** 0.5)
    assert c.p_value == pytest.approx(1.0)
    assert c.p_value_per_question is not None
    assert {c.scope for c in report.comparisons} == {"micro", "macro", "cluster"}
