"""`generate`: candidates for the plan's root-level slots, about 1.6 times what the plan keeps.

Root levels are the ones written from the corpus: L1 / L3 from one unit, L4 / L5 from a pair of units of one
cluster, and L6(a) out of domain. L2, L7, L6(b) and L6(c) are built later from approved questions (ticket 09).
"""

from __future__ import annotations

import math
from collections import defaultdict

from pydantic import ValidationError

from .llm import LLMClient
from .prompts import GENERATION_SCHEMA, SYSTEM_GENERATE, generation_prompt, ood_prompt
from .schema import Candidate, Generation, PlanSlot, Quote, SamplePlan, Unit
from .snapshot import Snapshot

GROUNDED = ("L1", "L3", "L4", "L5")


def is_root(slot: PlanSlot) -> bool:
    return slot.level in GROUNDED or (slot.level == "L6" and slot.l6_kind == "out_of_domain")


def oversampled(n_slots: int, oversample: float) -> list[int]:
    """Candidates per slot of a cell: the cell gets ceil(oversample × n), spread so no slot differs by more than one."""
    return [math.ceil(oversample * (i + 1) - 1e-9) - math.ceil(oversample * i - 1e-9) for i in range(n_slots)]


def generate(snap: Snapshot, units: list[Unit], plan: SamplePlan, client: LLMClient, *, oversample: float) -> list[Candidate]:
    """One call per grounded slot, one call per L6(a) cell. Replies that do not fit the schema are skipped, not fatal."""
    by_id = {u.unit_id: u for u in units}
    cells: dict[tuple, list[PlanSlot]] = defaultdict(list)
    for s in sorted((s for s in plan.slots if is_root(s)), key=lambda s: s.slot_id):
        cells[(s.split, s.cluster, s.level, s.l6_kind)].append(s)

    out: list[Candidate] = []
    for (_split, _cluster, level, _kind), slots in sorted(cells.items(), key=lambda kv: kv[1][0].slot_id):
        counts = oversampled(len(slots), oversample)
        if level == "L6":
            version, prompt = ood_prompt(sum(counts))
            items = _items(client.ask_json(prompt, GENERATION_SCHEMA, system=SYSTEM_GENERATE, seed=plan.seed))
            # Hand the cell's questions out to its slots in order.
            at = 0
            for s, k in zip(slots, counts, strict=True):
                for j, item in enumerate(items[at : at + k]):
                    out.append(_candidate(s, j, item, [], client.model, version, plan.seed))
                at += k
            continue
        for s, k in zip(slots, counts, strict=True):
            pair = [by_id[uid] for uid in s.unit_ids]
            texts = [snap.markdown[u.doc_key][u.char_start : u.char_end] for u in pair]
            version, prompt = generation_prompt(level, texts, k)
            items = _items(client.ask_json(prompt, GENERATION_SCHEMA, system=SYSTEM_GENERATE, seed=plan.seed))
            for j, item in enumerate(items[:k]):
                out.append(_candidate(s, j, item, [u.doc_key for u in pair], client.model, version, plan.seed))
    return [c for c in out if c is not None]


def _items(reply: dict) -> list[dict]:
    items = reply.get("items") if isinstance(reply, dict) else None
    return [i for i in items if isinstance(i, dict)] if isinstance(items, list) else []


def _candidate(s: PlanSlot, j: int, item: dict, doc_keys: list[str], model: str, version: str, seed: int) -> Candidate | None:
    try:
        quotes = []
        for q in item.get("quotes") or []:
            n = int(q["unit"])
            # A quote naming a unit that is not in the prompt keeps no document: the quote check rejects it.
            quotes.append(Quote(doc_key=doc_keys[n - 1] if 1 <= n <= len(doc_keys) else "?", quote=str(q["text"])))
        answer = str(item.get("answer") or "").strip()
        return Candidate(
            candidate_id=f"{s.slot_id}-c{j + 1}",
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
