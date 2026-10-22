"""`generate`: candidates for the plan's root-level slots, about 1.6 times what the plan keeps.

Root levels are the ones written from the corpus: L1 / L3 from one unit, L4 / L5 from a pair of units of one
cluster, and L6(a) out of domain. L2, L7, L6(b) and L6(c) are built later from approved questions (ticket 09).

A reply with fewer questions than asked is topped up: another call for the missing ones, on the next seed (so the
cache sees a new request), at most MAX_TOP_UPS times. What is still missing is the cell's shortfall in the report.

A request the model refuses (Claude declined WSTG-INPV-11's code-injection payloads) keeps what came before. A
grounded slot is then written from other units of its cluster: up to MAX_SUBSTITUTES unit lists, under the same level
rule (L3: >= 2 chunks) and the plan's per-document cap, the replaced unit's own document first, then the units the plan
uses least; an L4 / L5 pair swaps one unit and keeps the other. A slot still short after that, or a refused L6(a) cell,
is reported as refused, and the run goes on. The report lists every substitution, and every refused slot with the
units tried.

`prefer_other_doc` is the rule `topup` uses (ticket 09, 2026-10-21): same-document substitutes were full of payloads
too, so after a refusal the units of other documents of the cluster come first, and a unit refused for any slot (or
listed in `banned_units`, from earlier runs) is never a substitute again. `doc_load` adds the kept questions of each
(split, document, cluster) to the per-document cap, which otherwise counts this plan's slots only. `generate` keeps
the first rule, so the slots it already wrote from substitutes are not asked again.
"""

from __future__ import annotations

import hashlib
import math
from collections import Counter, defaultdict
from collections.abc import Callable

from pydantic import ValidationError

from .llm import LLMClient, ModelRefusal
from .plan import L3_MIN_CHUNKS
from .prompts import GENERATION_SCHEMA, SYSTEM_GENERATE, generation_prompt, ood_prompt
from .schema import (
    Candidate,
    Generation,
    GenerationCell,
    GenerationReport,
    PlanSlot,
    Quote,
    RefusedSlot,
    SamplePlan,
    SubstitutedSlot,
    Unit,
)
from .snapshot import Snapshot

GROUNDED = ("L1", "L3", "L4", "L5")
#: Extra calls for a reply that came back short, per slot (L1-L5) or per cell (L6(a)).
MAX_TOP_UPS = 2
#: L6(a) questions asked per call, so a large cell stays well under the generator's `max_tokens`.
OOD_BATCH = 25
#: Substitute unit lists asked for a refused grounded slot before it counts as refused.
MAX_SUBSTITUTES = 3
#: The plan's per-document cap when its params do not record one (plan.PlanParams.cap).
DEFAULT_CAP = 20


def is_root(slot: PlanSlot) -> bool:
    return slot.level in GROUNDED or (slot.level == "L6" and slot.l6_kind == "out_of_domain")


def oversampled(n_slots: int, oversample: float) -> list[int]:
    """Candidates per slot of a cell: the cell gets ceil(oversample × n), spread so no slot differs by more than one."""
    return [math.ceil(oversample * (i + 1) - 1e-9) - math.ceil(oversample * i - 1e-9) for i in range(n_slots)]


#: (item, prompt version, seed, index of the candidate in its slot) → a candidate, or None when the item is off the schema.
Build = Callable[[dict, str, int, int], "Candidate | None"]


def _collect(
    client: LLMClient, prompt_for: Callable[[int], tuple[str, str]], want: int, seed: int, batch: int, build: Build
) -> tuple[list[Candidate], int, bool]:
    """Up to `want` candidates, asking at most `batch` per call on seeds `seed`, `seed + 1`, …; a call that comes back
    short (too few items, or items off the schema) is followed by at most MAX_TOP_UPS more, and a refused call ends the
    asking. Returns (candidates, calls, refused)."""
    got: list[Candidate] = []
    calls = short_calls = 0
    while len(got) < want and short_calls <= MAX_TOP_UPS:
        n = min(batch, want - len(got))
        version, prompt = prompt_for(n)
        call_seed = seed + calls
        calls += 1
        try:
            reply = client.ask_json(prompt, GENERATION_SCHEMA, system=SYSTEM_GENERATE, seed=call_seed)
        except ModelRefusal:
            return got, calls, True
        before = len(got)
        for item in _items(reply)[:n]:
            if (c := build(item, version, call_seed, len(got))) is not None:
                got.append(c)
        short_calls += len(got) - before < n
    return got, calls, False


