"""Sampling units on snapshot markdown (spec user stories 17-18): cheat sheet `##` sections, WSTG test
cases, and the parts of WSTG outside the test cases, each with its offsets, cluster and chunk count.
Table of contents, payload appendices and reference lists are units too, marked unsampleable, so `check`
can refuse gold that lies in them."""

from __future__ import annotations

import bisect
import re
from dataclasses import dataclass

from .clusters import WSTG_KEY
from .schema import ClusterId, ClusterMap, Unit, UnitKind
from .snapshot import Snapshot

_HEADING = re.compile(r"^## (.+)$", re.M)
_WSTG_CASE = re.compile(r"^## (WSTG-([A-Z]{4})-\d{2}) (.+)$", re.M)

#: Sections that say nothing alone ("## Do", "## Cons"): part of the section before them, as the chunker treats them.
GENERIC = re.compile(
    r"^(?:pros|cons|examples?|description|overview|context|approach|summary|background|usage|notes?|do|don'?t|"
    r"do'?s and don'?ts|recommendations?|mitigations?|remediation|tools|symptom|how to prevent|implementation tips|"
    r"defen[cs]e|objective|ideal condition of application of the approach|use case)$",
    re.I,
)
REFERENCES = re.compile(
    r"^(?:references?|further reading|related articles|related cheat ?sheets|other cheat ?sheets|bibliography|sources|"
    r"external references|authors?(?: and primary editors)?|mapping to owasp projects)$",
    re.I,
)
#: Body text (heading lines aside) below this: a heading-only section, joined to the one after it.
MIN_BODY = 50
#: A WSTG test case whose body is only this line points to another one.
WSTG_STUB = "This content has been merged into"


@dataclass
class _Region:
    start: int
    end: int
    kind: UnitKind
    title: str
    cluster: ClusterId | None
    sampleable: bool = True
    reason: str | None = None


def _body_chars(text: str) -> int:
    return len("".join(line for line in text.splitlines() if not line.startswith("#")).strip())


def _cheat_sheet_regions(md: str, cluster: ClusterId) -> list[_Region]:
    heads = list(_HEADING.finditer(md))
    regions: list[_Region] = []
    if heads and _body_chars(md[: heads[0].start()]) >= MIN_BODY:
        regions.append(_Region(0, heads[0].start(), "section", "(preamble)", cluster))
    for i, h in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(md)
        title = h.group(1).strip()
        prev = regions[-1] if regions else None
        if REFERENCES.match(title):
            regions.append(_Region(h.start(), end, "section", title, cluster, False, "references"))
        elif prev and (GENERIC.match(title) or (prev.sampleable and _body_chars(md[prev.start : prev.end]) < MIN_BODY)):
            if _body_chars(md[prev.start : prev.end]) < MIN_BODY and not GENERIC.match(title):
                prev.title = title
            prev.end = end
        else:
            regions.append(_Region(h.start(), end, "section", title, cluster))
    return regions


def _line(md: str, text: str, after: int = 0) -> int | None:
    m = re.compile(rf"^{re.escape(text)}$", re.M).search(md, after)
    return m.start() if m else None


#: WSTG appendices after Reporting, in order: (line that starts it, kept?, reason when not).
WSTG_APPENDICES = [
    ("Testing Tools Resource", False, "tool list"),
    ("Suggested Reading", False, "references"),
    ("Fuzz Vectors", False, "payloads"),
    ("Encoded Injection", False, "payloads"),
    ("History", False, "history"),
    ("Leveraging Dev Tools", True, None),
]


