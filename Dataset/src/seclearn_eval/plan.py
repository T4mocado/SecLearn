"""The sample plan, method R (ADR 0003; spec user stories 19-22, 25): how many kept questions each
cluster, document, unit and level gets, as slots a generator fills.

- Clusters get √(chunks of the cluster); on the test split none gets fewer than the floor (100), the rest
  is shared by √ among the clusters above it.
- In a cluster, each cheat sheet gets √(its chunks) and the cluster's part of WSTG counts as ONE document;
  that part is then shared by √(chunks) among its test cases (and front / back matter units). A cheat sheet's
  share goes to its sections in proportion to their chunks. Documents (a cluster's WSTG part included) and WSTG units are capped.
- Levels L1-L5, L7 are equal; the cluster × level table is rounded to match both margins. L3 goes to units of
  at least 2 chunks, L4 / L5 get a second unit of the same cluster. L6: (a) out of domain and (b) not in the
  corpus belong to no cluster; (c) false premise follows the clusters, from an L1 slot's unit.
Every tie is broken by a seeded RNG: the same inputs and seed give the same plan.
"""

from __future__ import annotations

import math
import random
from collections import Counter, defaultdict
from collections.abc import Hashable
from dataclasses import asdict, dataclass, field
from typing import TypeVar

from .clusters import WSTG_KEY
from .schema import ClusterId, Level, PlanCell, PlanSlot, SamplePlan, SplitName, Unit

K = TypeVar("K", bound=Hashable)

ANSWERABLE_LEVELS: tuple[Level, ...] = ("L1", "L2", "L3", "L4", "L5", "L7")
L6_KINDS = ("out_of_domain", "not_in_corpus", "false_premise")


class PlanError(Exception):
    """The plan cannot be met (caps too tight, too few units for a level)."""


@dataclass
class PlanParams:
    seed: int = 20261018
    test_answerable: int = 1100
    #: Answerable questions per cluster on the test split, at least.
    test_floor: int = 100
    #: L6 (a, b, c) on test: 50 out of domain, 100 not in the corpus, 50 false premise.
    test_l6: list[int] = field(default_factory=lambda: [50, 100, 50])
    dev_answerable: int = 150
    #: L6 on dev, 25 at 1 : 2 : 1.
    dev_l6: list[int] = field(default_factory=lambda: [6, 13, 6])
    #: At most this many questions from one document (a cluster's WSTG part counts as one) or one WSTG unit, per split.
    cap: int = 20


# --- Allocation -----------------------------------------------------------------------------------


def largest_remainder(weights: dict[K, float], total: int, rng: random.Random) -> dict[K, int]:
    """`total` split in proportion to `weights`: floors first, then one more to the largest remainders (ties: seeded order)."""
    out = {k: 0 for k in weights}
    mass = sum(weights.values())
    if total <= 0 or mass <= 0:
        return out
    shares = {k: total * w / mass for k, w in weights.items()}
    for k, s in shares.items():
        out[k] = math.floor(s + 1e-9)
    # Sorted before the shuffle: dict order can come from a set, whose order changes with PYTHONHASHSEED.
    keys = sorted(weights, key=str)
    rng.shuffle(keys)
    keys.sort(key=lambda k: -(shares[k] - out[k]))
    for k in keys[: total - sum(out.values())]:
        out[k] += 1
    return out


def capped_shares(weights: dict[K, float], total: float, caps: dict[K, float]) -> dict[K, float]:
    """Real shares in proportion to `weights`, none above its cap; what a capped key cannot take goes to the others."""
    fixed: dict[K, float] = {}
    while True:
        free = {k: w for k, w in weights.items() if k not in fixed and w > 0}
        left = total - sum(fixed.values())
        mass = sum(free.values())
        if not free or mass <= 0:
            if left > 1e-9:
                raise PlanError(f"caps leave {left:.1f} questions with nowhere to go")
            return {k: fixed.get(k, 0.0) for k in weights}
        shares = {k: left * w / mass for k, w in free.items()}
        over = {k for k, s in shares.items() if s > caps.get(k, math.inf) + 1e-9}
        if not over:
            return {k: fixed.get(k, shares.get(k, 0.0)) for k in weights}
        for k in over:
            fixed[k] = caps[k]


