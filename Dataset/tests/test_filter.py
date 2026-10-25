"""`filter`: six steps in a fixed order, each rejecting the broken candidate it is for and counting what it did."""

from __future__ import annotations

import pytest
from conftest import MINI

from seclearn_eval.clusters import build_cluster_map
from seclearn_eval.filter import STEPS, candidates_to_questions, run_filter
from seclearn_eval.llm import CachedClient, FakeClient
from seclearn_eval.prompts import ANSWER_VERSION, LEVEL_VERSION, answer_prompt, level_prompt
from seclearn_eval.schema import Candidate, CompareCell, Generation, LLMConfig, ModelRef, Quote
from seclearn_eval.snapshot import load_snapshot
from seclearn_eval.spans import quote_at
from seclearn_eval.units import build_units

SESS = "Session_Management_Cheat_Sheet"
REAL_QUOTE = "The Secure cookie attribute instructs web browsers to only send the cookie through an encrypted HTTPS"
CONFIG = LLMConfig(
    generator=ModelRef(provider="claude", model="claude-fake"),
    judge=ModelRef(provider="gemini", model="gemini-fake"),
    embedder=ModelRef(provider="gemini", model="embed-fake"),
)


@pytest.fixture
def snap():
    return load_snapshot(MINI)


@pytest.fixture
def units(snap):
    return build_units(snap, build_cluster_map(snap.manifest))[0]


def cand(cid, question="Thuộc tính Secure của cookie có tác dụng gì?", *, level="L1", quotes=None, cluster="auth",
         question_en=None, unit_ids=None, l6_kind=None) -> Candidate:
    return Candidate(
        candidate_id=cid,
        slot_id=cid,
        split="test",
        cluster=cluster,
        level=level,
        l6_kind=l6_kind,
        unit_ids=unit_ids if unit_ids is not None else ([] if level == "L6" else [f"{SESS}#s02"]),
        question=question,
        question_en=question_en or f"What does question {cid} ask?",
        reference_answer=None if level == "L6" else "Chỉ gửi cookie qua HTTPS.",
        quotes=[Quote(doc_key=SESS, quote=REAL_QUOTE)] if quotes is None else quotes,
        generation=Generation(model="claude-fake", prompt_version=f"gen-{level}-v1", seed=1),
    )


def judge(cands, *, unanswerable=(), levels=None) -> FakeClient:
    """Answers "answerable" unless the question is listed; agrees with each candidate's level unless `levels` says otherwise."""
    levels = {**{c.question: c.level for c in cands}, **(levels or {})}

    def reply(prompt, schema):
        question = next(line[len("Question: "):] for line in prompt.splitlines() if line.startswith("Question: "))
        if "answerable" in schema["properties"]:
            return {"answerable": question not in unanswerable, "answer": "…"}
        return {"level": levels[question]}

    return FakeClient(model="gemini-fake", reply=reply)


def embedder(vectors=None) -> FakeClient:
    """Distinct texts get orthogonal vectors unless `vectors` pins them."""
    vectors = dict(vectors or {})
    seen: dict[str, int] = {}

    def one(text):
        if text in vectors:
            return vectors[text]
        i = seen.setdefault(text, len(seen))
        return [0.0] * i + [1.0] + [0.0] * (64 - i)

    return FakeClient(model="embed-fake", embed_one=one)


def run(cands, snap, units, j=None, e=None):
    return run_filter(cands, snap, units, judge=j or judge(cands), embedder=e or embedder(), config=CONFIG)


def rejected(report):
    return {r.candidate_id: (r.step, r.reason) for r in report.rejected}


def test_steps_run_in_the_fixed_order():
    assert [s for s in STEPS] == ["quote", "answerable", "level", "self_reference", "dedup", "l2_overlap"]


def test_a_good_candidate_passes_every_step_and_the_report_counts_each(snap, units):
    kept, report = run([cand("ok")], snap, units)
    assert [c.candidate_id for c in kept] == ["ok"]
    assert [(s.step, s.n_in, s.n_rejected) for s in report.steps] == [(s, 1, 0) for s in STEPS]
    assert report.n_kept == 1 and report.rejected == []


