"""`pool`: five retrieval systems over the snapshot's chunks (fakes in place of the models), chunk embeddings cached by
md_sha256 + model, and the pool = union of every system's top-k + the chunks covering a gold span."""

from __future__ import annotations

import json
import math
import re
from typing import ClassVar

import pytest
from conftest import CANARY, MINI, question, span

from seclearn_eval.cli import main
from seclearn_eval.io import read_jsonl, read_run, write_questions
from seclearn_eval.pool import build_pool
from seclearn_eval.retrieval import BM25, DenseRetriever, EmbeddingCache, RerankRetriever, build_systems
from seclearn_eval.schema import Chunk, PoolConfig, PoolEntry, QuestionFileHeader
from seclearn_eval.snapshot import load_snapshot

SESS = "Session_Management_Cheat_Sheet"
SYSTEMS = ["bm25-en", "vi-embed", "vi-embed+rerank", "bge-m3-vi", "bge-m3-en"]


@pytest.fixture
def snap():
    return load_snapshot(MINI)


def chunk(key: str, text: str) -> Chunk:
    doc, _, i = key.partition("#")
    return Chunk(chunk_key=key, doc_key=doc, chunk_index=int(i), text=text, content_sha1="x", char_start=0, char_end=len(text), db_id="x")


class BagOfWords:
    """A fake encoder: one dimension per vocabulary word; counts what it was asked to encode."""

    VOCAB: ClassVar[list[str]] = ["session", "cookie", "secure", "httponly", "samesite", "token", "csrf", "bits", "entropy", "phiên", "bảo"]

    def __init__(self, model: str = "fake-embed"):
        self.model = model
        self.encoded: list[str] = []

    def encode(self, texts: list[str], *, query: bool) -> list[list[float]]:
        if not query:
            self.encoded += texts
        out = []
        for t in texts:
            words = re.findall(r"\w+", t.lower())
            v = [float(words.count(w)) for w in self.VOCAB] + [0.01]
            n = math.sqrt(sum(x * x for x in v))
            out.append([x / n for x in v])
        return out


def test_bm25_scores_a_one_term_query_by_hand_and_skips_chunks_without_the_term():
    # N = 2, df = 1: idf = ln(1 + 1.5 / 1.5) = ln 2; tf = 1, dl = avgdl: tf(k1 + 1) / (tf + k1) = 1, so the score is ln 2.
    chunks = [chunk("a#0", "cookie secure"), chunk("a#1", "session id")]
    q = question("q1", "test", "auth", "L1", []).model_copy(update={"question_en": "Cookie?"})
    ranked = BM25().retrieve([q], chunks, k=10)
    assert ranked == {"q1": [("a#0", pytest.approx(math.log(2)))]}


def test_bm25_prefers_the_chunk_saying_the_term_more_often_at_equal_length():
    chunks = [chunk("a#0", "cookie session session"), chunk("a#1", "cookie cookie session"), chunk("a#2", "token csrf form")]
    q = question("q1", "test", "auth", "L1", []).model_copy(update={"question_en": "What about the cookie?"})
    assert [c for c, _ in BM25().retrieve([q], chunks, k=10)["q1"]] == ["a#1", "a#0"]


def test_chunk_embeddings_are_cached_by_markdown_hash_and_model(snap, tmp_path):
    q = question("q1", "test", "auth", "L1", []).model_copy(update={"question": "cookie secure httponly"})
    encoder = BagOfWords()
    first = DenseRetriever("vi-embed", encoder, EmbeddingCache(tmp_path), snap, field="question").retrieve([q], snap.chunks, k=3)
    assert len(encoder.encoded) == len(snap.chunks)
    assert first["q1"][0][0] == f"{SESS}#2"
    sha = snap.document(SESS).md_sha256
    assert (tmp_path / "fake-embed" / f"{sha}.json").is_file()

    again = BagOfWords()
    second = DenseRetriever("vi-embed", again, EmbeddingCache(tmp_path), snap, field="question").retrieve([q], snap.chunks, k=3)
    assert again.encoded == [] and second == first
    other = BagOfWords("other-model")
    DenseRetriever("x", other, EmbeddingCache(tmp_path), snap, field="question").retrieve([q], snap.chunks, k=3)
    assert len(other.encoded) == len(snap.chunks)


