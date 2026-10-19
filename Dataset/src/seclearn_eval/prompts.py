"""Prompt templates, versioned. Change a template → bump its version: the version is recorded on every candidate,
and the prompt text is part of the cache key, so an edited prompt is a new API call."""

from __future__ import annotations

from typing import Any, get_args

from .schema import Level

LEVELS = """\
L1 lookup: one specific fact stated in one passage.
L2 paraphrase: like L1, but worded away from the document's terms (or without Vietnamese diacritics).
L3 multi-passage, one topic: needs two or more passages of the same section to answer fully.
L4 comparison: compares two things (two mechanisms, two documents' advice) on one or more aspects.
L5 scenario / multi-step: a situation whose answer chains facts from two places (e.g. XSS -> HttpOnly cookie -> session).
L6 unanswerable: out of domain, a security topic the corpus does not cover, or a false premise.
L7 conversation: a follow-up turn that depends on earlier turns."""

SYSTEM_GENERATE = (
    "You write evaluation questions for SecLearn, a Vietnamese assistant that answers web application security "
    "questions from OWASP documents (Cheat Sheet Series and WSTG). Questions are in natural Vietnamese, as a "
    "Vietnamese developer would ask them, with an English translation. Every question must stand on its own: never "
    'refer to "this document", "the text above", a figure, a table, a chapter or a section number.'
)

#: level → (prompt version, task text). L1 / L3 extract claims first, then ask (spec, user story 27).
_TASKS = {
    "L1": (
        "gen-L1-v1",
        "Level L1 (lookup). First extract short assertive claims stated in the unit, each a single fact. "
        "Then, for each question, pick one claim and ask a question whose answer is that fact.",
    ),
    "L3": (
        "gen-L3-v1",
        "Level L3 (multi-passage, one topic). First extract the assertive claims of the unit. "
        "Then, for each question, ask one that needs two or more claims from different parts of the unit to answer fully.",
    ),
    "L4": (
        "gen-L4-v1",
        "Level L4 (comparison). The two units below belong to one topic cluster. Ask a question that compares something "
        "described in unit 1 with something described in unit 2; the answer needs both units. List the claims used.",
    ),
    "L5": (
        "gen-L5-v1",
        "Level L5 (scenario / multi-step). The two units below belong to one topic cluster. Describe a concrete "
        "situation and ask what to do or what happens; the answer must chain a fact from unit 1 with a fact from unit 2. "
        "List the claims used.",
    ),
}

OOD_VERSION = "gen-L6a-v1"


def generation_prompt(level: str, unit_texts: list[str], n: int) -> tuple[str, str]:
    """(prompt version, prompt) for questions grounded in one unit (L1 / L3) or a pair (L4 / L5)."""
    version, task = _TASKS[level]
    units = "\n\n".join(f'<unit n="{i}">\n{text}\n</unit>' for i, text in enumerate(unit_texts, start=1))
    prompt = f"""{task}

Write exactly {n} question(s), each different in what it asks.
For each question give:
- claims: the claims it rests on;
- question: the Vietnamese question;
- question_en: the same question in English;
- answer: a reference answer in Vietnamese, using only the units;
- quotes: verbatim quotes from the units that support the answer, each with the number of its unit. Copy the text
  exactly, character for character (one sentence or a short run of sentences); do not paraphrase or join pieces.

Level definitions:
{LEVELS}

{units}"""
    return version, prompt


def ood_prompt(n: int) -> tuple[str, str]:
    prompt = f"""Level L6(a) (out of domain). Write exactly {n} question(s) a user might type into a web security
assistant that have nothing to do with security or software (cooking, history, sport, health, travel...). Vary the
topics and the phrasing; some may look like casual chat. For each question give claims as an empty list, the
Vietnamese question, question_en, answer as an empty string and quotes as an empty list."""
    return OOD_VERSION, prompt


GENERATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "claims": {"type": "array", "items": {"type": "string"}},
                    "question": {"type": "string"},
                    "question_en": {"type": "string"},
                    "answer": {"type": "string"},
                    "quotes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {"unit": {"type": "integer"}, "text": {"type": "string"}},
                            "required": ["unit", "text"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["claims", "question", "question_en", "answer", "quotes"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}

# --- Filter (Gemini) -------------------------------------------------------------------------------

ANSWER_VERSION = "filter-answer-v1"
LEVEL_VERSION = "filter-level-v1"

SYSTEM_JUDGE = "You check evaluation questions for a Vietnamese web security assistant. Answer strictly in the JSON asked for."


def answer_prompt(question: str, evidence: list[str]) -> str:
    quotes = "\n".join(f"<evidence>{e}</evidence>" for e in evidence)
    return f"""Answer the question using ONLY the evidence below, not your own knowledge.
If the evidence does not contain enough to answer it, set answerable to false.

Question: {question}

{quotes}"""


ANSWER_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"answerable": {"type": "boolean"}, "answer": {"type": "string"}},
    "required": ["answerable", "answer"],
    "additionalProperties": False,
}


def level_prompt(question: str, evidence: list[str]) -> str:
    quotes = "\n".join(f"<evidence>{e}</evidence>" for e in evidence) or "(no evidence: the question was written to be unanswerable)"
    return f"""Classify the question into exactly one level, judging what answering it really takes, not how it is phrased.

{LEVELS}

Question: {question}

{quotes}"""


LEVEL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"level": {"type": "string", "enum": list(get_args(Level))}},
    "required": ["level"],
    "additionalProperties": False,
}
