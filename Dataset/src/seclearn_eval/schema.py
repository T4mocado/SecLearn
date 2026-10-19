"""Every record the eval set reads or writes. Commands go through these models, never raw dicts."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Record(BaseModel):
    """Unknown fields are an error: a typo in a hand-edited file must not pass silently."""

    model_config = ConfigDict(extra="forbid")


class Span(Record):
    """A half-open character range `[char_start, char_end)` in one document's snapshot markdown."""

    char_start: int = Field(ge=0)
    char_end: int = Field(gt=0)

    @model_validator(mode="after")
    def _ordered(self) -> Span:
        if self.char_end <= self.char_start:
            raise ValueError(f"char_end {self.char_end} must be after char_start {self.char_start}")
        return self


# --- Snapshot (written by the app's `npm run db:snapshot`) ---------------------------------------


class Chunker(Record):
    version: str
    CHUNK_SIZE: int
    CHUNK_OVERLAP: int


class ManifestDocument(Record):
    doc_key: str
    title: str
    source_file: str
    source_sha256: str | None
    md_path: str
    md_sha256: str
    chars: int
    chunks: int
    status: str
    license: str
    source_url: str | None
    retrieved: date
    db_id: str


class Manifest(Record):
    name: str
    snapshot_id: str
    version: str
    datePublished: date
    license: list[str]
    source_git_commit: str
    source_git_dirty: bool
    chunker: Chunker
    #: Offsets and `chars` count Unicode code points (Python string indices), not the app's UTF-16 units.
    offset_unit: Literal["codepoint"]
    chunks_path: str
    documents: list[ManifestDocument]
    canary: str


class Chunk(Span):
    """`chunk_key` = `doc_key#chunk_index`, stable across reindexes with the same chunker; `db_id` only to look back."""

    chunk_key: str
    doc_key: str
    chunk_index: int = Field(ge=0)
    text: str
    content_sha1: str
    db_id: str


# --- Sampling ------------------------------------------------------------------------------------

Level = Literal["L1", "L2", "L3", "L4", "L5", "L6", "L7"]
L6Kind = Literal["out_of_domain", "not_in_corpus", "false_premise"]
SplitName = Literal["dev", "test"]


ClusterId = Literal["arch", "supply", "inj", "auth", "browser", "framework", "ai", "transport", "authz", "api"]


class ClusterMap(Record):
    """The 10 topic clusters, and which cluster each document and each WSTG group belongs to. Reviewed by hand before planning."""

    #: Cluster id → human name.
    clusters: dict[ClusterId, str]
    #: Cheat sheet doc_key → cluster. WSTG is not listed here: it is split by test case group.
    documents: dict[str, ClusterId]
    #: WSTG group ("ATHN", "INPV", …) → cluster.
    wstg_groups: dict[str, ClusterId]
    #: Cluster of WSTG's front matter (chapters 1-3), Reporting chapter and kept appendices.
    wstg_front_matter: ClusterId


UnitKind = Literal["section", "wstg_case", "wstg_front", "wstg_back"]


class Unit(Span):
    """A sampling unit: a cheat sheet `##` section, a WSTG test case, or a part of WSTG outside the test cases. Unsampleable units are excluded regions."""

    unit_id: str
    doc_key: str
    kind: UnitKind
    title: str
    cluster: ClusterId | None
    #: Chunks overlapping the unit (L3 needs a unit of at least 2).
    chunks: int = Field(ge=0)
    #: Chunks whose body midpoint lies inside the unit: these add up to the document's chunk count, so they weigh units in the plan.
    weight_chunks: int = Field(ge=0)
    sampleable: bool
    exclude_reason: str | None = None


class PlanCell(Record):
    """How many kept questions one cell of the plan wants; `cluster` is None for L6(a) / L6(b), which belong to no corpus cluster."""

    split: SplitName
    cluster: str | None
    level: Level
    l6_kind: L6Kind | None = None
    target: int = Field(ge=0)


class PlanSlot(Record):
    """One question the gold set should keep: where to generate it from. L4 / L5 slots hold a pair of units of one cluster."""

    slot_id: str
    split: SplitName
    cluster: ClusterId | None
    level: Level
    l6_kind: L6Kind | None = None
    #: The document the slot's quota came from (WSTG test cases: "wstg-v4.2"); None for L6(a) / L6(b).
    doc_key: str | None
    unit_ids: list[str]


class SamplePlan(Record):
    snapshot_id: str
    seed: int
    #: Every number the plan was computed with, so it can be recomputed.
    params: dict[str, int | float | str | list[int]]
    cells: list[PlanCell]
    slots: list[PlanSlot]


# --- Questions -----------------------------------------------------------------------------------


class GoldSpan(Span):
    doc_key: str
    md_sha256: str
    quote: str
    #: Comparison questions: which cell of `compare_cells` the span supports.
    cell: int | None = None
    grade: int = Field(default=2, ge=0, le=3)
    #: L6(c): the span refutes the question's premise instead of answering it.
    refutes: bool = False