def test_step_quote_rejects_quotes_not_in_the_snapshot(snap, units):
    bad = cand("made-up", quotes=[Quote(doc_key=SESS, quote="Session IDs must be rotated every 5 minutes.")])
    none = cand("no-quote", quotes=[])
    wrong_doc = cand("wrong-doc", quotes=[Quote(doc_key="?", quote=REAL_QUOTE)])
    ood = cand("ood", "Món phở nấu thế nào?", level="L6", l6_kind="out_of_domain", cluster=None, quotes=[])
    kept, report = run([bad, none, wrong_doc, ood, cand("ok")], snap, units)
    assert rejected(report) == {
        "made-up": ("quote", "quote_not_found"),
        "no-quote": ("quote", "no_quote"),
        "wrong-doc": ("quote", "quote_not_found"),
    }
    assert {c.candidate_id for c in kept} == {"ood", "ok"}
    step = report.steps[0]
    assert (step.n_in, step.n_rejected, step.reasons) == (5, 3, {"quote_not_found": 2, "no_quote": 1})
    assert report.steps[1].n_in == 2


def test_step_answerable_rejects_what_the_evidence_does_not_answer(snap, units):
    ood = cand("ood", "Món phở nấu thế nào?", level="L6", l6_kind="out_of_domain", cluster=None, quotes=[])
    cands = [cand("ok"), cand("bad", "Cookie có hết hạn sau bao lâu?"), ood]
    j = judge(cands, unanswerable={"Cookie có hết hạn sau bao lâu?"})
    kept, report = run(cands, snap, units, j=j)
    assert rejected(report) == {"bad": ("answerable", "not_answerable_from_evidence")}
    # The judge only sees the evidence, and is not asked about L6 questions.
    answer_calls = [c for c in j.calls if "answerable" in c.schema["properties"]]
    assert len(answer_calls) == 2 and all(REAL_QUOTE in c.prompt for c in answer_calls)
    assert all("phở" not in c.prompt for c in answer_calls)
    assert {c.candidate_id for c in kept} == {"ok", "ood"}


def test_step_level_relabels_within_the_units_capability_or_rejects(snap, units):
    pair = [f"{SESS}#s02", "wstg-v4.2#WSTG-SESS-02"]
    cands = [
        cand("relabel", "Q relabel?"),  # one unit: L1 → L3 is a relabel
        cand("mismatch", "Q mismatch?"),  # one unit cannot hold a comparison
        cand("pair", "Q pair?", level="L4", unit_ids=pair),  # a pair: L4 → L5 is a relabel
        cand("unanswerable", "Q unanswerable?"),
        cand("ood", "Q ood?", level="L6", l6_kind="out_of_domain", cluster=None, quotes=[]),
    ]
    j = judge(cands, levels={"Q relabel?": "L3", "Q mismatch?": "L4", "Q pair?": "L5", "Q unanswerable?": "L6", "Q ood?": "L1"})
    kept, report = run(cands, snap, units, j=j)
    assert rejected(report) == {
        "mismatch": ("level", "level_mismatch"),
        "unanswerable": ("level", "level_mismatch"),
        "ood": ("level", "level_mismatch"),
    }
    by_id = {c.candidate_id: c for c in kept}
    assert (by_id["relabel"].level, by_id["relabel"].relabelled_from) == ("L3", "L1")
    assert (by_id["pair"].level, by_id["pair"].relabelled_from) == ("L5", "L4")
    step = report.steps[2]
    assert (step.n_rejected, step.n_relabelled) == (3, 2)


def test_step_level_keeps_an_l1_the_judge_calls_l2(snap, units):
    # L2 is L1 worded away from the document: same task, so an L1 the judge calls L2 stays L1, neither moved nor dropped.
    kept, report = run([cand("l1")], snap, units, j=judge([cand("l1")], levels={cand("l1").question: "L2"}))
    assert rejected(report) == {}
    assert [(c.candidate_id, c.level, c.relabelled_from) for c in kept] == [("l1", "L1", None)]
    assert report.steps[2].n_relabelled == 0