def generate(
    snap: Snapshot, units: list[Unit], plan: SamplePlan, client: LLMClient, *, oversample: float,
    prefer_other_doc: bool = False, banned_units: set[str] | None = None,
    doc_load: Counter[tuple[str, str, str | None]] | None = None,
) -> tuple[list[Candidate], GenerationReport]:
    """One call per grounded slot, L6(a) cells in batches of OOD_BATCH; short replies topped up. Replies that do not
    fit the schema are skipped, not fatal: they count towards the shortfall."""
    by_id = {u.unit_id: u for u in units}
    cells: dict[tuple, list[PlanSlot]] = defaultdict(list)
    for s in sorted((s for s in plan.slots if is_root(s)), key=lambda s: s.slot_id):
        cells[(s.split, s.cluster, s.level, s.l6_kind)].append(s)

    out: list[Candidate] = []
    report: list[GenerationCell] = []
    refused: list[RefusedSlot] = []
    substituted: list[SubstitutedSlot] = []
    substitutes = _Substitutes(units, plan, prefer_other_doc, banned_units or set(), doc_load or Counter())
    for (split, cluster, level, kind), slots in sorted(cells.items(), key=lambda kv: kv[1][0].slot_id):
        counts = oversampled(len(slots), oversample)
        got_cell, calls_cell, refused_cell, substituted_cell = 0, 0, 0, 0
        if level == "L6":
            first = slots[0]
            pool, calls_cell, was_refused = _collect(
                client, ood_prompt, sum(counts), plan.seed, OOD_BATCH,
                lambda item, version, seed, j, first=first: _candidate(first, j, item, [], client.model, version, seed),
            )
            # Hand the cell's questions out to its slots in order. One prompt serves the whole cell, so after a
            # refusal every slot left short is a refused one.
            at = 0
            for s, k in zip(slots, counts, strict=True):
                for j, c in enumerate(pool[at : at + k]):
                    out.append(c.model_copy(update={"candidate_id": _candidate_id(s, j), "slot_id": s.slot_id}))
                if was_refused and len(pool[at : at + k]) < k:
                    refused.append(_refused(s))
                    refused_cell += 1
                at += k
            got_cell = len(pool)
        else:
            for s, k in zip(slots, counts, strict=True):
                found, calls, was_refused = _ask_slot(client, snap, by_id, s, k, 0, plan.seed)
                tried: list[list[str]] = []
                if was_refused:
                    substitutes.refused(s.unit_ids)
                asked: list[list[str]] = []
                while was_refused and len(asked) < MAX_SUBSTITUTES and (option := substitutes.next(s, by_id, asked)) is not None:
                    asked.append(option)
                    alt = s.model_copy(update={"unit_ids": option})
                    more, more_calls, was_refused = _ask_slot(client, snap, by_id, alt, k - len(found), len(found), plan.seed)
                    if was_refused:
                        substitutes.refused([uid for uid in option if uid not in s.unit_ids])
                    found += more
                    calls += more_calls
                    if more:
                        substitutes.take(s, alt, by_id)
                        substituted.append(
                            SubstitutedSlot(slot_id=s.slot_id, level=s.level, from_unit_ids=list(s.unit_ids), to_unit_ids=option)
                        )
                        substituted_cell += 1
                    else:
                        tried.append(option)
                out += found
                got_cell += len(found)
                calls_cell += calls
                if was_refused:
                    refused.append(_refused(s, tried))
                    refused_cell += 1
        wanted = sum(counts)
        report.append(
            GenerationCell(split=split, cluster=cluster, level=level, l6_kind=kind, wanted=wanted, got=got_cell,
                           shortfall=wanted - got_cell, calls=calls_cell, refused=refused_cell, substituted=substituted_cell)
        )
    return out, GenerationReport(
        cells=report, n_candidates=len(out), n_shortfall=sum(c.shortfall for c in report), n_refused=len(refused),
        refused=refused, n_substituted=len(substituted), substituted=substituted,
    )


def _ask_slot(
    client: LLMClient, snap: Snapshot, by_id: dict[str, Unit], s: PlanSlot, want: int, offset: int, seed: int
) -> tuple[list[Candidate], int, bool]:
    """Up to `want` candidates for a grounded slot from its `unit_ids`, numbered from `offset` within the slot."""
    pair = [by_id[uid] for uid in s.unit_ids]
    texts = [snap.markdown[u.doc_key][u.char_start : u.char_end] for u in pair]
    doc_keys = [u.doc_key for u in pair]
    return _collect(
        client, lambda n: generation_prompt(s.level, texts, n), want, seed, want,
        lambda item, version, call_seed, j: _candidate(s, offset + j, item, doc_keys, client.model, version, call_seed),
    )