class Strata(Record):
    level: Level
    answerable: bool
    l6_kind: L6Kind | None = None
    question_style: Literal["accented", "unaccented", "mixed_vi_en"] | None = None
    gold_source: Literal["wstg", "cheat_sheet", "both"] | None = None


class Review(Record):
    status: Literal["pending", "accepted", "edited", "rejected"] = "pending"
    annotator: str | None = None
    guideline_version: str | None = None
    #: Seconds the annotator spent (Label Studio `lead_time`).
    lead_time: float | None = None
    annotated_at: datetime | None = None
    notes: str = ""


class Generation(Record):
    model: str
    prompt_version: str
    seed: int


class CompareCell(Record):
    item: str
    aspect: str


class Turn(Record):
    role: Literal["user", "assistant"]
    content: str


class Question(Record):
    id: str
    split: SplitName
    question: str
    question_en: str
    language: Literal["vi"] = "vi"
    turns: list[Turn] = []
    #: Cluster of the question; None for L6(a) / L6(b).
    cluster: str | None
    unit_ids: list[str] = []
    #: Variants (L2, L7, L6(c)) share the id of the question they were made from; a seed is never in two splits.
    seed_id: str
    strata: Strata
    type: str | None = None
    compare_cells: list[CompareCell] = []
    reference_answer: str | None
    reference_claims: list[str] = []
    gold_evidence: list[GoldSpan] = []
    review: Review = Review()
    generation: Generation


class QuestionFileHeader(Record):
    """First line of every question file, so the canary travels with the data."""

    canary: str
    eval_version: str
    snapshot_id: str


# --- Labels, pools, qrels, runs ------------------------------------------------------------------


class Label(Record):
    """One judgement: a question review, or a 0-3 grade of one pooled chunk."""

    question_id: str
    task: Literal["review", "pool"]
    chunk_key: str | None = None
    grade: int | None = Field(default=None, ge=0, le=3)
    annotator: str
    annotated_at: datetime
    lead_time: float | None = None
    guideline_version: str
    snapshot_id: str


class PoolEntry(Record):
    question_id: str
    chunk_key: str
    systems: list[str]
    covers_gold: bool
    llm_grade: int | None = Field(default=None, ge=0, le=3)


class QrelLine(Record):
    """TREC qrels: `qid 0 chunk_key grade`."""

    qid: str
    chunk_key: str
    grade: int = Field(ge=0)


class RunLine(Record):
    """TREC run: `qid Q0 chunk_key rank score tag`."""

    qid: str
    chunk_key: str
    rank: int = Field(ge=1)
    score: float
    tag: str


class RunConfig(Record):
    run_id: str
    snapshot_id: str
    chunker_version: str
    eval_version: str
    git_commit: str
    git_dirty: bool
    created_at: datetime
    params: dict[str, str | int | float | bool | None]


# --- Generation and filtering --------------------------------------------------------------------


class ModelRef(Record):
    provider: Literal["claude", "gemini"]
    #: Pinned model id, never an alias that moves.
    model: str

    @model_validator(mode="after")
    def _not_deepseek(self) -> ModelRef:
        if "deepseek" in self.model.lower():
            raise ValueError("DeepSeek (the app's chat LLM) must not be used anywhere in the eval set")
        return self


class LLMConfig(Record):
    """Models and thresholds for `generate` / `filter`. Holds no key: keys are read from the environment."""

    #: Writes the candidates (Claude).
    generator: ModelRef
    #: Answers from evidence and re-levels (Gemini).
    judge: ModelRef
    #: Embeds `question_en` for semantic dedup.
    embedder: ModelRef
    oversample: float = Field(default=1.6, ge=1)
    #: Two questions of one cluster whose embeddings have at least this cosine are duplicates.
    dedup_cosine: float = Field(default=0.9, gt=0, le=1)
    #: An L2 question with at least this share of its content words in its evidence is too close to the document's wording.
    l2_max_overlap: float = Field(default=0.6, gt=0, le=1)


class Quote(Record):
    doc_key: str
    quote: str


class Candidate(Record):
    """A generated question before filtering and review. `level` is the level asked for, or the judge's relabel."""

    candidate_id: str
    slot_id: str
    split: SplitName
    cluster: ClusterId | None
    level: Level
    l6_kind: L6Kind | None = None
    unit_ids: list[str]
    question: str
    question_en: str
    reference_answer: str | None
    reference_claims: list[str] = []
    quotes: list[Quote] = []
    generation: Generation
    #: Set by `filter` when the judge moved the candidate to another level.
    relabelled_from: Level | None = None


class Rejection(Record):
    candidate_id: str
    step: str
    reason: str
    detail: str = ""


class FilterStep(Record):
    step: str
    n_in: int
    n_rejected: int
    n_relabelled: int = 0
    #: Reason → candidates rejected for it.
    reasons: dict[str, int]


class FilterReport(Record):
    steps: list[FilterStep]
    n_kept: int
    rejected: list[Rejection]