def test_level_prompt_says_a_vietnamese_question_on_english_evidence_is_not_a_paraphrase():
    prompt = level_prompt("Thuộc tính Secure của cookie có tác dụng gì?", [REAL_QUOTE])
    assert "Vietnamese" in prompt and "English" in prompt and "translation" in prompt
    assert LEVEL_VERSION == "filter-level-v2"


def test_an_l4_question_gets_one_compare_cell_per_unit_in_order(snap, units):
    pair = [f"{SESS}#s02", "wstg-v4.2#WSTG-SESS-02"]
    l4, l1 = cand("l4", "Q l4?", level="L4", unit_ids=pair), cand("l1", "Q l1?")
    kept, _ = run([l4, l1], snap, units)
    by_unit = {u.unit_id: u for u in units}
    titles = [f"{snap.document(by_unit[uid].doc_key).title} › {by_unit[uid].title}" for uid in pair]
    q4, q1 = candidates_to_questions(kept, snap, units)
    assert q4.compare_cells == [CompareCell(item=t, aspect="") for t in titles]
    assert q1.compare_cells == []


def test_answer_prompt_lets_comparisons_and_scenarios_combine_each_sides_evidence():
    # Round 1 of top-up: "session fixation vs session hijacking", with five quotes on the two, was judged unanswerable;
    # the judge would not draw the difference from what each quote says about one side.
    for level in ("L4", "L5"):
        prompt = answer_prompt("Q?", [REAL_QUOTE], level)
        assert "each side" in prompt and "infer" in prompt
    assert ANSWER_VERSION == "filter-answer-v2"


def test_answer_prompt_for_single_unit_levels_is_unchanged_so_its_cache_still_hits():
    v1 = f"""Answer the question using ONLY the evidence below, not your own knowledge.
If the evidence does not contain enough to answer it, set answerable to false.

Question: Q?

<evidence>{REAL_QUOTE}</evidence>"""
    assert [answer_prompt("Q?", [REAL_QUOTE], level) for level in ("L1", "L3")] == [v1, v1]


def test_step_answerable_asks_with_the_candidates_level(snap, units):
    pair = [f"{SESS}#s02", "wstg-v4.2#WSTG-SESS-02"]
    cands = [cand("l4", "Q l4?", level="L4", unit_ids=pair), cand("l1", "Q l1?")]
    levels = {c.question: c.level for c in cands}

    def reply(prompt, schema):
        if "answerable" in schema["properties"]:
            return {"answerable": "each side" in prompt, "answer": "…"}
        question = next(line[len("Question: "):] for line in prompt.splitlines() if line.startswith("Question: "))
        return {"level": levels[question]}

    _, report = run(cands, snap, units, j=FakeClient(model="gemini-fake", reply=reply))
    assert rejected(report) == {"l1": ("answerable", "not_answerable_from_evidence")}


def test_step_quote_rejects_a_quote_found_only_outside_the_candidates_units(snap, units):
    # REAL_QUOTE is in the Cookies section (s02); a candidate written from Session ID Properties (s01) cannot cite it.
    elsewhere = cand("elsewhere", unit_ids=[f"{SESS}#s01"])
    own = cand("own", unit_ids=[f"{SESS}#s01"], quotes=[Quote(doc_key=SESS, quote="The session ID must be long enough")])
    kept, report = run([elsewhere, own], snap, units)
    assert rejected(report) == {"elsewhere": ("quote", "quote_outside_units")}
    assert [c.candidate_id for c in kept] == ["own"]
    [q] = candidates_to_questions(kept, snap, units)
    by_unit = {u.unit_id: u for u in units}
    s01 = by_unit[f"{SESS}#s01"]
    assert s01.char_start <= q.gold_evidence[0].char_start < q.gold_evidence[0].char_end <= s01.char_end


def test_step_level_relabels_l1_to_l3_only_on_a_unit_of_two_chunks(snap, units):
    by_unit = {u.unit_id: u for u in units}
    assert (by_unit[f"{SESS}#s01"].chunks, by_unit[f"{SESS}#s02"].chunks) == (1, 2)
    one_chunk = cand("one-chunk", "Q one?", unit_ids=[f"{SESS}#s01"], quotes=[Quote(doc_key=SESS, quote="at least 128 bits (16 bytes)")])
    two_chunks = cand("two-chunks", "Q two?")
    j = judge([one_chunk, two_chunks], levels={"Q one?": "L3", "Q two?": "L3"})
    kept, report = run([one_chunk, two_chunks], snap, units, j=j)
    assert rejected(report) == {"one-chunk": ("level", "l3_needs_two_chunks")}
    assert [(c.candidate_id, c.level) for c in kept] == [("two-chunks", "L3")]


