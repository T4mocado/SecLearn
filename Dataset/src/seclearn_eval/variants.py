"""`variants`: L2, L7 and L6(c) questions rewritten from reviewed questions (spec user stories 29-30, ticket 09).

- L2 (paraphrase) and L7 (conversation) from an accepted or edited L1 / L3 question; L6(c) (false premise) from an L1.
- A variant keeps its seed's `seed_id`, split, cluster, units and (L2 / L7) gold spans, so `split` never parts them and
  a score can compare a variant with its seed. Every other L2 variant is written without diacritics.
- L6(c) carries the span that refutes its premise: the model's quote, found verbatim inside the seed's units.
- Only plan cells short of their target are written, ceil(oversample × missing) each, from seeds in an order fixed by
  the plan's seed; a seed gives at most one variant of each kind.
- A variant that fails its own checks is dropped and reported: no refuting quote in the units (L6(c)), the
  "this document" wording `filter` rejects, or an L2 whose English keeps most of the evidence's words.
"""

from __future__ import annotations

import unicodedata

from .filter import evidence_overlap, locate_quotes, refers_to_document
from .llm import LLMClient, ModelRefusal
from .prompts import SYSTEM_GENERATE, VARIANT_SCHEMAS, variant_prompt
from .quota import reviewed, seeded_order, short_cells, to_make
from .schema import (
    Generation,
    LLMConfig,
    Question,
    Quote,
    Rejection,
    Review,
    SamplePlan,
    TopUpCell,
    TopUpReport,
    Turn,
    Unit,
)
from .snapshot import Snapshot

#: Variant kind → (level, L6 kind) of its plan cells, and the seed levels it is made from.
KINDS: dict[str, tuple[tuple[str, str | None], tuple[str, ...]]] = {
    "L2": (("L2", None), ("L1", "L3")),
    "L7": (("L7", None), ("L1", "L3")),
    "L6c": (("L6", "false_premise"), ("L1",)),
}


def strip_accents(text: str) -> str:
    """Vietnamese without diacritics, as many users type it: "Độ dài" → "Do dai"."""
    text = text.replace("đ", "d").replace("Đ", "D")
    return unicodedata.normalize("NFC", "".join(ch for ch in unicodedata.normalize("NFD", text) if not unicodedata.combining(ch)))


def variant_id(seed: Question, kind: str) -> str:
    return f"{seed.id}-{kind}"


def build_variants(
    questions: list[Question], plan: SamplePlan, snap: Snapshot, units: list[Unit], client: LLMClient, *, config: LLMConfig
) -> tuple[list[Question], TopUpReport]:
    """Variants for the L2 / L7 / L6(c) cells short of their target. `questions` are every question file so far
    (reviewed seeds, and variants of earlier runs, which count towards their cells and are not written again)."""
    by_unit = {u.unit_id: u for u in units}
    taken = {q.id for q in questions}
    out: list[Question] = []
    cells: list[TopUpCell] = []
    rejected: list[Rejection] = []
    for kind, ((level, l6_kind), seed_levels) in KINDS.items():
        for c, held in short_cells(plan, questions, {(level, l6_kind)}):
            want = to_make(c.target, held, config.oversample)
            seeds = sorted(
                (
                    q for q in questions
                    if reviewed(q) and q.strata.level in seed_levels and q.split == c.split and q.cluster == c.cluster
                    and variant_id(q, kind) not in taken
                ),
                key=lambda q: seeded_order(plan.seed, kind, q.id),
            )
            made = calls = refused = 0
            for source in seeds:
                if made == want:
                    break
                calls += 1
                q, problem = _variant(kind, source, snap, by_unit, client, plan.seed, config.l2_max_overlap, unaccented=kind == "L2" and made % 2 == 1)
                if q is None:
                    refused += problem[0] == "refused"
                    rejected.append(Rejection(candidate_id=variant_id(source, kind), step="variants", reason=problem[0], detail=problem[1]))
                    continue
                out.append(q)
                made += 1
            cells.append(TopUpCell(split=c.split, cluster=c.cluster, level=c.level, l6_kind=c.l6_kind, target=c.target,
                                   kept=held, wanted=want, made=made, calls=calls, refused=refused))
    return out, TopUpReport(cells=cells, n_made=len(out), rejected=rejected)


def _variant(
    kind: str, seed: Question, snap: Snapshot, by_unit: dict[str, Unit], client: LLMClient, plan_seed: int,
    max_overlap: float, *, unaccented: bool
) -> tuple[Question | None, tuple[str, str]]:
    """One variant of `seed`, or None and (reason, detail) when the model refused it or it fails a check."""
    seed_units = [by_unit[uid] for uid in seed.unit_ids if uid in by_unit]
    texts = [snap.markdown[u.doc_key][u.char_start : u.char_end] for u in seed_units]
    evidence = [s.quote for s in seed.gold_evidence]
    version, prompt = variant_prompt(kind, seed.question, seed.question_en, seed.reference_answer or "", evidence, texts)
    try:
        reply = client.ask_json(prompt, VARIANT_SCHEMAS[kind], system=SYSTEM_GENERATE, seed=plan_seed)
    except ModelRefusal as err:
        return None, ("refused", str(err))
    try:
        text, text_en = str(reply["question"]).strip(), str(reply["question_en"]).strip()
        turns = [Turn(role=t["role"], content=str(t["content"]).strip()) for t in reply.get("turns") or []]
    except (KeyError, TypeError, ValueError):
        return None, ("off_schema", str(reply)[:200])
    if hit := refers_to_document(text, text_en, *(t.content for t in turns)):
        return None, ("refers_to_document", hit)

    update: dict[str, object] = {
        "id": variant_id(seed, kind),
        "question": strip_accents(text) if unaccented else text,
        "question_en": text_en,
        "turns": turns,
        "review": Review(),
        "generation": Generation(model=client.model, prompt_version=version, seed=plan_seed),
    }
    strata = seed.strata.model_copy(update={"level": KINDS[kind][0][0]})
    if kind == "L2":
        share = evidence_overlap(text_en, evidence)
        if share >= max_overlap:
            return None, ("too_close_to_document", f"{share:.2f} of content words in the evidence")
        strata = strata.model_copy(update={"question_style": "unaccented" if unaccented else "accented"})
    elif kind == "L6c":
        quotes = [Quote(doc_key=u.doc_key, quote=str(reply.get("refuting_quote") or "")) for u in seed_units[:1]]
        located = locate_quotes(quotes, seed.unit_ids, snap, by_unit)
        if located.problem or not located.spans:
            return None, (located.problem or "no_refuting_quote", located.detail)
        update["gold_evidence"] = [s.model_copy(update={"refutes": True}) for s in located.spans]
        update["reference_answer"] = str(reply.get("answer") or "").strip() or None
        update["reference_claims"] = []
        strata = strata.model_copy(update={"level": "L6", "answerable": False, "l6_kind": "false_premise"})
    update["strata"] = strata
    return seed.model_copy(update=update), ("", "")
