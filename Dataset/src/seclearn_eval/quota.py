"""The plan's quotas on kept questions (spec user stories 23-25): which cells are short, and how many each still needs.

A cell is (split, cluster, level, L6 kind), as `check` counts it. Top-up steps count a question as kept until the
review rejects it, so they can run on filtered questions before the review and again after it; the cut and the split
files take reviewed questions only.
"""

from __future__ import annotations

import hashlib
import math
from collections import Counter
from pathlib import Path

from .filter import content_words
from .generate import DEFAULT_CAP
from .io import write_questions
from .plan import L3_MIN_CHUNKS
from .schema import GenerationReport, PlanCell, PlanSlot, Question, QuestionFileHeader, SamplePlan, Unit

Cell = tuple[str, str | None, str, str | None]


def cell_of(q: Question) -> Cell:
    return q.split, q.cluster, q.strata.level, q.strata.l6_kind


def plan_cell(c: PlanCell) -> Cell:
    return c.split, c.cluster, c.level, c.l6_kind


def kept(q: Question) -> bool:
    return q.review.status != "rejected"


def reviewed(q: Question) -> bool:
    """Accepted or edited by the annotator: what a variant may be made from."""
    return q.review.status in ("accepted", "edited")


def kept_counts(questions: list[Question]) -> Counter[Cell]:
    return Counter(cell_of(q) for q in questions if kept(q))


def short_cells(plan: SamplePlan, questions: list[Question], wanted: set[tuple[str, str | None]]) -> list[tuple[PlanCell, int]]:
    """Plan cells of the (level, L6 kind) pairs in `wanted` with fewer kept questions than their target, and how many
    they hold, in the plan's order."""
    counts = kept_counts(questions)
    out = []
    for c in plan.cells:
        if (c.level, c.l6_kind) in wanted and counts[plan_cell(c)] < c.target:
            out.append((c, counts[plan_cell(c)]))
    return out


def to_make(target: int, held: int, oversample: float) -> int:
    """Questions to write for a cell holding `held` of `target`: the missing ones, oversampled like `generate`."""
    return math.ceil(oversample * (target - held) - 1e-9) if held < target else 0


def seeded_order(seed: int, salt: str, key: str) -> str:
    """A sort key that orders items by a hash of the plan's seed: the same seed gives the same order, in any process."""
    return hashlib.sha256(f"{seed}:{salt}:{key}".encode()).hexdigest()


def seeded_int(seed: int, salt: str, key: str) -> int:
    """A 32-bit number drawn from the same hash: a request seed that differs by salt and key."""
    return int(seeded_order(seed, salt, key)[:8], 16)


# --- Top-up of root cells ----------------------------------------------------------------------------

#: Root cells: written from the corpus by `generate`; a short one gets new slots (variants and L6(b) have their own steps).
ROOT_CELLS = {("L1", None), ("L3", None), ("L4", None), ("L5", None), ("L6", "out_of_domain")}
#: Seeds of round r are the plan's seed + r × ROUND_SEED, far from the + 1, + 2… of `generate`'s retries.
ROUND_SEED = 1000


def refused_units(reports: list[GenerationReport]) -> set[str]:
    """Units the generator refused in earlier runs: a refused slot's units and every substitute tried for it, and the
    unit a substituted slot swapped out."""
    out: set[str] = set()
    for r in reports:
        for slot in r.refused:
            out.update(slot.unit_ids)
            out.update(uid for option in slot.tried_unit_ids for uid in option)
        for sub in r.substituted:
            out.update(uid for uid in sub.from_unit_ids if uid not in sub.to_unit_ids)
    return out


