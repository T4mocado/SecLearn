"""The five pooling systems (spec user story 52), run in Python on the snapshot's chunks, never through the app (ADR 0004).

  bm25-en          BM25 on `question_en` (the corpus is English)
  vi-embed         the app's Vietnamese embedding model on the Vietnamese question
  vi-embed+rerank  the app's cross-encoder reordering vi-embed's candidates, best score over question and question_en
                   (as the app's RAG does)
  bge-m3-vi        bge-m3 dense vectors on the Vietnamese question
  bge-m3-en        bge-m3 dense vectors on `question_en`

Models sit behind two small interfaces, `Encoder` and `Scorer`, so tests run on fakes and never load weights. The real
adapters need the optional `retrieval` dependency group (sentence-transformers, pyvi): `uv sync --group retrieval`.
Chunk embeddings are cached per model and per document markdown (md_sha256), keyed inside by the chunk text, so a new
snapshot re-embeds only the documents that changed, and a new chunker only the chunks whose text changed.
"""

from __future__ import annotations

import base64
import hashlib
import json
import math
import re
from array import array
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Protocol

import numpy as np

from .schema import Chunk, EncoderRef, PoolConfig, Question, RerankerRef
from .snapshot import Snapshot

#: question_id → [(chunk_key, score)], best first.
Ranked = dict[str, list[tuple[str, float]]]
QuestionField = Literal["question", "question_en"]


class Encoder(Protocol):
    #: Model id (with "@revision" when pinned): part of the embedding cache key.
    model: str

    def encode(self, texts: list[str], *, query: bool) -> list[list[float]]: ...


class Scorer(Protocol):
    model: str

    def score(self, pairs: list[tuple[str, str]]) -> list[float]: ...


class Retriever(Protocol):
    name: str

    def retrieve(self, questions: list[Question], chunks: list[Chunk], k: int) -> Ranked: ...


def _top(scores: Sequence[float], chunks: Sequence[Chunk], k: int, positive_only: bool = False) -> list[tuple[str, float]]:
    order = sorted(range(len(chunks)), key=lambda i: (-scores[i], i))
    return [(chunks[i].chunk_key, float(scores[i])) for i in order if not (positive_only and scores[i] <= 0)][:k]


# --- BM25 ----------------------------------------------------------------------------------------

_TOKEN = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


@dataclass
class BM25:
    """Okapi BM25 with Lucene's idf, ln(1 + (N - df + 0.5) / (df + 0.5)); chunks sharing no term are not returned."""

    name: str = "bm25-en"
    field: QuestionField = "question_en"
    k1: float = 1.2
    b: float = 0.75

    def retrieve(self, questions: list[Question], chunks: list[Chunk], k: int) -> Ranked:
        docs = [Counter(tokenize(c.text)) for c in chunks]
        lengths = [sum(d.values()) for d in docs]
        avgdl = sum(lengths) / len(lengths) if lengths else 0.0
        df = Counter(t for d in docs for t in d)
        n = len(docs)
        idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        out: Ranked = {}
        for q in questions:
            terms = [t for t in dict.fromkeys(tokenize(getattr(q, self.field))) if t in idf]
            scores = []
            for d, dl in zip(docs, lengths, strict=True):
                norm = self.k1 * (1 - self.b + self.b * dl / avgdl) if avgdl else self.k1
                scores.append(sum(idf[t] * d[t] * (self.k1 + 1) / (d[t] + norm) for t in terms if t in d))
            out[q.id] = _top(scores, chunks, k, positive_only=True)
        return out


# --- Dense, with the chunk embedding cache --------------------------------------------------------