def test_a_dense_system_with_no_questions_returns_nothing(snap, tmp_path):
    assert DenseRetriever("vi-embed", BagOfWords(), EmbeddingCache(tmp_path), snap, field="question").retrieve([], snap.chunks, k=3) == {}


class FakeCrossEncoder:
    model = "fake-rerank"

    def __init__(self, best: dict[str, float]):
        self.best = best
        self.pairs: list[tuple[str, str]] = []

    def score(self, pairs: list[tuple[str, str]]) -> list[float]:
        self.pairs += pairs
        return [next((s for word, s in self.best.items() if word in q.lower() and word in d.lower()), 0.0) for q, d in pairs]


def test_the_reranker_reorders_the_base_candidates_by_its_best_score_over_the_vietnamese_and_english_question(snap, tmp_path):
    q = question("q1", "test", "auth", "L1", []).model_copy(update={"question": "cookie secure httponly", "question_en": "samesite"})
    base = DenseRetriever("vi-embed", BagOfWords(), EmbeddingCache(tmp_path), snap, field="question")
    scorer = FakeCrossEncoder({"samesite": 0.9})
    ranked = RerankRetriever("vi-embed+rerank", base, scorer, candidates=4).retrieve([q], snap.chunks, k=2)
    top = [c for c, _ in ranked["q1"]]
    text = {c.chunk_key: c.text for c in snap.chunks}
    # Only the English question names SameSite: the chunks saying it come first, wherever the embedding put them.
    assert len(top) == 2 and all("samesite" in text[c].lower() for c in top)
    assert top != [c for c, _ in base.retrieve([q], snap.chunks, k=2)["q1"]]
    assert len(scorer.pairs) == 8  # 4 candidates × (question, question_en)


def test_the_pool_is_the_union_of_top_k_plus_chunks_covering_the_gold(snap):
    q1 = question("q1", "test", "auth", "L1", [span(MINI, SESS, "at least 128 bits (16 bytes)")])
    l6 = question("q9", "test", None, "L6", [])
    ranked = {
        "bm25-en": {"q1": [(f"{SESS}#2", 3.0), (f"{SESS}#3", 2.0), ("wstg-v4.2#4", 1.0)], "q9": [(f"{SESS}#0", 1.0)]},
        "bge-m3-vi": {"q1": [(f"{SESS}#3", 0.8), (f"{SESS}#0", 0.5)]},
    }
    pool = build_pool([q1, l6], snap, ranked, depth=2)
    got = {(e.chunk_key, tuple(e.systems), e.covers_gold) for e in pool}
    assert got == {
        (f"{SESS}#2", ("bm25-en",), False),
        (f"{SESS}#3", ("bm25-en", "bge-m3-vi"), False),
        (f"{SESS}#0", ("bge-m3-vi",), False),
        (f"{SESS}#1", (), True),  # found by no system: there because it covers the gold span
    }
    assert {e.question_id for e in pool} == {"q1"}  # L6 has no relevant chunk to pool
    assert {e.chunker_version for e in pool} == {"sentence-v2"}


def test_pooling_again_keeps_the_grades_already_given(snap):
    q1 = question("q1", "test", "auth", "L1", [span(MINI, SESS, "at least 128 bits (16 bytes)")])
    ranked = {"bm25-en": {"q1": [(f"{SESS}#2", 3.0)]}}
    old = [e.model_copy(update={"llm_grade": 2, "for_human": True}) if e.chunk_key == f"{SESS}#2" else e for e in build_pool([q1], snap, ranked, depth=10)]
    ranked["bge-m3-en"] = {"q1": [(f"{SESS}#3", 1.0)]}
    again = {e.chunk_key: e for e in build_pool([q1], snap, ranked, depth=10, previous=old)}
    assert (again[f"{SESS}#2"].llm_grade, again[f"{SESS}#2"].for_human) == (2, True)
    assert again[f"{SESS}#3"].llm_grade is None