def test_step_self_reference_rejects_questions_that_do_not_stand_alone(snap, units):
    cands = [
        cand("doc", "Theo tài liệu này, thuộc tính Secure làm gì?"),
        cand("table", "Bảng 2 liệt kê những thuộc tính cookie nào?"),
        cand("chapter", "Chương 4 nói gì về cookie?"),
        cand("figure", "Hình 3 minh hoạ luồng nào?"),
        cand("en", "Thuộc tính Secure làm gì?", question_en="According to this document, what does Secure do?"),
        cand("dashboard", "Bảng điều khiển quản trị có cần cookie Secure không?"),  # "bảng điều khiển" is a dashboard
    ]
    kept, report = run(cands, snap, units)
    assert rejected(report) == {k: ("self_reference", "refers_to_document") for k in ("doc", "table", "chapter", "figure", "en")}
    assert [c.candidate_id for c in kept] == ["dashboard"]


def test_step_dedup_drops_the_later_of_two_same_meaning_questions_in_one_cluster(snap, units):
    e = embedder({"Secure flag?": [1.0, 0.0], "What is the Secure flag for?": [0.99, 0.05], "Other cluster?": [1.0, 0.0]})
    cands = [
        cand("first", "Q1?", question_en="Secure flag?"),
        cand("second", "Q2?", question_en="What is the Secure flag for?"),
        cand("other", "Q3?", question_en="Other cluster?", cluster="browser"),
    ]
    kept, report = run(cands, snap, units, e=e)
    assert rejected(report) == {"second": ("dedup", "duplicate")}
    assert next(r for r in report.rejected if r.candidate_id == "second").detail.startswith("first")
    assert {c.candidate_id for c in kept} == {"first", "other"}


def test_step_l2_overlap_rejects_paraphrases_that_copy_the_document(snap, units):
    copy = cand("copy", "Q copy?", level="L2", question_en="Does the Secure cookie attribute instruct web browsers to only send the cookie through HTTPS?")
    para = cand("para", "Q para?", level="L2", question_en="Which flag keeps a session token off plain-text connections?")
    # Only L2 is checked: an L1 may use the document's words (other cluster, so dedup leaves it alone).
    l1_copy = cand("l1", "Q l1?", cluster="browser", question_en="Does the Secure cookie attribute instruct web browsers to only send the cookie through HTTPS?")
    kept, report = run([copy, para, l1_copy], snap, units)
    assert rejected(report) == {"copy": ("l2_overlap", "too_close_to_document")}
    assert {c.candidate_id for c in kept} == {"para", "l1"}


def test_kept_candidates_become_pending_questions_with_located_gold_spans(snap, units):
    kept, _ = run([cand("ok")], snap, units)
    [q] = candidates_to_questions(kept, snap, units)
    assert (q.id, q.seed_id, q.review.status, q.strata.level, q.strata.answerable) == ("ok", "ok", "pending", "L1", True)
    assert q.strata.gold_source == "cheat_sheet"
    [span] = q.gold_evidence
    assert span.md_sha256 == snap.document(SESS).md_sha256
    assert quote_at(snap.markdown[SESS], span, REAL_QUOTE)


def test_rerun_does_not_call_the_judge_or_embedder_again(snap, units, tmp_path):
    cands = [cand("a", "Q a?"), cand("b", "Q b?")]
    j, e = judge(cands), embedder()
    run(cands, snap, units, j=CachedClient(j, tmp_path / "c"), e=CachedClient(e, tmp_path / "c"))
    n_j, n_e = len(j.calls), len(e.calls)
    assert n_j and n_e
    _, report = run(cands, snap, units, j=CachedClient(j, tmp_path / "c"), e=CachedClient(e, tmp_path / "c"))
    assert (len(j.calls), len(e.calls)) == (n_j, n_e)
    assert report.n_kept == 2
