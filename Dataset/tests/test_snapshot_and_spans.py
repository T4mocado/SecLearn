"""Loading the mini snapshot (written by the app's builder), spans, re-anchoring, TREC files and the CLI."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from conftest import question, span

from seclearn_eval.cli import main
from seclearn_eval.io import FormatError, read_qrels, read_questions, read_run, write_qrels, write_run
from seclearn_eval.reanchor import reanchor
from seclearn_eval.schema import Chunk, GoldSpan, QrelLine, RunLine
from seclearn_eval.snapshot import load_snapshot, sha256_text, verify_snapshot
from seclearn_eval.spans import covers, find_quote, normalize


def test_mini_snapshot_loads_clean(snap_dir):
    snap = load_snapshot(snap_dir)
    assert snap.snapshot_id == "2026-10-18-mini"
    assert [d.doc_key for d in snap.manifest.documents] == [
        "Cross-Site_Request_Forgery_Prevention_Cheat_Sheet",
        "Session_Management_Cheat_Sheet",
        "wstg-v4.2",
    ]
    assert verify_snapshot(snap) == []
    # WSTG test cases are sections; the removed one is gone.
    assert "## WSTG-SESS-02 Testing for Cookies Attributes" in snap.markdown["wstg-v4.2"]
    assert "WSTG-SESS-08" not in snap.markdown["wstg-v4.2"]


def _without_headings(text: str) -> str:
    return normalize(" ".join(l for l in text.splitlines() if not re.match(r"#{1,6}\s", l.strip())))


def test_chunk_offsets_point_at_their_body(snap_dir):
    # The app's invariant, seen from the eval side: the markdown under a chunk's span is its text minus headings.
    snap = load_snapshot(snap_dir)
    for c in snap.chunks:
        body = snap.markdown[c.doc_key][c.char_start : c.char_end]
        assert _without_headings(body) == _without_headings(c.text), c.chunk_key


def test_markdown_is_read_byte_exact(snap_dir):
    md = snap_dir / "md" / "wstg-v4.2.md"
    md.write_bytes(md.read_bytes().replace(b"\n", b"\r\n"))
    problems = verify_snapshot(load_snapshot(snap_dir))
    assert any("wstg-v4.2: markdown sha256 differs" in p for p in problems)


def test_find_quote_ignores_whitespace_and_counts_repeats():
    md = "Use the Secure\nattribute. Use the Secure attribute."
    assert find_quote(md, "the Secure attribute") == [(4, 24), (30, 50)]
    assert md[4:24] == "the Secure\nattribute"


def test_covers_needs_half_the_span():
    gold = GoldSpan(doc_key="d", md_sha256="x", char_start=100, char_end=200, quote="q")
    chunk = lambda a, b: Chunk(chunk_key="d#0", doc_key="d", chunk_index=0, char_start=a, char_end=b, text="", content_sha1="", db_id="")  # noqa: E731
    assert covers(chunk(150, 400), gold)
    assert not covers(chunk(151, 400), gold)
    assert covers(chunk(0, 1000), gold)


def test_reanchor_moves_spans_onto_edited_markdown_and_reports_losses(snap_dir):
    q1 = question("q1", "test", "auth", "L1", [span(snap_dir, "Session_Management_Cheat_Sheet", "at least 128 bits (16 bytes)")])
    q2 = question("q2", "test", "auth", "L1", [span(snap_dir, "Session_Management_Cheat_Sheet", "at least 64 bits of entropy")])
    q3 = question("q3", "test", "browser", "L1", [span(snap_dir, "Cross-Site_Request_Forgery_Prevention_Cheat_Sheet", "CWE-352 entry.")])

    # A new snapshot: text inserted before the spans, one sentence reworded.
    md_path = snap_dir / "md" / "Session_Management_Cheat_Sheet.md"
    md = md_path.read_bytes().decode("utf-8")
    md = md.replace("## Introduction\n", "## Introduction\nA new opening sentence was added here.\n").replace("64 bits of entropy", "64 bits of randomness")
    md_path.write_bytes(md.encode("utf-8"))
    manifest_path = snap_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for d in manifest["documents"]:
        if d["doc_key"] == "Session_Management_Cheat_Sheet":
            d["md_sha256"], d["chars"] = sha256_text(md), len(md)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    moved, report = reanchor([q1, q2, q3], load_snapshot(snap_dir))
    assert (report.kept, report.reanchored, report.dropped) == (1, 1, 1)
    assert report.lost == ["q2: quote found 0 times in Session_Management_Cheat_Sheet"]
    s = moved[0].gold_evidence[0]
    assert md[s.char_start : s.char_end] == "at least 128 bits (16 bytes)"
    assert s.md_sha256 == sha256_text(md)
    assert moved[1].gold_evidence == []
    assert "re-anchored (33.3%)" in report.summary()


def test_trec_round_trip(tmp_path):
    qrels = [QrelLine(qid="seclearn-v1-000001", chunk_key="wstg-v4.2#3", grade=3)]
    write_qrels(tmp_path / "a.qrels", qrels)
    assert (tmp_path / "a.qrels").read_text(encoding="utf-8") == "seclearn-v1-000001 0 wstg-v4.2#3 3\n"
    assert read_qrels(tmp_path / "a.qrels") == qrels
    run = [RunLine(qid="q", chunk_key="wstg-v4.2#3", rank=1, score=0.913, tag="r1")]
    write_run(tmp_path / "a.run", run)
    assert read_run(tmp_path / "a.run") == run
    (tmp_path / "bad.qrels").write_text("q 0 c\n", encoding="utf-8")
    with pytest.raises(FormatError, match="bad.qrels:1"):
        read_qrels(tmp_path / "bad.qrels")


def test_cli(eval_files, capsys, tmp_path: Path):
    assert main(["snapshot", str(eval_files["snapshot"])]) == 0
    assert "3 documents, 18 chunks" in capsys.readouterr().out
    args = ["check", "--snapshot", str(eval_files["snapshot"]), "--questions", str(eval_files["questions"])]
    assert main([*args, "--plan", str(eval_files["plan"]), "--runs", str(eval_files["run"])]) == 0
    out = tmp_path / "moved.jsonl"
    reanchor_args = ["reanchor", "--snapshot", str(eval_files["snapshot"]), "--questions", str(eval_files["questions"])]
    assert main([*reanchor_args, "--out", str(out)]) == 0
    assert len(read_questions(out)[1]) == 2
    (eval_files["snapshot"] / "md" / "wstg-v4.2.md").write_text("changed", encoding="utf-8")
    assert main(args) == 1
    assert main(["generate"]) == 2
