"""The checks run before every measurement (spec user story 59): silent breakage, such as NIST leaving
the corpus without anyone noticing, fails here instead of in a thesis table."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from .io import FormatError, read_json, read_jsonl, read_questions
from .schema import GoldSpan, Question, QuestionFileHeader, RunConfig, SamplePlan, Unit
from .snapshot import Snapshot, load_snapshot, verify_snapshot
from .spans import QUOTE_WINDOW, covers, find_quote, overlap, quote_at

#: A plan cell may differ from its target by this share before the check fails.
PLAN_TOLERANCE = 0.05
#: The question files a bare `check` reads: the eval set as `split` writes it.
SPLIT_FILES = ("dev.jsonl", "test.jsonl")

CHECKS = (
    "format",  # 1. files match the schema, ids unique
    "snapshot",  # 2. markdown sha256 / counts match the manifest, gold cites that markdown
    "quote",  # 3. each gold quote is found exactly once around its offsets
    "coverage",  # 4. each gold span has a chunk covering >= 50% of it
    "excluded",  # 5. no gold in an excluded region (TOC, payload appendix, references)
    "plan",  # 6. distribution within 5% of the sample plan
    "split",  # 7. no seed_id in two splits
    "run",  # 8. every run has a full config, from committed code
    "canary",  # 9. every question file carries the snapshot's canary
)


@dataclass(frozen=True)
class Problem:
    check: str
    message: str

    def __str__(self) -> str:
        return f"[{self.check}] {self.message}"


@dataclass
class CheckInputs:
    snapshot: Path
    questions: list[Path] = field(default_factory=list)
    units: Path | None = None
    plan: Path | None = None
    runs: list[Path] = field(default_factory=list)


def discover(snapshot: Path, root: Path, version: str) -> CheckInputs:
    """Every input found at its usual place: `<snapshot>/units.jsonl`, the split files `questions/<version>/{dev,test}.jsonl`
    and `sample-plan.json`, `runs/*/`. A bare `check --snapshot` once passed with 7 of 9 checks never run.
    Only the split files: the working files beside them (candidates, filtered, pilot, variants…) are drafts of the same
    questions, and candidates are not question files at all."""
    qdir = root / "questions" / version
    units = snapshot / "units.jsonl"
    plan = qdir / "sample-plan.json"
    runs = root / "runs"
    return CheckInputs(
        snapshot=snapshot,
        questions=[p for name in SPLIT_FILES if (p := qdir / name).is_file()],
        units=units if units.is_file() else None,
        plan=plan if plan.is_file() else None,
        runs=sorted(p for p in runs.iterdir() if p.is_dir()) if runs.is_dir() else [],
    )


def skipped(inputs: CheckInputs) -> list[str]:
    """The checks these inputs leave out, and why: a pass must say what it did not look at."""
    out: list[str] = []
    if not inputs.questions:
        out.append("quote, coverage, excluded, split, canary: no question files")
    elif not inputs.units:
        out.append("excluded: no units.jsonl")
    if not inputs.plan:
        out.append("plan: no sample-plan.json")
    elif not inputs.questions:
        out.append("plan: no question files to compare with the plan")
    if not inputs.runs:
        out.append("run: no runs/<run_id>/ directories")
    return out


def _kept(q: Question) -> bool:
    return q.review.status != "rejected"


def _check_spans(snap: Snapshot, q: Question, span: GoldSpan, units: list[Unit], out: list[Problem]) -> None:
    where = f"{q.id} span {span.doc_key}:{span.char_start}-{span.char_end}"
    doc = snap.document(span.doc_key)
    md = snap.markdown.get(span.doc_key)
    if doc is None or md is None:
        out.append(Problem("snapshot", f"{where}: document not in snapshot {snap.snapshot_id}"))
        return
    if span.md_sha256 != doc.md_sha256:
        out.append(Problem("snapshot", f"{where}: cites other markdown (md_sha256 differs); run `reanchor`"))
        return
    if span.char_end > len(md):
        out.append(Problem("quote", f"{where}: past the end of the markdown ({len(md)})"))
        return

    lo, hi = max(0, span.char_start - QUOTE_WINDOW), min(len(md), span.char_end + QUOTE_WINDOW)
    near = find_quote(md, span.quote, lo, hi)
    if not quote_at(md, span, span.quote):
        if len(near) == 1:
            out.append(Problem("quote", f"{where}: quote found at {near[0][0]}-{near[0][1]}, not at the offsets; run `reanchor`"))
        else:
            out.append(Problem("quote", f"{where}: quote not at the offsets ({len(near)} match(es) nearby)"))
        return
    if len(near) != 1:
        out.append(Problem("quote", f"{where}: quote appears {len(near)} times around the offsets, so the span is ambiguous"))

    if not any(covers(c, span) for c in snap.chunks_of(span.doc_key)):
        out.append(Problem("coverage", f"{where}: no {snap.chunker_version} chunk covers >= 50% of the span"))
    for u in units:
        if u.doc_key == span.doc_key and not u.sampleable and overlap(u, span) > 0:
            out.append(Problem("excluded", f"{where}: inside excluded unit {u.unit_id} ({u.exclude_reason or 'excluded'})"))


def _check_plan(plan: SamplePlan, questions: list[Question], out: list[Problem]) -> None:
    def key(split: str, cluster: str | None, level: str, kind: str | None) -> tuple[str, str | None, str, str | None]:
        return split, cluster, level, kind

    actual = Counter(key(q.split, q.cluster, q.strata.level, q.strata.l6_kind) for q in questions if _kept(q))
    targets = {key(c.split, c.cluster, c.level, c.l6_kind): c.target for c in plan.cells}
    for cell, target in sorted(targets.items(), key=str):
        n = actual.get(cell, 0)
        if abs(n - target) > PLAN_TOLERANCE * target:
            out.append(Problem("plan", f"cell {cell}: {n} questions, plan wants {target} (±{PLAN_TOLERANCE:.0%})"))
    for cell in sorted(set(actual) - set(targets), key=str):
        out.append(Problem("plan", f"cell {cell}: {actual[cell]} questions, not in the plan"))


def _check_run(run_dir: Path, snap: Snapshot, out: list[Problem]) -> None:
    path = run_dir / "config.json"
    if not path.is_file():
        out.append(Problem("run", f"{run_dir}: no config.json"))
        return
    try:
        config = read_json(path, RunConfig)
    except FormatError as err:
        out.append(Problem("run", str(err)))
        return
    if config.git_dirty:
        out.append(Problem("run", f"{run_dir}: run from uncommitted code (git_dirty), not reproducible"))
    if config.snapshot_id != snap.snapshot_id:
        out.append(Problem("run", f"{run_dir}: run on snapshot {config.snapshot_id}, checking {snap.snapshot_id}"))
    if config.chunker_version != snap.chunker_version:
        out.append(Problem("run", f"{run_dir}: chunker {config.chunker_version}, snapshot has {snap.chunker_version}"))


def run_checks(inputs: CheckInputs) -> list[Problem]:
    out: list[Problem] = []
    try:
        snap = load_snapshot(inputs.snapshot)
    except (FormatError, OSError) as err:
        return [Problem("format", f"snapshot: {err}")]
    out += [Problem("snapshot", p) for p in verify_snapshot(snap)]
    if snap.manifest.source_git_dirty:
        commit = snap.manifest.source_git_commit
        out.append(Problem("snapshot", f"snapshot {snap.snapshot_id} was exported from uncommitted app code ({commit}, dirty)"))

    units: list[Unit] = []
    if inputs.units:
        try:
            units = read_jsonl(inputs.units, Unit)
        except (FormatError, OSError) as err:
            out.append(Problem("format", str(err)))
        ids = Counter(u.unit_id for u in units)
        out += [Problem("format", f"unit {i}: listed {n} times") for i, n in ids.items() if n > 1]

    files: list[tuple[Path, QuestionFileHeader, list[Question]]] = []
    for path in inputs.questions:
        try:
            header, questions = read_questions(path)
        except (FormatError, OSError) as err:
            message = str(err)
            out.append(Problem("canary" if "header" in message else "format", message))
            continue
        files.append((path, header, questions))
        if header.canary != snap.manifest.canary:
            out.append(Problem("canary", f"{path}: canary differs from the snapshot's"))
        if header.snapshot_id != snap.snapshot_id:
            out.append(Problem("snapshot", f"{path}: written for snapshot {header.snapshot_id}, checking {snap.snapshot_id}"))

    questions = [q for _, _, qs in files for q in qs]
    ids = Counter(q.id for q in questions)
    out += [Problem("format", f"question {i}: id used {n} times") for i, n in ids.items() if n > 1]

    for q in questions:
        if _kept(q):
            for span in q.gold_evidence:
                _check_spans(snap, q, span, units, out)

    splits: dict[str, set[str]] = defaultdict(set)
    for q in questions:
        splits[q.seed_id].add(q.split)
    out += [Problem("split", f"seed {s}: in splits {sorted(v)}") for s, v in sorted(splits.items()) if len(v) > 1]

    if inputs.plan and inputs.questions:
        try:
            _check_plan(read_json(inputs.plan, SamplePlan), questions, out)
        except (FormatError, OSError) as err:
            out.append(Problem("format", str(err)))

    for run_dir in inputs.runs:
        _check_run(run_dir, snap, out)
    return out