class _Substitutes:
    """Other units of a slot's cluster to write a refused slot from. Keeps the plan's level rule (L3: >= 2 chunks) and
    its per-document cap, per split and counted like the plan (one per slot of the document). Order: the replaced
    unit's own document first (other documents first when `prefer_other_doc`), then the units the plan uses least,
    then a hash of seed, slot and unit (no set order). With `prefer_other_doc`, a refused unit is never offered again."""

    def __init__(self, units: list[Unit], plan: SamplePlan, prefer_other_doc: bool, banned: set[str],
                 doc_load: Counter[tuple[str, str, str | None]]) -> None:
        self.units = sorted((u for u in units if u.sampleable and u.cluster), key=lambda u: u.unit_id)
        self.seed = plan.seed
        self.cap = int(plan.params.get("cap", DEFAULT_CAP))
        self.load = Counter((s.split, s.doc_key, s.cluster) for s in plan.slots) + doc_load
        self.uses = Counter(uid for s in plan.slots for uid in s.unit_ids)
        self.prefer_other_doc = prefer_other_doc
        self.banned = set(banned)

    def refused(self, unit_ids: list[str]) -> None:
        """Units of a refused request: never substitutes again, under the `prefer_other_doc` rule."""
        if self.prefer_other_doc:
            self.banned.update(unit_ids)

    def next(self, s: PlanSlot, by_id: dict[str, Unit], asked: list[list[str]]) -> list[str] | None:
        """The first option not asked yet, ranked again so units refused since are left out."""
        return next((o for o in self.options(s, by_id) if o not in asked), None)

    def options(self, s: PlanSlot, by_id: dict[str, Unit]) -> list[list[str]]:
        """Unit lists to ask, in order, each with one unit swapped. A pair swaps its second unit first, then its first."""
        if len(s.unit_ids) == 1:
            return [[uid] for uid in self._ranked(s, 0, by_id)][:MAX_SUBSTITUTES]
        first, second = s.unit_ids
        swap_second = [[first, uid] for uid in self._ranked(s, 1, by_id)]
        swap_first = [[uid, second] for uid in self._ranked(s, 0, by_id)]
        interleaved = [o for pair in zip(swap_second, swap_first, strict=False) for o in pair]
        rest = swap_second[len(swap_first) :] + swap_first[len(swap_second) :]
        return (interleaved + rest)[:MAX_SUBSTITUTES]

    def take(self, s: PlanSlot, alt: PlanSlot, by_id: dict[str, Unit]) -> None:
        """Counts the substitute's new unit, and its document when it differs from the replaced unit's."""
        for old, new in zip(s.unit_ids, alt.unit_ids, strict=True):
            if old != new:
                self.uses[new] += 1
                if by_id[new].doc_key != by_id[old].doc_key:
                    self.load[(s.split, by_id[new].doc_key, s.cluster)] += 1

    def _ranked(self, s: PlanSlot, i: int, by_id: dict[str, Unit]) -> list[str]:
        old = by_id[s.unit_ids[i]]

        def fits(u: Unit) -> bool:
            if u.cluster != s.cluster or u.unit_id in s.unit_ids or u.unit_id in self.banned:
                return False
            if s.level == "L3" and u.chunks < L3_MIN_CHUNKS:
                return False
            return u.doc_key == old.doc_key or self.load[(s.split, u.doc_key, s.cluster)] < self.cap

        def order(u: Unit) -> tuple[bool, int, str]:
            tie = hashlib.sha256(f"{self.seed}:{s.slot_id}:{u.unit_id}".encode()).hexdigest()
            return ((u.doc_key == old.doc_key) if self.prefer_other_doc else (u.doc_key != old.doc_key), self.uses[u.unit_id], tie)

        return [u.unit_id for u in sorted(filter(fits, self.units), key=order)]


def _refused(s: PlanSlot, tried: list[list[str]] | None = None) -> RefusedSlot:
    return RefusedSlot(
        slot_id=s.slot_id, level=s.level, l6_kind=s.l6_kind, unit_ids=list(s.unit_ids), tried_unit_ids=tried or []
    )


def _items(reply: dict) -> list[dict]:
    items = reply.get("items") if isinstance(reply, dict) else None
    return [i for i in items if isinstance(i, dict)] if isinstance(items, list) else []


def _candidate_id(s: PlanSlot, j: int) -> str:
    return f"{s.slot_id}-c{j + 1}"


def _candidate(s: PlanSlot, j: int, item: dict, doc_keys: list[str], model: str, version: str, seed: int) -> Candidate | None:
    try:
        quotes = []
        for q in item.get("quotes") or []:
            n = int(q["unit"])
            # A quote naming a unit that is not in the prompt keeps no document: the quote check rejects it.
            quotes.append(Quote(doc_key=doc_keys[n - 1] if 1 <= n <= len(doc_keys) else "?", quote=str(q["text"])))
        answer = str(item.get("answer") or "").strip()
        return Candidate(
            candidate_id=_candidate_id(s, j),
            slot_id=s.slot_id,
            split=s.split,
            cluster=s.cluster,
            level=s.level,
            l6_kind=s.l6_kind,
            unit_ids=list(s.unit_ids),
            question=str(item["question"]).strip(),
            question_en=str(item["question_en"]).strip(),
            reference_answer=answer if s.level != "L6" and answer else None,
            reference_claims=[str(c) for c in item.get("claims") or []],
            quotes=quotes,
            generation=Generation(model=model, prompt_version=version, seed=seed),
        )
    except (KeyError, TypeError, ValueError, ValidationError):
        return None