def test_the_five_systems_come_from_the_pinned_config():
    config = PoolConfig.model_validate_json((MINI.parents[2] / "pool-config.json").read_text(encoding="utf-8"))
    assert config.vi_embedder.model == "bkai-foundation-models/vietnamese-bi-encoder"  # the app's EMBED_MODEL
    assert config.reranker.model == "BAAI/bge-reranker-v2-m3"  # the app's RERANK_MODEL
    assert config.multilingual.model == "BAAI/bge-m3"
    made: list[str] = []

    def factory(kind, ref):
        made.append(f"{kind}:{ref.model}")
        return FakeCrossEncoder({}) if kind == "cross-encoder" else BagOfWords(ref.model)

    systems = build_systems(config, EmbeddingCache(MINI / "unused"), factory, load_snapshot(MINI))
    assert [s.name for s in systems] == SYSTEMS
    # One model loaded once even when two systems share it.
    assert sorted(made) == ["cross-encoder:BAAI/bge-reranker-v2-m3", "encoder:BAAI/bge-m3", "encoder:bkai-foundation-models/vietnamese-bi-encoder"]


def test_the_real_models_refuse_a_null_revision_unless_allowed():
    """An unpinned model's cache key has no commit: new weights upstream would silently reuse old vectors."""
    from seclearn_eval.retrieval import UnpinnedModelError, model_factory
    from seclearn_eval.schema import EncoderRef, RerankerRef

    for kind, ref in [("encoder", EncoderRef(model="BAAI/bge-m3")), ("cross-encoder", RerankerRef(model="BAAI/bge-reranker-v2-m3"))]:
        with pytest.raises(UnpinnedModelError, match="--allow-unpinned"):
            model_factory()(kind, ref)


def test_the_command_stops_before_loading_any_model_when_a_revision_is_null(snap_dir, tmp_path, capsys):
    questions = tmp_path / "test.jsonl"
    write_questions(questions, QuestionFileHeader(canary=CANARY, eval_version="1.0.0", snapshot_id="2026-10-18-mini"),
                    [question("q1", "test", "auth", "L1", [])])
    # The repo's pool-config.json is pinned, so the unpinned case gets its own copy with one revision cleared.
    config = json.loads((MINI.parents[2] / "pool-config.json").read_text(encoding="utf-8"))
    config["reranker"]["revision"] = None
    unpinned = tmp_path / "pool-config.json"
    unpinned.write_text(json.dumps(config), encoding="utf-8")
    argv = ["pool", "--snapshot", str(snap_dir), "--questions", str(questions), "--config", str(unpinned),
            "--cache", str(tmp_path / "cache"), "--out", str(tmp_path / "pool.jsonl")]
    assert main(argv) == 1
    err = capsys.readouterr().err
    assert "revision" in err and "--allow-unpinned" in err
    assert not (tmp_path / "pool.jsonl").exists()


def test_the_command_runs_the_systems_and_writes_the_pool_and_one_trec_run_per_system(snap_dir, tmp_path, monkeypatch):
    from seclearn_eval import cli

    questions = tmp_path / "test.jsonl"
    q = question("q1", "test", "auth", "L1", [span(snap_dir, SESS, "at least 128 bits (16 bytes)")])
    q = q.model_copy(update={"question": "session cookie secure", "question_en": "session cookie secure"})
    write_questions(questions, QuestionFileHeader(canary=CANARY, eval_version="1.0.0", snapshot_id="2026-10-18-mini"), [q])
    monkeypatch.setattr(cli, "model_factory", lambda **_: (lambda kind, ref: FakeCrossEncoder({"secure": 1.0}) if kind == "cross-encoder" else BagOfWords(ref.model)))
    out = tmp_path / "judgments" / "pool.jsonl"
    argv = ["pool", "--snapshot", str(snap_dir), "--questions", str(questions), "--config", str(MINI.parents[2] / "pool-config.json"),
            "--cache", str(tmp_path / "cache"), "--out", str(out)]
    assert main(argv) == 0
    pool = read_jsonl(out, PoolEntry)
    assert {s for e in pool for s in e.systems} == set(SYSTEMS)
    assert any(e.covers_gold for e in pool)
    runs = out.with_name("pool-runs")
    assert sorted(p.stem for p in runs.glob("*.trec")) == sorted(SYSTEMS)
    assert all(len(read_run(p)) <= 10 for p in runs.glob("*.trec"))
