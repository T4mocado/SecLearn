"""`l6b`: L6(b) questions, on security but not answered by the corpus, each with the evidence that it is not
(spec user story 31): the English keywords the model gave, searched for as whole words in every document of the
snapshot, and the top ABSENCE_DEPTH chunks of two retrievers. The reviewer reads both before accepting the question;
a keyword with hits or a retrieved chunk that answers it means the question is answerable, not L6(b).

Only the split cells short of their target are written, ceil(oversample × missing) each, asked in batches like
`generate`'s L6(a); a refused call ends the cell and is counted in the report, and a question pointing at "this
document" is dropped as `filter` would. Every call's seed is a hash of the plan's seed, the split, the round and the call, so the two
splits (same prompt) and later rounds are separate requests to the cache.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Sequence

from .filter import refers_to_document
from .generate import MAX_TOP_UPS, OOD_BATCH
from .llm import LLMClient, ModelRefusal
from .prompts import L6B_SCHEMA, SYSTEM_GENERATE, not_in_corpus_prompt
from .quota import seeded_int, short_cells, to_make
from .retrieval import Retriever
from .schema import (
    AbsenceEvidence,
    Generation,
    KeywordHit,
    Question,
    Rejection,
    RetrievedChunk,
    Review,
    SamplePlan,
    Strata,
    TopUpCell,
    TopUpReport,
)
from .snapshot import Snapshot

#: Chunks of each retriever shown to the reviewer.
ABSENCE_DEPTH = 20
#: Documents listed per keyword.
KEYWORD_DOCS = 5


def grep(snap: Snapshot, keyword: str) -> KeywordHit:
    pattern = re.compile(rf"(?<!\w){re.escape(keyword.strip())}(?!\w)", re.IGNORECASE)
    per_doc = Counter({doc: n for doc, md in snap.markdown.items() if (n := len(pattern.findall(md)))})
    docs = [d for d, _ in sorted(per_doc.items(), key=lambda kv: (-kv[1], kv[0]))][:KEYWORD_DOCS]
    return KeywordHit(keyword=keyword.strip(), n_hits=sum(per_doc.values()), doc_keys=docs)


def not_in_corpus(
    questions: list[Question], plan: SamplePlan, snap: Snapshot, client: LLMClient, retrievers: Sequence[Retriever],
    *, oversample: float, round: int = 1,
) -> tuple[list[Question], TopUpReport]:
    """New L6(b) questions for the short cells; `questions` are the question files so far (they count towards the cells)."""
    taken = {q.id for q in questions}
    titles = sorted(d.title for d in snap.manifest.documents)
    out: list[Question] = []
    cells: list[TopUpCell] = []
    rejected: list[Rejection] = []
    for c, held in short_cells(plan, questions, {("L6", "not_in_corpus")}):
        want = to_make(c.target, held, oversample)
        made: list[Question] = []
        calls = short_calls = refused = 0
        while len(made) < want and short_calls <= MAX_TOP_UPS:
            n = min(OOD_BATCH, want - len(made))
            version, prompt = not_in_corpus_prompt(n, titles)
            seed = seeded_int(plan.seed, f"l6b-{c.split}-r{round}", str(calls))
            calls += 1
            try:
                reply = client.ask_json(prompt, L6B_SCHEMA, system=SYSTEM_GENERATE, seed=seed)
            except ModelRefusal:
                refused += 1
                break
            before = len(made)
            for item in (reply.get("items") or [])[:n]:
                try:
                    text, text_en = str(item["question"]).strip(), str(item["question_en"]).strip()
                    keywords = [str(k) for k in item.get("keywords") or [] if str(k).strip()]
                except (KeyError, TypeError):
                    continue
                qid = _next_id(c.split, round, taken)
                taken.add(qid)
                if hit := refers_to_document(text, text_en):
                    rejected.append(Rejection(candidate_id=qid, step="l6b", reason="refers_to_document", detail=hit))
                    continue
                made.append(
                    Question(
                        id=qid, split=c.split, question=text, question_en=text_en, cluster=None, seed_id=qid,
                        strata=Strata(level="L6", answerable=False, l6_kind="not_in_corpus"), reference_answer=None,
                        absence_evidence=AbsenceEvidence(keywords=[grep(snap, k) for k in keywords], retrieved=[]),
                        review=Review(), generation=Generation(model=client.model, prompt_version=version, seed=seed),
                    )
                )
            short_calls += len(made) - before < n
        out += made
        cells.append(TopUpCell(split=c.split, cluster=c.cluster, level=c.level, l6_kind=c.l6_kind, target=c.target,
                               kept=held, wanted=want, made=len(made), calls=calls, refused=refused))
    return _with_retrieved(out, snap, retrievers), TopUpReport(cells=cells, n_made=len(out), rejected=rejected)


def _next_id(split: str, round: int, taken: set[str]) -> str:
    n = 1
    while f"{split}-l6b-r{round}-{n:03d}" in taken:
        n += 1
    return f"{split}-l6b-r{round}-{n:03d}"


def _with_retrieved(questions: list[Question], snap: Snapshot, retrievers: Sequence[Retriever]) -> list[Question]:
    found: dict[str, list[RetrievedChunk]] = {q.id: [] for q in questions}
    for r in retrievers:
        for qid, ranked in r.retrieve(questions, snap.chunks, ABSENCE_DEPTH).items():
            found[qid] += [RetrievedChunk(system=r.name, rank=i, chunk_key=k, score=s) for i, (k, s) in enumerate(ranked, start=1)]
    return [
        q.model_copy(update={"absence_evidence": q.absence_evidence.model_copy(update={"retrieved": found[q.id]})})  # type: ignore[union-attr]
        for q in questions
    ]
