"""Guidelines v0 and v1 (spec user stories 47, 49): versioned, has every section, and every example quote is verbatim in the real snapshot."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from seclearn_eval.annotate import guideline_version
from seclearn_eval.snapshot import load_snapshot
from seclearn_eval.spans import find_quote

DATASET = Path(__file__).parents[1]
#: Each guideline file and the version its `guideline_version:` line must give.
GUIDELINES = [(DATASET / "annotation" / f"guideline-{v}.md", v) for v in ("v0", "v1")]
GUIDELINE_FILES = pytest.mark.parametrize(("guideline", "version"), GUIDELINES, ids=[v for _, v in GUIDELINES])
SNAPSHOT = DATASET / "corpus" / "2026-10-18-owasp"
#: How examples cite the corpus: [nguồn: doc_key] "verbatim quote"
QUOTE = re.compile(r'\[nguồn: ([^\]]+)\] "([^"]+)"')


@GUIDELINE_FILES
def test_versioned_with_every_section(guideline, version):
    text = guideline.read_text(encoding="utf-8")
    assert guideline_version(guideline) == version
    headings = [h.strip() for h in re.findall(r"^#{2,3} (.+)$", text, re.MULTILINE)]
    for level in range(1, 8):
        assert any(h.startswith(f"L{level}") for h in headings), f"no section for L{level}"
    for needed in ("Quy tắc span", "Thang 0-3", "Quy tắc L6"):
        assert any(needed in h for h in headings), f"no section {needed!r}"


@GUIDELINE_FILES
def test_each_level_has_a_good_and_a_bad_example(guideline, version):
    text = guideline.read_text(encoding="utf-8")
    sections = re.split(r"^### ", text, flags=re.MULTILINE)
    for level in range(1, 8):
        [body] = [s for s in sections if s.startswith(f"L{level}")]
        assert "Tốt" in body and "Xấu" in body, f"L{level} lacks a good or a bad example"


@pytest.mark.skipif(not SNAPSHOT.exists(), reason="real snapshot not checked out")
@GUIDELINE_FILES
def test_every_example_quote_is_verbatim_in_the_snapshot(guideline, version):
    quotes = QUOTE.findall(guideline.read_text(encoding="utf-8"))
    assert len(quotes) >= 10
    snap = load_snapshot(SNAPSHOT)
    for doc_key, quote in quotes:
        assert doc_key in snap.markdown, f"{doc_key} not in snapshot"
        assert find_quote(snap.markdown[doc_key], quote), f"not in {doc_key}: {quote}"


def test_v1_covers_what_the_pilot_changed():
    """Ticket 07: the review form gained a question edit box and required fields; L4 cells are the two sources."""
    text = (DATASET / "annotation" / "guideline-v1.md").read_text(encoding="utf-8")
    for needed in ("Câu hỏi sửa", "Ô 1", "nguồn trên", "bắt buộc", "đóng băng"):
        assert needed in text, f"v1 does not mention {needed!r}"
