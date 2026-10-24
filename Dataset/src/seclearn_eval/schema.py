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
    #: "pool": added by `judge expand` from a chunk the annotator graded 2-3 outside the gold (the span is the chunk's body).
    source: Literal["review", "pool"] = "review"


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
    #: The annotator's verdict on the question alone, given before reading the sources.
    question_check: Literal["ok", "ambiguous", "needs_context", "opinion"] | None = None
    #: The question as generated, when the annotator rewrote it (`question` then holds the rewrite; `question_en` does not follow).
    original_question: str | None = None


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


class KeywordHit(Record):
    """One English keyword of an L6(b) question, searched for in every document of the snapshot (whole words, any case)."""

    keyword: str
    n_hits: int = Field(ge=0)
    #: Documents with hits, most hits first (at most `absence.KEYWORD_DOCS`).
    doc_keys: list[str] = []


class RetrievedChunk(Record):
    system: str
    rank: int = Field(ge=1)
    chunk_key: str
    score: float


class AbsenceEvidence(Record):
    """Why an L6(b) question is thought to have no answer in the corpus, for the reviewer to confirm (spec user story 31)."""

    keywords: list[KeywordHit]
    #: Top `absence.ABSENCE_DEPTH` chunks of each of two retrievers on the snapshot.
    retrieved: list[RetrievedChunk]


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
    #: L6(b) only: keyword grep and retrieval results showing the corpus does not answer it.
    absence_evidence: AbsenceEvidence | None = None
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
    """One pooled (question, chunk): which systems ranked it in their top-k, and the LLM judge's grade once `judge grade` ran."""

    question_id: str
    chunk_key: str
    systems: list[str]
    covers_gold: bool
    llm_grade: int | None = Field(default=None, ge=0, le=3)
    #: Chunk keys mean something only for one chunker: labels on this pool apply to qrels of this version alone.
    chunker_version: str | None = None
    #: Model and prompt version behind `llm_grade`.
    llm_model: str | None = None
    llm_prompt_version: str | None = None
    #: Picked for the human (`judge grade`): every LLM grade ≥ 1, plus the fixed-seed sample of LLM zeros.
    for_human: bool = False


class FalseNegatives(Record):
    """Gemini's misses, estimated from the fixed-seed sample of its zeros that the human graded."""

    #: Pool chunks Gemini graded 0.
    n_llm_zero: int
    #: Of those, sampled and graded by the human.
    n_sampled: int
    #: Sampled zeros the human graded ≥ 2.
    n_missed: int
    rate: float | None
    ci_low: float | None
    ci_high: float | None
    #: rate × n_llm_zero: relevant chunks the pool's qrels likely miss.
    est_missed: float | None


class Stability(Record):
    """Intra-annotator agreement: the latest grade of a chunk graded twice and the first one under the same guideline
    version, at least `min_days` apart."""

    min_days: int
    n_pairs: int
    #: Chunks graded twice but sooner than `min_days`: left out.
    n_too_close: int
    #: Chunks graded twice, but never twice under the guideline version of their latest grade: left out.
    n_version_mismatch: int = 0
    min_gap_days: float | None
    exact: float | None
    kappa_linear: float | None
    kappa_quadratic: float | None


class AgreementReport(Record):
    """Gemini × human on the pool chunks the human graded (spec user story 56), and stability (user story 50)."""

    judge_models: list[str]
    prompt_versions: list[str]
    n_judged: int
    exact: float | None
    #: Human grade → share of those chunks Gemini graded the same.
    per_level: dict[str, float]
    kappa_linear: float | None
    kappa_quadratic: float | None
    #: Quadratic κ with each sampled Gemini zero weighted n_llm_zero / n_sampled, as if the whole pool were graded.
    kappa_quadratic_pool_weighted: float | None
    #: Rows Gemini 0-3, columns human 0-3.
    confusion: list[list[int]]
    #: Rows / columns [not relevant (< 2), relevant (≥ 2)].
    confusion_binary: list[list[int]]
    false_negatives: FalseNegatives
    stability: Stability


class QrelLine(Record):
    """TREC qrels: `qid 0 chunk_key grade`."""

    qid: str
    chunk_key: str
    grade: int = Field(ge=0)


class InputFile(Record):
    path: str
    sha256: str