def _safe(model: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-._@" else "_" for ch in model)


def _text_key(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@dataclass
class EmbeddingCache:
    """`<root>/<model>/<md_sha256>.json`: the vectors of one document's chunks under one model, by chunk text."""

    root: Path
    hits: int = 0
    misses: int = 0

    def vectors(self, encoder: Encoder, chunks: list[Chunk], md_sha256: dict[str, str]) -> list[list[float]]:
        by_doc: dict[str, list[int]] = {}
        for i, c in enumerate(chunks):
            by_doc.setdefault(c.doc_key, []).append(i)
        out: list[list[float]] = [[] for _ in chunks]
        for doc_key, idx in by_doc.items():
            path = self.root / _safe(encoder.model) / f"{md_sha256[doc_key]}.json"
            stored: dict[str, str] = json.loads(path.read_text(encoding="utf-8"))["vectors"] if path.is_file() else {}
            missing = list(dict.fromkeys(chunks[i].text for i in idx if _text_key(chunks[i].text) not in stored))
            self.hits += len(idx) - len(missing)
            self.misses += len(missing)
            if missing:
                for text, vec in zip(missing, encoder.encode(missing, query=False), strict=True):
                    stored[_text_key(text)] = base64.b64encode(array("f", vec).tobytes()).decode("ascii")
                path.parent.mkdir(parents=True, exist_ok=True)
                tmp = path.with_suffix(".tmp")
                tmp.write_text(json.dumps({"model": encoder.model, "md_sha256": md_sha256[doc_key], "vectors": stored}), encoding="utf-8")
                tmp.replace(path)
            for i in idx:
                vec = array("f")
                vec.frombytes(base64.b64decode(stored[_text_key(chunks[i].text)]))
                out[i] = vec.tolist()
        return out


def _normalized(rows: list[list[float]]) -> np.ndarray:
    m = np.asarray(rows, dtype=np.float32)
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    return m / np.where(norms == 0, 1, norms)


@dataclass
class DenseRetriever:
    """Cosine between the question (one field of it) and every chunk."""

    name: str
    encoder: Encoder
    cache: EmbeddingCache
    #: The snapshot the chunks come from: the md_sha256 of each document keys the embedding cache.
    snap: Snapshot
    field: QuestionField

    def retrieve(self, questions: list[Question], chunks: list[Chunk], k: int) -> Ranked:
        if not questions:
            return {}
        hashes = {d.doc_key: d.md_sha256 for d in self.snap.manifest.documents}
        docs = _normalized(self.cache.vectors(self.encoder, chunks, hashes))
        queries = _normalized(self.encoder.encode([getattr(q, self.field) for q in questions], query=True))
        scores = queries @ docs.T
        return {q.id: _top(scores[n].tolist(), chunks, k) for n, q in enumerate(questions)}


@dataclass
class RerankRetriever:
    """A cross-encoder reordering a base system's `candidates`; each chunk's score is its best over question and question_en."""

    name: str
    base: Retriever
    scorer: Scorer
    candidates: int = 20

    def retrieve(self, questions: list[Question], chunks: list[Chunk], k: int) -> Ranked:
        text = {c.chunk_key: c.text for c in chunks}
        base = self.base.retrieve(questions, chunks, self.candidates)
        out: Ranked = {}
        for q in questions:
            keys = [c for c, _ in base.get(q.id, [])]
            pairs = [(query, text[c]) for c in keys for query in (q.question, q.question_en)]
            flat = self.scorer.score(pairs) if pairs else []
            best = [max(flat[2 * i], flat[2 * i + 1]) for i in range(len(keys))]
            order = sorted(range(len(keys)), key=lambda i: (-best[i], i))
            out[q.id] = [(keys[i], float(best[i])) for i in order][:k]
        return out


# --- The five systems ----------------------------------------------------------------------------

#: (kind, model ref) → an Encoder ("encoder") or a Scorer ("cross-encoder").
ModelFactory = Callable[[str, Any], Any]


def build_systems(config: PoolConfig, cache: EmbeddingCache, factory: ModelFactory, snap: Snapshot) -> list[Retriever]:
    loaded: dict[tuple[str, str], Any] = {}

    def get(kind: str, ref: EncoderRef | RerankerRef) -> Any:
        key = (kind, ref.model)
        if key not in loaded:
            loaded[key] = factory(kind, ref)
        return loaded[key]

    vi = DenseRetriever("vi-embed", get("encoder", config.vi_embedder), cache, snap, field="question")
    m3 = get("encoder", config.multilingual)
    return [
        BM25(),
        vi,
        RerankRetriever("vi-embed+rerank", vi, get("cross-encoder", config.reranker), candidates=config.reranker.candidates),
        DenseRetriever("bge-m3-vi", m3, cache, snap, field="question"),
        DenseRetriever("bge-m3-en", m3, cache, snap, field="question_en"),
    ]


# --- Real models (optional `retrieval` group) ------------------------------------------------------


def _missing_group(err: ImportError) -> ImportError:
    return ImportError(f"{err.name} is not installed: the pooling models need `uv sync --group retrieval`")


@dataclass
class SentenceTransformerEncoder:
    ref: EncoderRef
    model: str = ""
    _st: Any = field(default=None, repr=False)
    _segment: Callable[[str], str] | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as err:
            raise _missing_group(err) from None
        self.model = self.ref.model + (f"@{self.ref.revision}" if self.ref.revision else "")
        self._st = SentenceTransformer(self.ref.model, revision=self.ref.revision)
        self._st.max_seq_length = self.ref.max_seq_length
        if self.ref.segment == "pyvi":
            try:
                from pyvi.ViTokenizer import tokenize as segment
            except ImportError as err:
                raise _missing_group(err) from None
            self._segment = segment

    def encode(self, texts: list[str], *, query: bool) -> list[list[float]]:
        if self._segment is not None:
            texts = [self._segment(t) for t in texts]
        return self._st.encode(texts, batch_size=32, normalize_embeddings=True, show_progress_bar=len(texts) > 256).tolist()


@dataclass
class CrossEncoderScorer:
    ref: RerankerRef
    model: str = ""
    _ce: Any = field(default=None, repr=False)

    def __post_init__(self) -> None:
        try:
            import torch
            from sentence_transformers import CrossEncoder
        except ImportError as err:
            raise _missing_group(err) from None
        self.model = self.ref.model + (f"@{self.ref.revision}" if self.ref.revision else "")
        # Sigmoid: the 0..1 relevance the app's embed server returns.
        self._ce = CrossEncoder(self.ref.model, revision=self.ref.revision, max_length=self.ref.max_length,
                                activation_fn=torch.nn.Sigmoid())

    def score(self, pairs: list[tuple[str, str]]) -> list[float]:
        return [float(s) for s in self._ce.predict(pairs, batch_size=32)]


class UnpinnedModelError(ValueError):
    """A real model without a `revision`: its cache key would not change when the weights upstream do."""


def model_factory(allow_unpinned: bool = False) -> ModelFactory:
    """The real adapters. A model whose `revision` is null is refused before anything loads, unless `allow_unpinned`:
    the embedding cache is keyed by model id + revision, so unpinned weights that change upstream would silently be
    scored against stale vectors."""

    def make(kind: str, ref: Any) -> Any:
        if ref.revision is None and not allow_unpinned:
            raise UnpinnedModelError(
                f"{ref.model}: `revision` is null in the pool config. Pin it to the Hugging Face commit you downloaded, "
                "or pass --allow-unpinned (the embedding cache key then has no commit)"
            )
        return CrossEncoderScorer(ref) if kind == "cross-encoder" else SentenceTransformerEncoder(ref)

    return make