def _wstg_regions(md: str, cmap: ClusterMap, warnings: list[str]) -> list[_Region]:
    front = cmap.wstg_front_matter
    cases = list(_WSTG_CASE.finditer(md))
    if not cases:
        warnings.append("wstg: no '## WSTG-XXXX-NN' headings; was the snapshot made before the extraction fix?")
        return [_Region(0, len(md), "wstg_front", "(whole guide)", front)]
    regions: list[_Region] = []

    foreword = _line(md, "Foreword by Eoin Keary")
    if foreword is None or foreword > cases[0].start():
        warnings.append("wstg: 'Foreword by Eoin Keary' not found; table of contents not excluded")
        foreword = 0
    else:
        regions.append(_Region(0, foreword, "wstg_front", "Table of Contents", front, False, "table of contents"))
    regions.append(_Region(foreword, cases[0].start(), "wstg_front", "Foreword, Introduction, Testing Framework", front))

    # The chapter's title line, with "About this Section" a paragraph below it.
    last = cases[-1].start()
    m = next(
        (r for r in re.finditer(r"^Reporting$", md[last:], re.M) if "\nAbout this Section\n" in md[last + r.start() : last + r.start() + 2000]),
        None,
    )
    reporting = last + m.start() if m else len(md)
    if not m:
        warnings.append("wstg: Reporting chapter not found; the last test case runs to the end")
    for i, c in enumerate(cases):
        end = cases[i + 1].start() if i + 1 < len(cases) else reporting
        group = c.group(2)
        cluster = cmap.wstg_groups.get(group)
        if cluster is None:
            warnings.append(f"wstg: group {group} has no cluster")
        title = f"{c.group(1)} {c.group(3).strip()}"
        # "This content has been merged into: …" (INFO-09, INPV-03): a one-line stub, nothing to ask about.
        body = md[c.end() : end].strip()
        stub = body.startswith(WSTG_STUB) and "\n" not in body
        regions.append(_Region(c.start(), end, "wstg_case", title, cluster, not stub, "stub" if stub else None))
    if not m:
        return regions

    listing = re.compile(r"^Appendix\nAppendix A\. ", re.M).search(md, reporting)
    regions.append(_Region(reporting, listing.start() if listing else len(md), "wstg_back", "Reporting", front))
    if not listing:
        warnings.append("wstg: appendix list not found after Reporting")
        return regions
    starts: list[tuple[int, str, bool, str | None]] = []
    at = listing.end()
    for title, keep, reason in WSTG_APPENDICES:
        pos = _line(md, title, at)
        if pos is None:
            warnings.append(f"wstg: appendix '{title}' not found")
            continue
        starts.append((pos, title, keep, reason))
        at = pos + 1
    first = starts[0][0] if starts else len(md)
    regions.append(_Region(listing.start(), first, "wstg_back", "Appendix list", front, False, "table of contents"))
    for j, (pos, title, keep, reason) in enumerate(starts):
        end = starts[j + 1][0] if j + 1 < len(starts) else len(md)
        regions.append(_Region(pos, end, "wstg_back", f"Appendix: {title}", front, keep, reason))
    return regions


def build_units(snap: Snapshot, cmap: ClusterMap) -> tuple[list[Unit], list[str]]:
    """Units of every document in the snapshot, in document order, and warnings for anything not found."""
    warnings: list[str] = []
    units: list[Unit] = []
    for doc in snap.manifest.documents:
        md = snap.markdown.get(doc.doc_key, "")
        if doc.doc_key == WSTG_KEY:
            regions = _wstg_regions(md, cmap, warnings)
        elif doc.doc_key in cmap.documents:
            regions = _cheat_sheet_regions(md, cmap.documents[doc.doc_key])
        else:
            warnings.append(f"{doc.doc_key}: not in the cluster file; no units")
            continue
        spans = [(c.char_start, c.char_end) for c in snap.chunks_of(doc.doc_key)]
        mids = sorted((a + b) // 2 for a, b in spans)
        for n, r in enumerate(regions):
            touching = sum(1 for a, b in spans if a < r.end and b > r.start)
            weight = bisect.bisect_left(mids, r.end) - bisect.bisect_left(mids, r.start)
            if r.kind == "wstg_case":
                unit_id = f"{doc.doc_key}#{r.title.split()[0]}"
            else:
                unit_id = f"{doc.doc_key}#{r.kind}{n:02d}" if r.kind != "section" else f"{doc.doc_key}#s{n:02d}"
            units.append(
                Unit(
                    unit_id=unit_id,
                    doc_key=doc.doc_key,
                    kind=r.kind,
                    title=r.title,
                    cluster=r.cluster,
                    char_start=r.start,
                    char_end=max(r.end, r.start + 1),
                    chunks=touching,
                    weight_chunks=weight,
                    sampleable=r.sampleable,
                    exclude_reason=r.reason,
                )
            )
    return units, warnings


def unit_title(unit: Unit, snap: Snapshot) -> str:
    """How a unit is named to annotators: its document's title, then its own (the review task's source heading, an L4 cell)."""
    doc = snap.document(unit.doc_key)
    return f"{doc.title if doc else unit.doc_key} › {unit.title}"
