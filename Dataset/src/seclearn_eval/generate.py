"""`generate`: candidates for the plan's root-level slots, about 1.6 times what the plan keeps.

Root levels are the ones written from the corpus: L1 / L3 from one unit, L4 / L5 from a pair of units of one
cluster, and L6(a) out of domain. L2, L7, L6(b) and L6(c) are built later from approved questions (ticket 09).

A reply with fewer questions than asked is topped up: another call for the missing ones, on the next seed (so the
cache sees a new request), at most MAX_TOP_UPS times. What is still missing is the cell's shortfall in the report.
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Callable

from pydantic import ValidationError

from .llm import LLMClient
from .prompts import GENERATION_SCHEMA, SYSTEM_GENERATE, generation_prompt, ood_prompt
from .schema import Candidate, Generation, GenerationCell, GenerationReport, PlanSlot, Quote, SamplePlan, Unit
from .snapshot import Snapshot

GROUNDED = ("L1", "L3", "L4", "L5")
#: Extra calls for a reply that came back short, per slot (L1-L5) or per cell (L6(a)).
MAX_TOP_UPS = 2
#: L6(a) questions asked per call, so a large cell stays well under the generator's `max_tokens`.
OOD_BATCH = 25


def is_root(slot: PlanSlot) -> bool:
    return slot.level in GROUNDED or (slot.level == "L6" and slot.l6_kind == "out_of_domain")


def oversampled(n_slots: int, oversample: float) -> list[int]:
    """Candidates per slot of a cell: the cell gets ceil(oversample × n), spread so no slot differs by more than one."""
    return [math.ceil(oversample * (i + 1) - 1e-9) - math.ceil(oversample * i - 1e-9) for i in range(n_slots)]


#: (item, prompt version, seed, index of the candidate in its slot) → a candidate, or None when the item is off the schema.
Build = Callable[[dict, str, int, int], "Candidate | None"]


def _collect(client: LLMClient, prompt_for: Callable[[int], tuple[str, str]], want: int, seed: int, batch: int, build: Build) -> tuple[list[Candidate], int]:
    """Up to `want` candidates, asking at most `batch` per call on seeds `seed`, `seed + 1`, …; a call that comes back
    short (too few items, or items off the schema) is followed by at most MAX_TOP_UPS more. Returns (candidates, calls)."""
    got: list[Candidate] = []
    calls = short_calls = 0
    while len(got) < want and short_calls <= MAX_TOP_UPS:
        n = min(batch, want - len(got))
        version, prompt = prompt_for(n)
        call_seed = seed + calls
        reply = client.ask_json(prompt, GENERATION_SCHEMA, system=SYSTEM_GENERATE, seed=call_seed)
        calls += 1
        before = len(got)
        for item in _items(reply)[:n]:
            if (c := build(item, version, call_seed, len(got))) is not None:
                got.append(c)
        short_calls += len(got) - before < n
    return got, calls


def generate(snap: Snapshot, units: list[Unit], plan: SamplePlan, client: LLMClient, *, oversample: float) -> tuple[list[Candidate], GenerationReport]:
    """One call per grounded slot, L6(a) cells in batches of OOD_BATCH; short replies topped up. Replies that do not
    fit the schema are skipped, not fatal: they count towards the shortfall."""
    by_id = {u.unit_id: u for u in units}
    cells: dict[tuple, list[PlanSlot]] = defaultdict(list)
    for s in sorted((s for s in plan.slots if is_root(s)), key=lambda s: s.slot_id):
        cells[(s.split, s.cluster, s.level, s.l6_kind)].append(s)

    out: list[Candidate] = []
    report: list[GenerationCell] = []
    for (split, cluster, level, kind), slots in sorted(cells.items(), key=lambda kv: kv[1][0].slot_id):
        counts = oversampled(len(slots), oversample)
        got_cell, calls_cell = 0, 0
        if level == "L6":
            first = slots[0]
            pool, calls_cell = _collect(
                client, ood_prompt, sum(counts), plan.seed, OOD_BATCH,
                lambda item, version, seed, j: _candidate(first, j, item, [], client.model, version, seed),
            )
            # Hand the cell's questions out to its slots in order.
            at = 0
            for s, k in zip(slots, counts, strict=True):
                for j, c in enumerate(pool[at : at + k]):
                    out.append(c.model_copy(update={"candidate_id": _candidate_id(s, j), "slot_id": s.slot_id}))
                at += k
            got_cell = len(pool)
        else:
            for s, k in zip(slots, counts, strict=True):
                pair = [by_id[uid] for uid in s.unit_ids]
                texts = [snap.markdown[u.doc_key][u.char_start : u.char_end] for u in pair]
                doc_keys = [u.doc_key for u in pair]
                found, calls = _collect(
                    client, lambda n, texts=texts: generation_prompt(level, texts, n), k, plan.seed, k,
                    lambda item, version, seed, j, s=s, doc_keys=doc_keys: _candidate(s, j, item, doc_keys, client.model, version, seed),
                )
                out += found
                got_cell += len(found)
                calls_cell += calls
        wanted = sum(counts)
        report.append(
            GenerationCell(split=split, cluster=cluster, level=level, l6_kind=kind, wanted=wanted, got=got_cell,
                           shortfall=wanted - got_cell, calls=calls_cell)
        )
    return out, GenerationReport(cells=report, n_candidates=len(out), n_shortfall=sum(c.shortfall for c in report))


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