def _vectors(texts: dict[str, str]) -> dict[str, dict[str, float]]:
    """Unit-length idf-weighted vectors of each text's content words, idf over these texts only. A unit's first line
    is its heading (`## WSTG-SESS-02 Testing for …`), shared boilerplate between WSTG cases: left out."""
    bags = {uid: content_words(t.split("\n", 1)[1] if t.startswith("#") and "\n" in t else t) for uid, t in texts.items()}
    df = Counter(w for bag in bags.values() for w in bag)
    out = {}
    for uid, bag in bags.items():
        v = {w: math.log(1 + len(bags) / df[w]) for w in bag}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        out[uid] = {w: x / norm for w, x in v.items()}
    return out


def _similarity(a: dict[str, float], b: dict[str, float]) -> float:
    return sum(x * b.get(w, 0.0) for w, x in a.items())


def is_variant(q: Question) -> bool:
    """L2, L7 and L6(c) carry their seed's `seed_id` (and units); a root question is its own seed."""
    return q.seed_id != q.id


def doc_load(questions: list[Question], units: list[Unit]) -> Counter[tuple[str, str, str | None]]:
    """Kept root questions per (split, document of the first unit, cluster), the way the plan's cap counts slots.
    Variants share their seed's units and do not count again."""
    by_id = {u.unit_id: u for u in units}
    return Counter(
        (q.split, by_id[q.unit_ids[0]].doc_key, q.cluster)
        for q in questions
        if kept(q) and not is_variant(q) and q.unit_ids and q.unit_ids[0] in by_id
    )


def topup_plan(
    plan: SamplePlan, questions: list[Question], units: list[Unit], *, round: int, banned: set[str] | None = None,
    texts: dict[str, str] | None = None,
) -> tuple[SamplePlan, dict[Cell, int]]:
    """New slots for the root cells short of their target, one per missing question, for `generate` to write (it
    oversamples them like the plan's) with `prefer_other_doc`; and the questions of each cell no slot could be found for.

    Units are those of the cell's cluster that no run refused (`banned`), under the level rule (L3: >= 2 chunks) and
    the per-document cap counted on kept root questions (`doc_load`); the least used first. An L4 / L5 slot pairs the
    two units of the cluster whose text is most alike (idf-weighted cosine on `texts`, unit id → text; titles when not
    given): unrelated units made forced comparisons the judge could not answer (ticket 05, 2026-10-22). A cell never
    gets the same unit (or pair) twice in a round: same prompt, same seed, so the cache would hand back the same
    questions. Slot ids are `<split>-r<round>-NNNNN`, and each round has its own seed, so a unit asked in an earlier
    run is a new request."""
    banned = banned or set()
    cap = int(plan.params.get("cap", DEFAULT_CAP))
    by_id = {u.unit_id: u for u in units}
    texts = texts or {}
    roots = [q for q in questions if kept(q) and not is_variant(q)]
    uses = Counter(uid for q in roots for uid in q.unit_ids)
    load = doc_load(questions, units)
    seed = plan.seed + round * ROUND_SEED
    slots: list[PlanSlot] = []
    unplaced: dict[Cell, int] = {}
    numbers: Counter[str] = Counter()

    def add(c: PlanCell, unit_ids: list[str]) -> None:
        numbers[c.split] += 1
        doc = by_id[unit_ids[0]].doc_key if unit_ids else None
        slots.append(PlanSlot(slot_id=f"{c.split}-r{round}-{numbers[c.split]:05d}", split=c.split, cluster=c.cluster,  # type: ignore[arg-type]
                              level=c.level, l6_kind=c.l6_kind, doc_key=doc, unit_ids=unit_ids))
        uses.update(unit_ids)
        if doc is not None:
            load[(c.split, doc, c.cluster)] += 1

    for c, held in short_cells(plan, questions, ROOT_CELLS):
        missing = c.target - held
        if c.level == "L6":
            for _ in range(missing):
                add(c, [])
            continue
        salt = f"{c.split}-{c.cluster}-{c.level}"
        members = [
            u for u in sorted(units, key=lambda u: u.unit_id)
            if u.sampleable and u.cluster == c.cluster and u.unit_id not in banned and (c.level != "L3" or u.chunks >= L3_MIN_CHUNKS)
        ]

        def room(u: Unit, c: PlanCell = c) -> bool:
            return load[(c.split, u.doc_key, c.cluster)] < cap

        placed = 0
        if c.level in ("L1", "L3"):
            left = list(members)
            while placed < missing and (fits := [u for u in left if room(u)]):
                best = min(fits, key=lambda u, salt=salt: (uses[u.unit_id], seeded_order(seed, salt, u.unit_id)))
                left.remove(best)
                add(c, [best.unit_id])
                placed += 1
        else:
            partners = [u for u in members if u.weight_chunks > 0]
            vec = _vectors({u.unit_id: texts.get(u.unit_id, u.title) for u in partners})
            left_pairs = [(a, b, _similarity(vec[a.unit_id], vec[b.unit_id])) for i, a in enumerate(partners) for b in partners[i + 1 :]]
            while placed < missing and (fits := [p for p in left_pairs if room(p[0])]):
                pair = min(fits, key=lambda p, salt=salt: (-p[2], uses[p[0].unit_id] + uses[p[1].unit_id],
                                                           seeded_order(seed, salt, p[0].unit_id + "|" + p[1].unit_id)))
                left_pairs.remove(pair)
                add(c, [pair[0].unit_id, pair[1].unit_id])
                placed += 1
        if placed < missing:
            unplaced[plan_cell(c)] = missing - placed
    return SamplePlan(snapshot_id=plan.snapshot_id, seed=seed, params=plan.params, cells=[], slots=slots), unplaced


