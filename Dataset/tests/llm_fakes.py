"""A scripted LLM for tests: answers from the prompt it is given, never from the network."""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from seclearn_eval.llm import FakeClient
from seclearn_eval.schema import Unit
from seclearn_eval.snapshot import Snapshot


def unit_texts(snap: Snapshot, units: list[Unit]) -> dict[str, str]:
    return {u.unit_id: snap.markdown[u.doc_key][u.char_start : u.char_end] for u in units if u.sampleable}


def generator(snap: Snapshot, units: list[Unit], override: Callable[[str, dict], dict | None] | None = None) -> FakeClient:
    """Writes questions whose quotes are the first sentence-ish line of each unit found in the prompt."""
    texts = unit_texts(snap, units)

    def reply(prompt: str, schema: dict[str, Any]) -> dict:
        if override and (out := override(prompt, schema)) is not None:
            return out
        n = int(re.search(r"exactly (\d+) question", prompt).group(1))
        found = sorted((uid for uid, text in texts.items() if text in prompt), key=lambda uid: prompt.find(texts[uid]))
        if not found:  # out of domain: no evidence in the prompt
            return {"items": [_item(f"OOD {i}", []) for i in range(n)]}
        quotes = [{"unit": k + 1, "text": texts[uid].splitlines()[1][:60]} for k, uid in enumerate(found)]
        return {"items": [_item(f"{'+'.join(found)} #{i}", quotes) for i in range(n)]}

    return FakeClient(model="claude-fake", reply=reply)


def _item(tag: str, quotes: list[dict]) -> dict:
    return {
        "claims": [f"Claim about {tag}."],
        "question": f"Câu hỏi về {tag}?",
        "question_en": f"Question about {tag}?",
        "answer": f"Answer about {tag}.",
        "quotes": quotes,
    }
