"""The eval set's MAJOR.MINOR.PATCH version and its CHANGELOG (spec user story 70): every number reported names
the version it was measured on, and the CHANGELOG says what changed between two versions."""

from __future__ import annotations

import re
from dataclasses import dataclass
from itertools import pairwise
from typing import Literal

from .io import FormatError

#: What changed → which part of the version goes up. MAJOR: another snapshot, or gold means something else
#: (other relevance rule, other level definitions); MINOR: questions added; PATCH: labels corrected.
Change = Literal["snapshot", "gold_meaning", "questions", "labels"]
BUMP: dict[Change, str] = {"snapshot": "major", "gold_meaning": "major", "questions": "minor", "labels": "patch"}

_RELEASE = re.compile(r"^## \[([^\]]*)\](?: - (.*))?$", re.MULTILINE)
_SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@dataclass(frozen=True)
class Release:
    version: str
    #: None while the entry is not released yet.
    date: str | None
    body: str


def _parts(version: str) -> tuple[int, int, int]:
    m = _SEMVER.match(version)
    if m is None:
        raise FormatError(f"version {version!r} is not MAJOR.MINOR.PATCH")
    return int(m[1]), int(m[2]), int(m[3])


def read_changelog(text: str) -> list[Release]:
    """`## [x.y.z] - YYYY-MM-DD` entries, newest first; any other date text marks the entry unreleased."""
    heads = list(_RELEASE.finditer(text))
    if not heads:
        raise FormatError("CHANGELOG: no `## [x.y.z] - date` entry")
    out: list[Release] = []
    for i, m in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        date = (m[2] or "").strip()
        out.append(Release(version=m[1], date=date if _DATE.match(date) else None, body=text[m.end() : end].strip()))
    for newer, older in pairwise(out):
        if _parts(newer.version) <= _parts(older.version):
            raise FormatError(f"CHANGELOG: {newer.version} listed above {older.version}; newest must come first")
    _parts(out[-1].version)
    return out


def bump(version: str, change: Change) -> str:
    major, minor, patch = _parts(version)
    part = BUMP[change]
    if part == "major":
        return f"{major + 1}.0.0"
    if part == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"