# --- Cut and split -----------------------------------------------------------------------------------


def cut_to_plan(questions: list[Question], plan: SamplePlan) -> tuple[list[Question], list[Question]]:
    """(kept, cut) among the reviewed questions (accepted or edited, spec user story 23): a cell over its target keeps
    `target` of them in an order fixed by the plan's seed, never by hand (user story 24). Variant cells are cut first;
    then the seeds of the variants still kept come first in their own cells, so a kept variant keeps the question it is
    compared with whenever the cell has room for it. Both lists keep the input order."""
    live = [q for q in questions if reviewed(q)]
    targets = {plan_cell(c): c.target for c in plan.cells}
    cut: set[str] = set()

    def cut_cells(qs: list[Question], first: set[str]) -> None:
        by_cell: dict[Cell, list[Question]] = {}
        for q in qs:
            by_cell.setdefault(cell_of(q), []).append(q)
        for key, members in by_cell.items():
            ranked = sorted(members, key=lambda q: (q.id not in first, seeded_order(plan.seed, "cut", q.id)))
            cut.update(q.id for q in ranked[targets.get(key, len(ranked)) :])

    cut_cells([q for q in live if is_variant(q)], set())
    cut_cells([q for q in live if not is_variant(q)], {q.seed_id for q in live if is_variant(q) and q.id not in cut})
    return [q for q in live if q.id not in cut], [q for q in live if q.id in cut]


def split_files(questions: list[Question], plan: SamplePlan, header: QuestionFileHeader, out_dir: Path) -> tuple[list[Question], list[Question]]:
    """The gold files, `<out_dir>/test.jsonl` and `dev.jsonl`: reviewed questions only, after the cut. A seed (a
    question and its variants) lives in one split; a seed found in both is an error to fix upstream, not here.
    Returns (kept, cut)."""
    splits: dict[str, set[str]] = {}
    for q in questions:
        if reviewed(q):
            splits.setdefault(q.seed_id, set()).add(q.split)
    if mixed := sorted(s for s, v in splits.items() if len(v) > 1):
        raise ValueError(f"seed(s) in both dev and test: {', '.join(mixed)}")
    kept_qs, cut = cut_to_plan(questions, plan)
    for split in ("test", "dev"):
        write_questions(out_dir / f"{split}.jsonl", header, [q for q in kept_qs if q.split == split])
    return kept_qs, cut
