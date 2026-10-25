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

# --- Variants of reviewed questions (ticket 09) ------------------------------------------------------

#: kind → (prompt version, task text). Each rewrites one reviewed L1 / L3 question (L6(c): L1) and keeps its answer.
_VARIANT_TASKS = {
    "L2": (
        "var-L2-v1",
        "Level L2 (paraphrase). Rewrite the question so it asks for the same thing but avoids the evidence's own terms: "
        "use everyday words, describe the mechanism instead of naming it, or use a synonym, as a Vietnamese developer "
        "who does not know the term would ask. The reference answer must stay correct. Give the Vietnamese question (with "
        "diacritics) and question_en, the English of your rewrite, which also avoids the evidence's words.",
    ),
    "L7": (
        "var-L7-v1",
        "Level L7 (conversation). Turn the question into the last turn of a short chat: write one or two earlier "
        "exchanges (a user turn, then an assistant turn, each in Vietnamese) on the same topic, then a follow-up user "
        "question that only makes sense after them (it may say \"nó\", \"cái đó\" or leave the topic out) and whose "
        "answer is the reference answer. Assistant turns must agree with the evidence. Give the turns, the follow-up "
        "question and question_en, its English.",
    ),
    "L6c": (
        "var-L6c-v1",
        "Level L6(c) (false premise). Change one detail of the question into something the unit contradicts (a wrong "
        "value, the wrong mechanism, the opposite advice), so the question rests on a false belief a user might hold. "
        "Give false_premise (the wrong claim, in English), the Vietnamese question, question_en, answer (in Vietnamese: "
        "say the premise is wrong and give the right fact from the unit) and refuting_quote: a verbatim quote from the "
        "unit that shows the premise is false, copied character for character (one sentence or a short run of them).",
    ),
}

_TURNS = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {"role": {"type": "string", "enum": ["user", "assistant"]}, "content": {"type": "string"}},
        "required": ["role", "content"],
        "additionalProperties": False,
    },
}


def _object(**props: Any) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


_TEXT = {"type": "string"}
VARIANT_SCHEMAS: dict[str, dict[str, Any]] = {
    "L2": _object(question=_TEXT, question_en=_TEXT),
    "L7": _object(turns=_TURNS, question=_TEXT, question_en=_TEXT),
    "L6c": _object(false_premise=_TEXT, question=_TEXT, question_en=_TEXT, answer=_TEXT, refuting_quote=_TEXT),
}


def variant_prompt(kind: str, question: str, question_en: str, answer: str, evidence: list[str], unit_texts: list[str]) -> tuple[str, str]:
    """(prompt version, prompt) for one variant of a reviewed question; L6(c) also sees the unit, to quote from it."""
    version, task = _VARIANT_TASKS[kind]
    quotes = "\n".join(f"<evidence>{e}</evidence>" for e in evidence)
    units = "\n\n".join(f"<unit>\n{text}\n</unit>" for text in unit_texts) if kind == "L6c" else ""
    prompt = f"""{task}

Question: {question}
Question (English): {question_en}
Reference answer: {answer}

{quotes}

{units}""".rstrip()
    return version, prompt


L6B_VERSION = "gen-L6b-v1"


def not_in_corpus_prompt(n: int, titles: list[str]) -> tuple[str, str]:
    """L6(b): security questions the corpus does not answer; the document titles say what it covers."""
    listed = "\n".join(f"- {t}" for t in titles)
    prompt = f"""Level L6(b) (security, but not in the corpus). Write exactly {n} question(s) a Vietnamese developer might
ask a web security assistant whose only sources are the OWASP documents listed below, about security topics those
documents do not cover (other standards, specific products or CVEs, network or OS security, compliance, incidents...).
Vary the topics. For each give the Vietnamese question, question_en, and keywords: two to four English terms, specific
to the topic, that any text answering it would contain (they are searched for in the documents to show it is absent).

Documents:
{listed}"""
    return L6B_VERSION, prompt


L6B_SCHEMA: dict[str, Any] = _object(
    items={"type": "array", "items": _object(question=_TEXT, question_en=_TEXT, keywords={"type": "array", "items": _TEXT})}
)

