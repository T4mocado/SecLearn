"""The Label Studio configs in `annotation/` match what `annotate` exports and imports, and hide the LLM's answer until the spans are done."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

from test_annotate import export_review, review_setup

from seclearn_eval import annotate

ANNOTATION = Path(__file__).parents[1] / "annotation"


def config(name: str) -> ET.Element:
    return ET.parse(ANNOTATION / name).getroot()


def tags(root: ET.Element, tag: str) -> dict[str, ET.Element]:
    return {e.get("name"): e for e in root.iter(tag)}


def values(e: ET.Element, child: str) -> set[str]:
    return {c.get("value") for c in e.iter(child)}


def variables(root: ET.Element) -> set[str]:
    return {m for e in root.iter() for v in e.attrib.values() for m in re.findall(r"\$(\w+)", v)}


def test_review_config_has_every_control_import_reads():
    root = config("review.xml")
    assert {"question", "source_0", "source_1"} <= set(tags(root, "Text"))
    choices = tags(root, "Choices")
    assert values(choices["question_check"], "Choice") == set(annotate.QUESTION_CHECK)
    assert values(choices["decision"], "Choice") == set(annotate.DECISION)
    assert values(choices["level"], "Choice") == {f"L{n}" for n in range(1, 8)}
    assert values(choices["l6_kind"], "Choice") == set(annotate.L6_KIND)
    assert {"answer", "notes"} <= set(tags(root, "TextArea"))
    labels = tags(root, "Labels")
    assert set(labels) == {f"span_{n}" for n in range(annotate.SOURCE_SLOTS)}
    for name, e in labels.items():
        assert e.get("toName") == name.replace("span_", "source_")
        assert values(e, "Label") == {annotate.SPAN_EVIDENCE, annotate.SPAN_REFUTES, *annotate.SPAN_CELLS}


def test_review_config_reads_only_fields_the_export_writes(snap_dir, tmp_path):
    _, units, questions, guideline, *_ = review_setup(snap_dir, tmp_path)
    tasks = export_review(snap_dir, units, questions, guideline, tmp_path)
    assert variables(config("review.xml")) <= set(tasks[0]["data"])
    # Every LLM-written field is listed, so the Data Manager checklist (ticket 06) names them all.
    assert {k for k in tasks[0]["data"] if k.startswith("llm_")} <= set(annotate.LLM_FIELDS) <= set(tasks[0]["data"])


def test_llm_answer_shown_only_after_spans_and_reveal():
    """User story 42: the annotator judges the question and marks spans before seeing the LLM's answer, level or quotes."""
    root = config("review.xml")
    order = list(root.iter())
    reveal = tags(root, "Choices")["reveal"]
    gated = [e for e in root.iter("View") if e.get("visibleWhen") == "choice-selected" and e.get("whenTagName") == "reveal"]
    assert len(gated) == 1 and gated[0].get("whenChoiceValue") in values(reveal, "Choice")
    hidden = set(gated[0].iter())

    llm = [e for e in order if any(f"${f}" in v for f in annotate.LLM_FIELDS for v in e.attrib.values())]
    assert llm and all(e in hidden for e in llm)
    assert {"decision", "level", "l6_kind", "answer"} <= {e.get("name") for e in hidden}
    last_span = max(order.index(e) for e in root.iter("Labels"))
    assert order.index(tags(root, "Choices")["question_check"]) < last_span < order.index(reveal) < order.index(gated[0])


def test_review_cannot_be_submitted_without_reveal_decision_and_level():
    # The pilot could submit a task with no decision (it stays pending) or no level (it keeps the LLM's).
    root = config("review.xml")
    choices = tags(root, "Choices")
    assert all(choices[name].get("required") == "true" for name in ("question_check", "reveal", "decision", "level"))


def test_review_has_a_question_edit_box_after_the_reveal():
    root = config("review.xml")
    gated = next(e for e in root.iter("View") if e.get("whenTagName") == "reveal")
    assert annotate.QUESTION_EDIT in {e.get("name") for e in gated.iter("TextArea")}


def test_pool_config_grades_0_to_3_without_the_llm_grade(snap_dir, tmp_path):
    root = config("pool.xml")
    assert values(tags(root, "Choices")["grade"], "Choice") == set(annotate.POOL_GRADE)
    assert tags(root, "Choices")["grade"].get("toName") == "chunk"
    assert variables(root) == {"question", "chunk", "chunk_key"}


def test_docker_compose_pins_label_studio():
    compose = (ANNOTATION / "docker-compose.yml").read_text(encoding="utf-8")
    image = re.search(r"image:\s*(\S+)", compose).group(1)
    assert image.startswith("heartexlabs/label-studio:") and re.search(r":\d+\.\d+\.\d+$", image)
