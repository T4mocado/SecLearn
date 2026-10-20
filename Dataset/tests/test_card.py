"""The dataset card (spec user stories 68-69): every number read from a data file, the pre-registered reporting
fixed in code and the same whatever has been measured."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from conftest import CANARY, question, span

from seclearn_eval.card import CardInputs, render_card
from seclearn_eval.cli import main
from seclearn_eval.clusters import build_cluster_map
from seclearn_eval.io import write_json, write_questions
from seclearn_eval.schema import FilterReport, FilterStep, PlanCell, QuestionFileHeader, SamplePlan
from seclearn_eval.snapshot import load_snapshot

CHANGELOG = "# Nhật ký thay đổi\n\n## [0.2.0] - 2026-10-21\n- Thêm câu.\n\n## [0.1.0] - 2026-10-20\n- Bộ smoke.\n"
SESSION = "Session_Management_Cheat_Sheet"


@pytest.fixture
def root(snap_dir: Path, tmp_path: Path) -> Path:
    """An eval-set root with only the files every stage has from the start: CHANGELOG, clusters, LLM config."""
    root = tmp_path / "eval"
    root.mkdir()
    (root / "CHANGELOG.md").write_text(CHANGELOG, encoding="utf-8")
    write_json(root / "clusters.json", build_cluster_map(load_snapshot(snap_dir).manifest))
    (root / "llm-config.json").write_text(
        json.dumps(
            {
                "generator": {"provider": "claude", "model": "claude-test-1"},
                "judge": {"provider": "gemini", "model": "gemini-test-2"},
                "embedder": {"provider": "gemini", "model": "embed-test-3"},
            }
        ),
        encoding="utf-8",
    )
    return root


def card(snap_dir: Path, root: Path) -> str:
    return render_card(CardInputs(snapshot=snap_dir, root=root))


def front_matter(text: str) -> dict[str, str]:
    assert text.startswith("---\n")
    head = text[4 : text.index("\n---\n", 4)]
    return dict(line.split(": ", 1) for line in head.splitlines())


def section(text: str, title: str) -> str:
    start = text.index(f"\n## {title}")
    end = text.find("\n## ", start + 1)
    return text[start : end if end > 0 else len(text)]


def test_front_matter_is_hugging_face_style_with_version_snapshot_and_canary(snap_dir, root):
    meta = front_matter(card(snap_dir, root))
    assert meta["license"] == "cc-by-sa-4.0"
    assert meta["language"] == "[vi, en]"
    assert meta["version"] == "0.2.0"
    assert meta["snapshot_id"] == "2026-10-18-mini"
    assert meta["canary"] == f'"{CANARY}"'
    assert meta["size_categories"] == "[n<1K]"


def test_composition_numbers_come_from_the_snapshot_and_the_plan(snap_dir, root):
    cells = [
        PlanCell(split="test", cluster="auth", level="L1", target=7),
        PlanCell(split="test", cluster="browser", level="L3", target=5),
        PlanCell(split="test", cluster=None, level="L6", l6_kind="out_of_domain", target=4),
        PlanCell(split="dev", cluster="auth", level="L1", target=2),
    ]
    plan = SamplePlan(snapshot_id="2026-10-18-mini", seed=42, params={"cap": 9}, cells=cells, slots=[])
    write_json(root / "questions" / "v1.0" / "sample-plan.json", plan)

    text = section(card(snap_dir, root), "Thành phần")
    assert "3 tài liệu" in text and "18 chunk" in text and "sentence-v2" in text
    assert "seed 42" in text
    # Plan table: test split, auth row has 7 at L1, total 16; dev total 2.
    assert re.search(r"\| auth \|[^\n]*\| 7 \|", text)
    assert "test: 16 câu" in text and "dev: 2 câu" in text
    assert "Phân bố thực tế" in text and "chưa có" in text


def test_actual_distribution_and_language_variety_count_the_question_files(snap_dir, root):
    q1 = question("q1", "test", "auth", "L1", [span(snap_dir, SESSION, "at least 128 bits (16 bytes)")])
    q2 = question("q2", "test", "auth", "L1", [span(snap_dir, SESSION, "at least 64 bits of entropy")])
    q2.strata.question_style = "unaccented"
    q3 = question("q3", "test", "auth", "L1", [], seed_id="q1")
    q3.review.status = "rejected"
    header = QuestionFileHeader(canary=CANARY, eval_version="0.2.0", snapshot_id="2026-10-18-mini")
    write_questions(root / "questions" / "v1.0" / "test.jsonl", header, [q1, q2, q3])

    text = card(snap_dir, root)
    composition = section(text, "Thành phần")
    actual = composition[composition.index("Phân bố thực tế") :]
    assert re.search(r"\| auth \|[^\n]*\| 2 \|", actual)
    assert "test: 2 câu" in actual
    variety = section(text, "Biến thể ngôn ngữ")
    assert "unaccented: 1" in variety


def test_collection_shows_models_prompt_versions_and_rejection_rates(snap_dir, root):
    text = section(card(snap_dir, root), "Cách thu thập")
    assert "claude-test-1" in text and "gemini-test-2" in text and "embed-test-3" in text
    assert "gen-L1-v1" in text and "filter-answer-v1" in text
    assert "chưa có" in text  # no filter report yet

    steps = [
        FilterStep(step="quote", n_in=40, n_rejected=10, reasons={"quote_not_found": 10}),
        FilterStep(step="answerable", n_in=30, n_rejected=3, reasons={"not_answerable": 3}),
    ]
    write_json(root / "questions" / "v1.0" / "filter-report.json", FilterReport(steps=steps, n_kept=27, rejected=[]))
    text = section(card(snap_dir, root), "Cách thu thập")
    assert re.search(r"\| quote \| 40 \| 10 \| 25\.0% \|", text)
    assert re.search(r"\| answerable \| 30 \| 3 \| 10\.0% \|", text)


def test_labelling_reads_guideline_labels_and_agreement_or_says_not_yet(snap_dir, root):
    text = section(card(snap_dir, root), "Cách gán nhãn")
    assert "một người" in text and "ADR 0002" in text
    assert text.count("chưa có") >= 2  # agreement, intra-annotator stability

    (root / "annotation").mkdir()
    (root / "annotation" / "guideline-v1.md").write_text("# HD\n\nguideline_version: v1.2\n", encoding="utf-8")
    (root / "judgments").mkdir()
    (root / "judgments" / "agreement.json").write_text(
        json.dumps({"weighted_kappa": 0.712, "exact_agreement": 0.64, "false_negative_rate": 0.031}), encoding="utf-8"
    )
    text = section(card(snap_dir, root), "Cách gán nhãn")
    assert "v1.2" in text
    assert "weighted_kappa | 0.712" in text and "false_negative_rate | 0.031" in text


def test_labelling_shows_the_confusion_matrix_false_negatives_and_stability_written_by_judge_agreement(snap_dir, root, tmp_path):
    from datetime import UTC, datetime, timedelta

    from seclearn_eval.io import write_jsonl
    from seclearn_eval.schema import Label, PoolEntry

    pool = tmp_path / "pool.jsonl"
    labels = tmp_path / "labels.jsonl"
    t0 = datetime(2026, 11, 1, tzinfo=UTC)

    def lab(chunk, grade, at=t0):
        return Label(question_id="q1", task="pool", chunk_key=chunk, grade=grade, annotator="me", annotated_at=at,
                     guideline_version="v1", snapshot_id="s")

    write_jsonl(pool, [PoolEntry(question_id="q1", chunk_key=f"c#{i}", systems=[], covers_gold=False, llm_grade=g, for_human=True)
                       for i, g in enumerate([3, 0, 0])])
    write_jsonl(labels, [lab("c#0", 3), lab("c#1", 2), lab("c#2", 0), lab("c#0", 2, t0 + timedelta(days=9))])
    assert main(["judge", "agreement", "--pool", str(pool), "--labels", str(labels), "--out", str(root / "judgments" / "agreement.json")]) == 0
    text = section(card(snap_dir, root), "Cách gán nhãn")
    assert "| Gemini \\ người | 0 | 1 | 2 | 3 |" in text  # the 4 × 4 confusion matrix
    assert "người chấm ≥ 2: 1" in text  # false negatives among the sampled zeros
    # Stability comes from the same agreement.json: no other file is written or read.
    assert not (root / "judgments" / "stability.json").exists()
    assert "1 chunk chấm lại cách ít nhất 7 ngày" in text


def test_pre_registration_is_fixed_whatever_has_been_measured(snap_dir, root):
    before = section(card(snap_dir, root), "Cách báo chuẩn")
    runs = root / "runs" / "r1"
    runs.mkdir(parents=True)
    (runs / "scores.json").write_text("{}", encoding="utf-8")
    write_json(root / "questions" / "v1.0" / "filter-report.json", FilterReport(steps=[], n_kept=0, rejected=[]))
    assert section(card(snap_dir, root), "Cách báo chuẩn") == before

    # The choices settled on ticket 10 (A-G), in words the thesis can quote.
    for phrase in [
        "macro",
        "recall@5",
        "10 cụm chủ đề",
        "phương trình 4",
        "phương trình 8",
        "Wilson",
        "300",
        "hệ số thiết kế",
        "đổi nhãn A/B cho cả nhóm",
        "Holm",
        "mức ≥ 2",
        "hậu phân tầng",
        "L6",
        "chia n",
        "Judged@10",
        "kiểm độ nhạy",
        "45 cặp",
        "K = 3",
        "RAG_TOP_K = 5",
        "≥ 50% độ dài span",
        "tỉ lệ chunk của corpus trong từng cụm",
    ]:
        assert phrase in before, phrase
    # Only what `score` computes is pre-registered: L4 / L5 merges stay in their topic cluster, and no alternative
    # clustering is promised (the spec does not define one).
    assert "trong cùng cụm chủ đề" in before
    assert "Không đăng ký số độ nhạy của macro với một bảng phân cụm chủ đề thay thế" in before


def test_distribution_and_maintenance(snap_dir, root):
    text = card(snap_dir, root)
    distribution = section(text, "Phân phối")
    assert "CC BY-SA 4.0" in distribution and "OWASP" in distribution and CANARY in distribution
    maintenance = section(text, "Bảo trì")
    assert "MAJOR" in maintenance and "MINOR" in maintenance and "PATCH" in maintenance
    assert "0.2.0" in maintenance and "0.1.0" in maintenance


def test_cli_writes_the_card(snap_dir, root):
    out = root / "CARD.md"
    assert main(["card", "--snapshot", str(snap_dir), "--root", str(root), "--out", str(out)]) == 0
    assert out.read_text(encoding="utf-8") == card(snap_dir, root)