# --- Filter (Gemini) -------------------------------------------------------------------------------

ANSWER_VERSION = "filter-answer-v2"
LEVEL_VERSION = "filter-level-v2"

SYSTEM_JUDGE = "You check evaluation questions for a Vietnamese web security assistant. Answer strictly in the JSON asked for."


#: L4 / L5 answers are drawn from two places: no single quote states the difference or the outcome (v2; round 1 of
#: top-up kept 54 of 173 L4, and judged "session fixation vs hijacking" unanswerable on five quotes about the two).
_COMBINE = """This question compares two things or follows a situation through several steps. No single piece of
evidence needs to state the comparison or the outcome: it is answerable when the evidence says what is needed about
each side (or each step), and you may combine those and infer the difference or the consequence from them. It is not
answerable when the evidence says nothing about one of the sides or steps the question asks about.
"""


def answer_prompt(question: str, evidence: list[str], level: str = "L1") -> str:
    quotes = "\n".join(f"<evidence>{e}</evidence>" for e in evidence)
    combine = _COMBINE if level in ("L4", "L5") else ""
    return f"""Answer the question using ONLY the evidence below, not your own knowledge.
If the evidence does not contain enough to answer it, set answerable to false.
{combine}
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
The question is in Vietnamese and the evidence is English OWASP text. That translation is expected: it does not make
a question L2 on its own. Choose L2 only when the question avoids the document's terms even allowing for translation.

{LEVELS}

Question: {question}

{quotes}"""


LEVEL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"level": {"type": "string", "enum": list(get_args(Level))}},
    "required": ["level"],
    "additionalProperties": False,
}

# --- Pool judge (Gemini), UMBRELA-style ------------------------------------------------------------

#: UMBRELA's 0-3 relevance scale (Upadhyay et al. 2024, after TREC DL), with the steps written out (G-Eval's
#: `evaluation_steps`) and every grade defined in words. Same scale as the "chấm pool" project (guideline, section 7).
JUDGE_VERSION = "judge-umbrela-v1"

SYSTEM_POOL_JUDGE = (
    "You judge passages for the evaluation set of SecLearn, a Vietnamese assistant that answers web application "
    "security questions from OWASP documents. You grade how well one passage answers one question. Answer strictly "
    "in the JSON asked for."
)


def pool_judge_prompt(question: str, question_en: str, chunk: str) -> str:
    return f"""Grade how relevant the passage is to the question, on the integer scale 0-3 below.

Work through these steps in order, and write the first two down before you grade:
1. Read the question (Vietnamese, with an English translation) and decide what the asker wants to know.
2. Identify the information a correct answer needs: the facts, values, mechanisms or steps it must state.
   Write it in "needed".
3. Compare the passage with that information, judging the passage on its own (not the document it comes from):
   which of the needed information does it state, and is it stated clearly or buried among other content?
   Write what you found, or that nothing was found, in "found".
4. Only then pick the grade whose definition fits best, and write it in "grade".

Grades:
3 = The passage is dedicated to the question and states the answer directly; it is enough to answer it.
2 = The passage holds an answer, but it is partial, unclear, or mixed in with a lot of unrelated information.
1 = The passage is on the question's topic but does not answer it.
0 = The passage has nothing to do with the question.

Do not reward shared keywords alone: a passage that names the same mechanism without saying what the question asks
is a 1, not a 2. Use no knowledge of your own about the right answer beyond what the passage states.

Question: {question}
Question (English): {question_en}

<passage>
{chunk}
</passage>"""


POOL_JUDGE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "needed": {"type": "string"},
        "found": {"type": "string"},
        "grade": {"type": "integer", "minimum": 0, "maximum": 3},
    },
    "required": ["needed", "found", "grade"],
    "additionalProperties": False,
}


def question_prompt_versions() -> list[str]:
    """The prompt versions a question can be made and filtered with: generation per level, L6(a), L6(b), the variants,
    the two filter checks."""
    return (
        [version for version, _ in _TASKS.values()]
        + [OOD_VERSION, L6B_VERSION]
        + [version for version, _ in _VARIANT_TASKS.values()]
        + [ANSWER_VERSION, LEVEL_VERSION]
    )
