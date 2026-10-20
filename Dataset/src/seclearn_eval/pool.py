"""`pool`: the union of every system's top-k and the chunks covering a gold span (spec user story 53).

Only questions that get qrels are pooled (answerable, not rejected). Pooling again keeps the LLM grade and the human
pick of every (question, chunk) already in the pool, so a grown pool sends only its new entries to the judge.
"""

from __future__ import annotations

from .qrels import chunk_order, gradable
from .retrieval import Ranked, Retriever
from .schema import PoolEntry, Question, RunLine
from .snapshot import Snapshot
from .spans import covers


def run_systems(systems: list[Retriever], questions: list[Question], snap: Snapshot, depth: int) -> dict[str, Ranked]:
    pooled = [q for q in questions if gradable(q)]
    return {s.name: s.retrieve(pooled, snap.chunks, depth) for s in systems}


def build_pool(questions: list[Question], snap: Snapshot, ranked: dict[str, Ranked], depth: int,
               previous: list[PoolEntry] | None = None) -> list[PoolEntry]:
    old = {(e.question_id, e.chunk_key): e for e in previous or [] if e.chunker_version == snap.chunker_version}
    out: list[PoolEntry] = []
    for q in sorted((q for q in questions if gradable(q)), key=lambda q: q.id):
        found: dict[str, list[str]] = {}
        for system, by_q in ranked.items():
            for chunk_key, _ in by_q.get(q.id, [])[:depth]:
                found.setdefault(chunk_key, []).append(system)
        gold = {c.chunk_key for s in q.gold_evidence for c in snap.chunks_of(s.doc_key) if covers(c, s)}
        for chunk_key in sorted(set(found) | gold, key=chunk_order):
            entry = PoolEntry(question_id=q.id, chunk_key=chunk_key, systems=found.get(chunk_key, []),
                              covers_gold=chunk_key in gold, chunker_version=snap.chunker_version)
            if (prev := old.get((q.id, chunk_key))) is not None:
                entry = entry.model_copy(update={k: getattr(prev, k) for k in ("llm_grade", "llm_model", "llm_prompt_version", "for_human")})
            out.append(entry)
    return out


def run_lines(name: str, ranked: Ranked) -> list[RunLine]:
    return [RunLine(qid=qid, chunk_key=c, rank=r, score=s, tag=name)
            for qid in sorted(ranked) for r, (c, s) in enumerate(ranked[qid], start=1)]
