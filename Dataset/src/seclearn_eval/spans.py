"""Character spans on snapshot markdown: finding quotes, chunk coverage, re-anchoring onto a new snapshot."""

from __future__ import annotations

import re

from .schema import Span

#: How far around a span's offsets a quote is looked for before it counts as lost.
QUOTE_WINDOW = 200
#: A chunk covers a gold span when it holds at least this share of the span (or all of it).
COVER_RATIO = 0.5

_WS = re.compile(r"\s+")


def normalize(text: str) -> str:
    return _WS.sub(" ", text).strip()


def _normalized_with_map(text: str) -> tuple[str, list[int]]:
    """`text` with whitespace runs collapsed to one space, and for each kept character its index in `text`."""
    out: list[str] = []
    index: list[int] = []
    i = 0
    while i < len(text):
        if text[i].isspace():
            j = i
            while j < len(text) and text[j].isspace():
                j += 1
            if out:
                out.append(" ")
                index.append(i)
            i = j
        else:
            out.append(text[i])
            index.append(i)
            i += 1
    if out and out[-1] == " ":
        out.pop()
        index.pop()
    return "".join(out), index


def find_quote(markdown: str, quote: str, start: int = 0, end: int | None = None) -> list[tuple[int, int]]:
    """Every `(char_start, char_end)` in `markdown[start:end]` whose text is `quote`, ignoring whitespace differences."""
    end = len(markdown) if end is None else end
    needle = normalize(quote)
    if not needle:
        return []
    hay, index = _normalized_with_map(markdown[start:end])
    found: list[tuple[int, int]] = []
    at = hay.find(needle)
    while at >= 0:
        last = index[at + len(needle) - 1]
        found.append((start + index[at], start + last + 1))
        at = hay.find(needle, at + 1)
    return found


def quote_at(markdown: str, span: Span, quote: str) -> bool:
    return normalize(markdown[span.char_start : span.char_end]) == normalize(quote)


def overlap(a: Span, b: Span) -> int:
    return max(0, min(a.char_end, b.char_end) - max(a.char_start, b.char_start))


def covers(chunk: Span, gold: Span) -> bool:
    length = gold.char_end - gold.char_start
    return overlap(chunk, gold) >= COVER_RATIO * length