def floored_quotas(weights: dict[K, float], total: int, floor: int, rng: random.Random) -> dict[K, int]:
    """Integer quotas ∝ weights, none below `floor`: a key under it is raised to it and the rest is shared again."""
    if floor * len(weights) > total:
        raise PlanError(f"floor {floor} × {len(weights)} clusters is more than {total}")
    fixed: dict[K, int] = {}
    while True:
        free = {k: w for k, w in weights.items() if k not in fixed}
        left = total - sum(fixed.values())
        mass = sum(free.values())
        low = {k for k, w in free.items() if left * w / mass < floor - 1e-9}
        if not low:
            out = {**fixed, **largest_remainder(free, left, rng)}
            return {k: out[k] for k in weights}
        for k in low:
            fixed[k] = floor


def match_margins(rows: dict[K, int], cols: dict[Level, int], rng: random.Random) -> dict[tuple[K, Level], int]:
    """An integer table whose row and column sums are exactly `rows` and `cols` (equal totals), close to rows × cols / total."""
    total = sum(rows.values())
    if total != sum(cols.values()):
        raise PlanError("row and column totals differ")
    exact = {(r, c): rows[r] * cols[c] / total if total else 0.0 for r in rows for c in cols}
    table = {k: math.floor(v + 1e-9) for k, v in exact.items()}
    need_r = {r: rows[r] - sum(table[(r, c)] for c in cols) for r in rows}
    need_c = {c: cols[c] - sum(table[(r, c)] for r in rows) for c in cols}
    cells = sorted(exact, key=str)
    rng.shuffle(cells)
    cells.sort(key=lambda k: -(exact[k] - table[k]))
    for r, c in cells:
        if need_r[r] > 0 and need_c[c] > 0:
            table[(r, c)] += 1
            need_r[r] -= 1
            need_c[c] -= 1
    for r in rows:  # Whatever the remainders could not place: any column still short.
        for c in cols:
            while need_r[r] > 0 and need_c[c] > 0:
                table[(r, c)] += 1
                need_r[r] -= 1
                need_c[c] -= 1
    return table


def respect_capacity(
    table: dict[tuple[K, Level], int], capacity: dict[tuple[K, Level], int], split: str
) -> dict[tuple[K, Level], int]:
    """Moves questions out of cells over capacity (L3 in a cluster without units of 2+ chunks, L4 / L5 in a
    cluster of one unit) by swapping with another cluster: (c, lv) -1, (c, lv2) +1, (c2, lv) +1, (c2, lv2) -1.
    Both margins stay as they are."""
    table = dict(table)
    rows = sorted({r for r, _ in table}, key=str)
    cols = sorted({c for _, c in table})
    while True:
        over = [(r, c) for (r, c), n in table.items() if n > capacity[(r, c)]]
        if not over:
            return table
        r, c = over[0]
        move = next(
            (
                (r2, c2)
                for c2 in sorted(cols, key=lambda x: (x in ("L3", "L4", "L5"), x))
                if c2 != c and table[(r, c2)] < capacity[(r, c2)]
                for r2 in rows
                if r2 != r and table[(r2, c)] < capacity[(r2, c)] and table[(r2, c2)] > 0
            ),
            None,
        )
        if move is None:
            raise PlanError(f"{split}: cluster {r} cannot hold {table[(r, c)]} {c} questions and no other cluster can take them")
        r2, c2 = move
        table[(r, c)] -= 1
        table[(r, c2)] += 1
        table[(r2, c)] += 1
        table[(r2, c2)] -= 1


# --- Units to slots -------------------------------------------------------------------------------


