"""`l6b`: security questions the corpus does not answer, with the evidence a reviewer needs to confirm it (ticket 09)."""

from __future__ import annotations

import pytest

from seclearn_eval import annotate
from seclearn_eval.absence import ABSENCE_DEPTH, not_in_corpus
from seclearn_eval.llm import FakeClient
from seclearn_eval.retrieval import BM25
from seclearn_eval.schema import PlanCell, SamplePlan
from seclearn_eval.snapshot import load_snapshot


@pytest.fixture
def snap(snap_dir):
    return load_snapshot(snap_dir)


class FirstChunks:
    """A second retriever that returns the snapshot's chunks in order."""

    name = "fake-dense"

    def retrieve(self, questions, chunks, k):
        return {q.id: [(c.chunk_key, 1.0 / (i + 1)) for i, c in enumerate(chunks[:k])] for q in questions}


def l6b_writer():
    def reply(prompt, schema):
        n = int(prompt.split("exactly ")[1].split(" ")[0])
        items = [
            {"question": "Kerberos ủy quyền thế nào?", "question_en": "How does Kerberos delegation work?", "keywords": ["Kerberos", "delegation"]},
            {"question": "Cookie SameSite có tác dụng gì với Kerberos?", "question_en": "What does SameSite do for Kerberos?", "keywords": ["SameSite", "Kerberos"]},
        ]
        return {"items": (items * n)[:n]}

    return FakeClient(model="claude-fake", reply=reply)


def plan(test_target=1, dev_target=0):
    cells = [PlanCell(split="test", cluster=None, level="L6", l6_kind="not_in_corpus", target=test_target),
             PlanCell(split="dev", cluster=None, level="L6", l6_kind="not_in_corpus", target=dev_target)]
    return SamplePlan(snapshot_id="2026-10-18-mini", seed=7, params={}, cells=cells, slots=[])


def test_l6b_questions_carry_grep_hits_and_two_retrievers_top_20(snap):
    out, report = not_in_corpus([], plan(test_target=1), snap, l6b_writer(), [BM25(), FirstChunks()], oversample=1.6)
    assert len(out) == 2 and report.cells[0].made == 2  # ceil(1.6 × 1); the dev cell wants none
    q = out[1]
    assert (q.split, q.cluster, q.strata.level, q.strata.l6_kind, q.strata.answerable) == ("test", None, "L6", "not_in_corpus", False)
    assert q.seed_id == q.id and q.gold_evidence == [] and q.review.status == "pending"
    hits = {k.keyword: k for k in q.absence_evidence.keywords}
    assert hits["Kerberos"].n_hits == 0 and hits["Kerberos"].doc_keys == []
    assert hits["SameSite"].n_hits > 0 and "Session_Management_Cheat_Sheet" in hits["SameSite"].doc_keys
    systems = {r.system for r in q.absence_evidence.retrieved}
    assert systems == {"bm25-en", "fake-dense"}
    dense = [r for r in q.absence_evidence.retrieved if r.system == "fake-dense"]
    assert [r.rank for r in dense] == list(range(1, min(ABSENCE_DEPTH, len(snap.chunks)) + 1))


def test_l6b_evidence_is_shown_to_the_reviewer(snap, tmp_path):
    out, _ = not_in_corpus([], plan(test_target=1), snap, l6b_writer(), [BM25(), FirstChunks()], oversample=1.6)
    [_, task] = annotate.review_tasks(out, snap, [], "v1")  # the second question names SameSite and Kerberos
    shown = task["data"]["absence_evidence"]
    assert "Kerberos: 0" in shown and "SameSite:" in shown
    first = snap.chunks[0]
    assert first.chunk_key in shown and first.text[:40] in shown  # the reviewer reads the chunk, not just its key


def test_a_question_that_is_not_l6b_shows_no_absence_evidence(snap, snap_dir):
    from conftest import question

    [task] = annotate.review_tasks([question("q1", "test", "auth", "L1", [])], snap, [], "v1")
    assert task["data"]["absence_evidence"] == annotate.NO_ABSENCE_EVIDENCE


def test_ids_and_seeds_differ_per_split_and_a_full_cell_gets_nothing(snap):
    client = l6b_writer()
    out, _ = not_in_corpus([], plan(test_target=1, dev_target=1), snap, client, [BM25()], oversample=1.0)
    assert sorted(q.id for q in out) == ["dev-l6b-r1-001", "test-l6b-r1-001"]
    assert len({c.seed for c in client.calls}) == 2
    again, report = not_in_corpus(out, plan(test_target=1, dev_target=1), snap, client, [BM25()], oversample=1.0)
    assert again == [] and report.cells == []


def test_a_refused_l6b_call_is_reported_and_a_question_naming_the_document_is_dropped(snap):
    from seclearn_eval.llm import ModelRefusal

    def reply(prompt, schema):
        raise ModelRefusal("claude-fake: stopped with refusal")

    _, report = not_in_corpus([], plan(test_target=1), snap, FakeClient(model="claude-fake", reply=reply), [BM25()], oversample=1.0)
    [c] = report.cells
    assert (c.made, c.refused) == (0, 1)

    pointing = FakeClient(model="claude-fake", reply=lambda p, s: {"items": [
        {"question": "Tài liệu này nói gì về Kerberos?", "question_en": "What does this document say about Kerberos?", "keywords": ["Kerberos"]}]})
    out, report = not_in_corpus([], plan(test_target=1), snap, pointing, [BM25()], oversample=1.0)
    assert out == [] and [r.reason for r in report.rejected][:1] == ["refers_to_document"]