class QrelsMeta(Record):
    """`<qrels>.meta.json`: what a qrels file was generated from, and its own hash, so a hand edit is caught."""

    generated_by: str
    snapshot_id: str
    chunker_version: str
    #: "questions", "pool", "labels" → the file read and its sha256.
    inputs: dict[str, InputFile]
    qrels_sha256: str
    n_questions: int
    n_lines: int
    #: Lines whose grade came from a human pool label.
    n_from_labels: int


class RunLine(Record):
    """TREC run: `qid Q0 chunk_key rank score tag`."""

    qid: str
    chunk_key: str
    rank: int = Field(ge=1)
    score: float
    tag: str


#: K: answers of the measured system to each question in one run (spec, "Chấm điểm").
ANSWER_RUNS = 3


class AnswerLine(Record):
    """One answer of the measured system to one question, in `runs/<run_id>/answers.jsonl` (K = `ANSWER_RUNS` per question).

    Defined now, filled when the SecLearn runner exists. `refused` comes from the system; the graded fields are
    filled by the judge / annotator afterwards and stay None until then.
    """

    qid: str
    #: Which of the K runs (0, 1, 2).
    k: int = Field(ge=0)
    answer: str
    refused: bool
    cited_chunks: list[str] = []
    #: Answer correctness 0-2 against the reference answer.
    correctness: int | None = Field(default=None, ge=0, le=2)
    #: Every claim supported by the retrieved sources.
    faithful: bool | None = None
    #: Every citation points to a chunk that supports the cited claim.
    citations_correct: bool | None = None


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


class EncoderRef(Record):
    """A sentence-embedding model from the Hugging Face hub, pinned by id (and by commit, once `revision` is set)."""

    model: str
    revision: str | None = None
    #: "pyvi": Vietnamese word segmentation of every text before encoding, as the app's embed server does for BKAI.
    segment: Literal["pyvi"] | None = None
    max_seq_length: int = Field(default=512, gt=0)


class RerankerRef(Record):
    model: str
    revision: str | None = None
    max_length: int = Field(default=512, gt=0)
    #: Candidates of the base system the cross-encoder reorders (the app's RAG_CANDIDATES).
    candidates: int = Field(default=20, gt=0)


class PoolConfig(Record):
    """`pool-config.json`: the five pooling systems' models (spec user story 52) and the pool depth."""

    #: Each system's top-k that enters the pool.
    depth: int = Field(default=10, gt=0)
    #: The app's Vietnamese embedding model (its EMBED_MODEL), with the app's preprocessing.
    vi_embedder: EncoderRef
    #: The app's cross-encoder (its RERANK_MODEL), over `vi_embedder`'s candidates.
    reranker: RerankerRef
    #: bge-m3, dense vectors, run on the Vietnamese question and on question_en.
    multilingual: EncoderRef


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


class GenerationCell(Record):
    """What `generate` asked for and got in one cell of the plan; `shortfall` > 0 when the model kept replying short."""

    split: SplitName
    cluster: ClusterId | None
    level: Level
    l6_kind: L6Kind | None = None
    wanted: int = Field(ge=0)
    got: int = Field(ge=0)
    #: wanted − got, after every top-up call.
    shortfall: int = Field(ge=0)
    calls: int = Field(ge=0)
    #: Slots still short after the model refused them and every substitute unit; their missing questions are part of the shortfall.
    refused: int = Field(default=0, ge=0)
    #: Slots written (in part) from substitute units after a refusal.
    substituted: int = Field(default=0, ge=0)


class RefusedSlot(Record):
    """A slot the model declined, on its own units and on every substitute tried: to review or re-plan."""

    slot_id: str
    level: Level
    l6_kind: L6Kind | None = None
    unit_ids: list[str]
    #: Substitute unit lists asked after the refusal, in order; all refused too.
    tried_unit_ids: list[list[str]] = []


class SubstitutedSlot(Record):
    """A slot the model refused on its plan units and that was written from other units of its cluster instead."""

    slot_id: str
    level: Level
    from_unit_ids: list[str]
    to_unit_ids: list[str]


class GenerationReport(Record):
    cells: list[GenerationCell]
    n_candidates: int
    #: Candidates missing over all cells.
    n_shortfall: int
    n_refused: int = 0
    refused: list[RefusedSlot] = []
    n_substituted: int = 0
    substituted: list[SubstitutedSlot] = []


class Rejection(Record):
    candidate_id: str
    step: str
    reason: str
    detail: str = ""


