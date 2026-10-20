"""`judge`: Gemini grades the whole pool 0-3, the human's share is picked, and the human's 2-3 outside the gold extend
it (spec user stories 54-55).

The human grades every chunk Gemini gave ≥ 1, plus a fixed-seed sample of `ZERO_SAMPLE_RATE` of Gemini's zeros: the
sample is what estimates Gemini's false negatives (`agreement`). Picking again keeps the zeros already picked, so
re-running after the pool grew never moves the part the human has started on.
"""

from __future__ import annotations

import math
import random

from .io import FormatError
from .llm import LLMClient, LLMError
from .prompts import JUDGE_VERSION, POOL_JUDGE_SCHEMA, SYSTEM_POOL_JUDGE, pool_judge_prompt
from .qrels import gradable, latest_pool_labels
from .schema import GoldSpan, Label, PoolEntry, Question
from .snapshot import Snapshot
from .spans import overlap

ZERO_SAMPLE_RATE = 0.1
#: Fixed: the sample of Gemini zeros must come out the same on every run (spec: "seed cố định").
SAMPLE_SEED = 20261020
JUDGE_SEED = 0
#: Human grade from which a chunk outside the gold becomes a gold span.
EXPAND_MIN_GRADE = 2


def grade_pool(pool: list[PoolEntry], questions: list[Question], snap: Snapshot, client: LLMClient) -> list[PoolEntry]:
    """`pool` with an LLM grade on every entry: only entries without one go to the judge (`pool` keeps old grades)."""
    by_q = {q.id: q for q in questions}
    chunks = {c.chunk_key: c for c in snap.chunks}
    out: list[PoolEntry] = []
    for e in pool:
        if e.llm_grade is not None:
            out.append(e)
            continue
        q, c = by_q.get(e.question_id), chunks.get(e.chunk_key)
        if q is None:
            raise FormatError(f"pool: question {e.question_id} not in the questions file")
        if c is None:
            raise FormatError(f"pool: chunk {e.chunk_key} not in snapshot {snap.snapshot_id}")
        reply = client.ask_json(pool_judge_prompt(q.question, q.question_en, c.text), POOL_JUDGE_SCHEMA,
                                system=SYSTEM_POOL_JUDGE, seed=JUDGE_SEED)
        grade = reply.get("grade")
        if not isinstance(grade, int) or isinstance(grade, bool) or not 0 <= grade <= 3:
            raise LLMError(f"{client.model}: grade {grade!r} for {e.question_id} {e.chunk_key} is not 0-3")
        out.append(e.model_copy(update={"llm_grade": grade, "llm_model": client.model, "llm_prompt_version": JUDGE_VERSION}))
    return out


def select_for_human(pool: list[PoolEntry], rate: float = ZERO_SAMPLE_RATE, seed: int = SAMPLE_SEED) -> list[PoolEntry]:
    """`pool` with `for_human` set: every LLM grade ≥ 1, and ceil(rate × zeros) zeros drawn with `seed`."""
    if any(e.llm_grade is None for e in pool):
        raise FormatError("pool has entries the LLM judge has not graded: run `judge grade` on the whole pool")
    def key(e: PoolEntry) -> tuple[str, str]:
        return e.question_id, e.chunk_key

    zeros = sorted((e for e in pool if e.llm_grade == 0), key=key)
    kept = {key(e) for e in zeros if e.for_human}
    want = math.ceil(rate * len(zeros))
    rest = [key(e) for e in zeros if key(e) not in kept]
    rng = random.Random(seed)
    if want > len(kept):
        kept |= set(rng.sample(rest, want - len(kept)))
    return [e.model_copy(update={"for_human": (e.llm_grade or 0) >= 1 or key(e) in kept}) for e in pool]


def expand_gold(questions: list[Question], labels: list[Label], snap: Snapshot) -> tuple[list[Question], int]:
    """Questions with a new gold span for each chunk the human graded ≥ 2 that overlaps none of its gold spans.

    The span is the chunk's body on the markdown, so it outlives the chunker; its grade is the human's."""
    chunks = {c.chunk_key: c for c in snap.chunks}
    human = [lab for lab in latest_pool_labels(labels, snap.snapshot_id).values() if (lab.grade or 0) >= EXPAND_MIN_GRADE]
    out: list[Question] = []
    added = 0
    for q in questions:
        spans = list(q.gold_evidence)
        if gradable(q):
            for lab in sorted((lab for lab in human if lab.question_id == q.id), key=lambda lab: lab.chunk_key or ""):
                c = chunks.get(lab.chunk_key or "")
                if c is None:
                    raise FormatError(f"{q.id}: labelled chunk {lab.chunk_key} not in snapshot {snap.snapshot_id}")
                if any(s.doc_key == c.doc_key and overlap(s, c) > 0 for s in spans):
                    continue
                doc, md = snap.document(c.doc_key), snap.markdown.get(c.doc_key)
                if doc is None or md is None:
                    raise FormatError(f"{q.id}: chunk {c.chunk_key}'s document {c.doc_key} is not in snapshot {snap.snapshot_id}")
                spans.append(GoldSpan(doc_key=c.doc_key, md_sha256=doc.md_sha256, char_start=c.char_start,
                                      char_end=c.char_end, quote=md[c.char_start : c.char_end], grade=lab.grade, source="pool"))
                added += 1
        out.append(q.model_copy(update={"gold_evidence": spans}) if len(spans) != len(q.gold_evidence) else q)
    return out, added