def _unit_counts(units: list[Unit], cluster_total: int, cap: int, rng: random.Random) -> dict[str, int]:
    """A cluster's questions over its units: √ per document (its WSTG part as one), then down to units."""
    docs: dict[str, list[Unit]] = defaultdict(list)
    for u in units:
        docs[u.doc_key].append(u)
    doc_weight = {d: math.sqrt(sum(u.weight_chunks for u in us)) for d, us in docs.items()}
    # The cluster's WSTG part is one document, so it has the same cap (spec user story 19).
    caps = {d: float(cap) for d in docs}
    doc_quota = largest_remainder(capped_shares(doc_weight, cluster_total, caps), cluster_total, rng)
    counts: dict[str, int] = {}
    for d, us in docs.items():
        if d == WSTG_KEY:
            w = {u.unit_id: math.sqrt(u.weight_chunks) for u in us}
            shares = capped_shares(w, doc_quota[d], {u.unit_id: float(cap) for u in us})
        else:
            shares = {u.unit_id: float(u.weight_chunks) for u in us}
        counts.update(largest_remainder(shares, doc_quota[d], rng))
    return counts


def _split_slots(
    split: SplitName,
    units: list[Unit],
    cluster_totals: dict[ClusterId, int],
    l6: list[int],
    cap: int,
    rng: random.Random,
) -> list[PlanSlot]:
    by_cluster: dict[ClusterId, list[Unit]] = defaultdict(list)
    for u in units:
        by_cluster[u.cluster].append(u)  # type: ignore[index]
    unit_by_id = {u.unit_id: u for u in units}
    total = sum(cluster_totals.values())

    anchors_of: dict[ClusterId, list[str]] = {}
    capacity: dict[tuple[ClusterId, Level], int] = {}
    for cluster in sorted(cluster_totals):
        members = sorted(by_cluster[cluster], key=lambda u: u.unit_id)
        counts = _unit_counts(members, cluster_totals[cluster], cap, rng)
        anchors = [uid for uid in sorted(counts) for _ in range(counts[uid])]
        rng.shuffle(anchors)
        anchors_of[cluster] = anchors
        pairable = sum(u.weight_chunks > 0 for u in members) >= 2
        for lv in ANSWERABLE_LEVELS:
            if lv == "L3":
                capacity[(cluster, lv)] = sum(unit_by_id[uid].chunks >= 2 for uid in anchors)
            elif lv in ("L4", "L5"):
                capacity[(cluster, lv)] = len(anchors) if pairable else 0
            else:
                capacity[(cluster, lv)] = len(anchors)

    level_totals = largest_remainder({lv: 1.0 for lv in ANSWERABLE_LEVELS}, total, rng)
    table = respect_capacity(match_margins(dict(cluster_totals), level_totals, rng), capacity, split)

    slots: list[PlanSlot] = []
    #: Units of a cluster's L1 / L3 slots: an L6(c) question rewrites an approved one of these.
    l1_units: dict[ClusterId, list[str]] = defaultdict(list)
    for cluster in sorted(cluster_totals):
        members = sorted(by_cluster[cluster], key=lambda u: u.unit_id)
        anchors = anchors_of[cluster]
        want = {lv: table[(cluster, lv)] for lv in ANSWERABLE_LEVELS}
        multi = [i for i, uid in enumerate(anchors) if unit_by_id[uid].chunks >= 2]
        if len(multi) < want["L3"]:
            raise PlanError(f"{split}/{cluster}: {want['L3']} L3 questions but {len(multi)} slots on units of 2+ chunks")
        levels: list[Level | None] = [None] * len(anchors)
        for i in multi[: want["L3"]]:
            levels[i] = "L3"
        rest = iter(i for i in range(len(anchors)) if levels[i] is None)
        for lv in ("L4", "L5", "L1", "L2", "L7"):
            for _ in range(want[lv]):
                levels[next(rest)] = lv
        partners = [u for u in members if u.weight_chunks > 0]
        for uid, lv in zip(anchors, levels, strict=True):
            ids = [uid]
            if lv in ("L4", "L5"):
                others = [u for u in partners if u.unit_id != uid]
                if not others:
                    raise PlanError(f"{split}/{cluster}: no second unit for an {lv} pair")
                ids.append(rng.choices(others, weights=[u.weight_chunks for u in others])[0].unit_id)
            if lv in ("L1", "L3"):
                l1_units[cluster].append(uid)
            slots.append(PlanSlot(slot_id="", split=split, cluster=cluster, level=lv, doc_key=unit_by_id[uid].doc_key, unit_ids=ids))  # type: ignore[arg-type]

    a, b, c = l6
    slots += [PlanSlot(slot_id="", split=split, cluster=None, level="L6", l6_kind="out_of_domain", doc_key=None, unit_ids=[]) for _ in range(a)]
    slots += [PlanSlot(slot_id="", split=split, cluster=None, level="L6", l6_kind="not_in_corpus", doc_key=None, unit_ids=[]) for _ in range(b)]
    per_cluster = largest_remainder({k: float(v) for k, v in cluster_totals.items()}, c, rng)
    for cluster in sorted(per_cluster):
        for _ in range(per_cluster[cluster]):
            uid = rng.choice(l1_units[cluster] or anchors_of[cluster])
            slots.append(PlanSlot(slot_id="", split=split, cluster=cluster, level="L6", l6_kind="false_premise", doc_key=unit_by_id[uid].doc_key, unit_ids=[uid]))

    slots.sort(key=lambda s: (s.cluster or "~", s.level, s.l6_kind or "", s.unit_ids))
    return [s.model_copy(update={"slot_id": f"{split}-{n:05d}"}) for n, s in enumerate(slots, start=1)]