class TopUpCell(Record):
    """One plan cell a top-up step (`variants`, `l6b`, `topup`) wrote for: questions kept before it, and how many it made."""

    split: SplitName
    cluster: ClusterId | None
    level: Level
    l6_kind: L6Kind | None = None
    target: int = Field(ge=0)
    #: Questions of the cell already in the input files and not rejected.
    kept: int = Field(ge=0)
    #: ceil(oversample × (target − kept)), as many as the cell's seeds allow.
    wanted: int = Field(ge=0)
    made: int = Field(ge=0)
    calls: int = Field(ge=0)
    #: Calls the model refused (each ends the asking for that cell, or for that seed of a variant cell).
    refused: int = Field(default=0, ge=0)


class TopUpReport(Record):
    cells: list[TopUpCell]
    n_made: int
    #: Variants dropped by their own checks (no refuting quote, too close to the evidence, refers to the document…).
    rejected: list[Rejection] = []


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


# --- Scores (written by `score`, read by `report`) -----------------------------------------------


class Estimate(Record):
    """A mean with its cluster-adjusted standard error and a 95% interval (Wilson on small 0/1 strata, else normal)."""

    n: int
    #: Error groups behind the SE: documents or WSTG test cases (variants gathered by `seed_id`).
    n_groups: int
    mean: float
    se: float
    ci_low: float
    ci_high: float
    method: Literal["normal", "wilson"]


ScopeName = Literal["micro", "macro", "poststrat", "cluster", "level"]


class Stratum(Record):
    """One row of the report: a scope (and its key, for a cluster or a level) with an estimate per metric."""

    scope: ScopeName
    key: str | None = None
    estimates: dict[str, Estimate]


class Comparison(Record):
    """Run minus baseline on the same questions: paired difference, its cluster-adjusted SE and randomization p-values."""

    metric: str
    scope: ScopeName
    key: str | None = None
    diff: Estimate
    #: Randomization test flipping whole error groups (exact when there are few groups).
    p_value: float
    #: ranx's Fisher randomization test, flipping single questions (micro only): ignores the error groups.
    p_value_per_question: float | None = None


class ClusterDifference(Record):
    """One topic cluster minus another on one metric of one run (spec user story 65): z test on their clustered SEs."""

    metric: str
    cluster_a: str
    cluster_b: str
    diff: Estimate
    p_value: float
    #: Holm-adjusted over every pair of clusters on this metric: conclude a difference only when it is under 0.05.
    p_adjusted: float


class SeSensitivity(Record):
    """The clustered SE of one scope recomputed under a more cautious grouping (ticket 13), next to the main one.

    `pair_merged`: an L4 / L5 question joins the groups of both its documents (union-find), never across topic clusters.
    `topic_cluster`: every topic cluster is one group; micro only, since per cluster or for macro it leaves one group.
    The main numbers and intervals keep the main grouping (first unit); this only says how much the SE could move.
    """

    grouping: Literal["pair_merged", "topic_cluster"]
    scope: ScopeName
    key: str | None = None
    n_groups: int
    n_groups_main: int
    #: Metric → SE under this grouping.
    se: dict[str, float]
    #: Metric → SE under this grouping / main SE; None when the main SE is 0.
    ratio: dict[str, float | None]


class Refusals(Record):
    """L6, kept apart from every answerable score: correct refusals on L6, false refusals on answerable questions."""

    l6_questions: int
    answerable_questions: int
    #: False until a run has answers.jsonl.
    measured: bool
    #: L6 overall ("all") and by kind.
    correct_refusal: dict[str, Estimate] = {}
    false_refusal: Estimate | None = None


class ScoreReport(Record):
    run_id: str
    baseline_id: str | None = None
    questions_file: str
    qrels_file: str
    #: Grade from which a chunk counts as relevant for the binary metrics (nDCG uses the grades themselves).
    min_grade: int
    metrics: list[str]
    #: Topic cluster weights used for the post-stratified score (share of the corpus' sampleable chunks).
    poststrat_weights: dict[str, float] = {}
    strata: list[Stratum]
    #: The SEs of the strata above under the sensitivity groupings (micro, macro, cluster, level).
    se_sensitivity: list[SeSensitivity] = []
    comparisons: list[Comparison] = []
    #: Every pair of topic clusters, every metric.
    cluster_differences: list[ClusterDifference] = []
    refusals: Refusals
