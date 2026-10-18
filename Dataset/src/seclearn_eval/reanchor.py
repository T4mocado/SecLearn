"""Moving gold spans onto a new snapshot by finding their quotes again (the KILT approach), and
reporting how many had to move or were lost, so a snapshot change never drops gold silently."""

from __future__ import annotations

from dataclasses import dataclass, field

from .schema import Question
from .snapshot import Snapshot
from .spans import find_quote, quote_at


@dataclass
class ReanchorReport:
    kept: int = 0
    reanchored: int = 0
    dropped: int = 0
    #: "question id: why" for every dropped span.
    lost: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.kept + self.reanchored + self.dropped

    def summary(self) -> str:
        share = lambda n: f"{n / self.total:.1%}" if self.total else "-"  # noqa: E731
        return (
            f"{self.total} spans: {self.kept} unchanged, {self.reanchored} re-anchored ({share(self.reanchored)}), "
            f"{self.dropped} dropped ({share(self.dropped)})"
        )


def reanchor(questions: list[Question], snap: Snapshot) -> tuple[list[Question], ReanchorReport]:
    report = ReanchorReport()
    out: list[Question] = []
    for q in questions:
        spans = []
        for span in q.gold_evidence:
            doc = snap.document(span.doc_key)
            md = snap.markdown.get(span.doc_key)
            if doc is None or md is None:
                report.dropped += 1
                report.lost.append(f"{q.id}: {span.doc_key} not in snapshot {snap.snapshot_id}")
                continue
            if span.md_sha256 == doc.md_sha256 and quote_at(md, span, span.quote):
                report.kept += 1
                spans.append(span)
                continue
            found = find_quote(md, span.quote)
            if len(found) == 1:
                report.reanchored += 1
                start, end = found[0]
                spans.append(span.model_copy(update={"char_start": start, "char_end": end, "md_sha256": doc.md_sha256}))
            else:
                report.dropped += 1
                report.lost.append(f"{q.id}: quote found {len(found)} times in {span.doc_key}")
        out.append(q.model_copy(update={"gold_evidence": spans}))
    return out, report