def cluster_weights(units: list[Unit]) -> dict[ClusterId, float]:
    chunks: dict[ClusterId, int] = defaultdict(int)
    for u in units:
        chunks[u.cluster] += u.weight_chunks  # type: ignore[index]
    return {c: math.sqrt(n) for c, n in chunks.items()}


def build_plan(snapshot_id: str, units: list[Unit], params: PlanParams) -> SamplePlan:
    sampleable = [u for u in units if u.sampleable and u.cluster is not None]
    weights = cluster_weights(sampleable)
    slots: list[PlanSlot] = []
    for split, n, floor, l6 in (
        ("test", params.test_answerable, params.test_floor, params.test_l6),
        ("dev", params.dev_answerable, 0, params.dev_l6),
    ):
        rng = random.Random(f"{params.seed}-{split}")
        totals = floored_quotas(weights, n, floor, rng)
        slots += _split_slots(split, sampleable, totals, l6, params.cap, rng)  # type: ignore[arg-type]
    cells = Counter((s.split, s.cluster, s.level, s.l6_kind) for s in slots)
    return SamplePlan(
        snapshot_id=snapshot_id,
        seed=params.seed,
        params={k: v for k, v in asdict(params).items()},
        cells=[PlanCell(split=sp, cluster=cl, level=lv, l6_kind=kind, target=n) for (sp, cl, lv, kind), n in sorted(cells.items(), key=str)],
        slots=slots,
    )


def plan_table(plan: SamplePlan, split: SplitName) -> str:
    """The cluster × level table of one split, as markdown, with WSTG's share and the largest document."""
    slots = [s for s in plan.slots if s.split == split]
    cols = [*ANSWERABLE_LEVELS, "L6"]
    rows = sorted({s.cluster or "(none)" for s in slots}, key=lambda c: (c == "(none)", c))
    count = Counter((s.cluster or "(none)", s.level) for s in slots)
    lines = [f"| {split} | " + " | ".join(cols) + " | total |", "|---" * (len(cols) + 2) + "|"]
    for r in rows:
        cells = [count[(r, c)] for c in cols]
        lines.append(f"| {r} | " + " | ".join(map(str, cells)) + f" | {sum(cells)} |")
    totals = [sum(count[(r, c)] for r in rows) for c in cols]
    lines.append("| total | " + " | ".join(map(str, totals)) + f" | {sum(totals)} |")
    answerable = [s for s in slots if s.level != "L6"]
    wstg = sum(s.doc_key == WSTG_KEY for s in answerable)
    per_doc = Counter(s.doc_key for s in answerable if s.doc_key != WSTG_KEY)
    per_wstg_unit = Counter(s.unit_ids[0] for s in answerable if s.doc_key == WSTG_KEY)
    top_doc, top_n = per_doc.most_common(1)[0]
    lines.append("")
    lines.append(
        f"Answerable {len(answerable)}; WSTG {wstg} ({wstg / len(answerable):.1%}) over {len(per_wstg_unit)} WSTG units; "
        f"cheat sheets with questions {len(per_doc)}; most from one document: {top_doc} {top_n}; "
        f"most from one WSTG unit: {max(per_wstg_unit.values(), default=0)}"
    )
    return "\n".join(lines)
