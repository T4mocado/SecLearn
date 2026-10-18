"""One CLI, one subcommand per pipeline step, each reading files and writing files."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .check import CheckInputs, run_checks
from .io import FormatError, read_questions, write_questions
from .reanchor import reanchor
from .snapshot import load_snapshot, verify_snapshot

#: Pipeline steps still to build, and the ticket in Dataset/.scratch/eval-set-v1/issues/ that builds them.
PLANNED = {
    "clusters": "04",
    "plan": "04",
    "generate": "05",
    "filter": "05",
    "annotate": "06",
    "pool": "08",
    "judge": "08",
    "qrels": "08",
    "score": "10",
    "report": "10",
    "card": "11",
}


def _snapshot(args: argparse.Namespace) -> int:
    snap = load_snapshot(args.dir)
    problems = verify_snapshot(snap)
    print(
        f"Snapshot {snap.snapshot_id}: {len(snap.manifest.documents)} documents, {len(snap.chunks)} chunks, "
        f"chunker {snap.chunker_version}, app commit {snap.manifest.source_git_commit}"
        + (" (dirty)" if snap.manifest.source_git_dirty else "")
    )
    for p in problems:
        print(f"  {p}")
    print("OK" if not problems else f"{len(problems)} problem(s)")
    return 1 if problems else 0


def _check(args: argparse.Namespace) -> int:
    inputs = CheckInputs(snapshot=args.snapshot, questions=args.questions, units=args.units, plan=args.plan, runs=args.runs)
    problems = run_checks(inputs)
    for p in problems:
        print(p)
    print("check: OK" if not problems else f"check: {len(problems)} problem(s)")
    return 1 if problems else 0


def _reanchor(args: argparse.Namespace) -> int:
    snap = load_snapshot(args.snapshot)
    header, questions = read_questions(args.questions)
    moved, report = reanchor(questions, snap)
    write_questions(args.out, header.model_copy(update={"snapshot_id": snap.snapshot_id}), moved)
    print(report.summary())
    for line in report.lost:
        print(f"  lost: {line}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="seclearn-eval", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("snapshot", help="load a corpus snapshot and check it against its manifest")
    p.add_argument("dir", type=Path, help="corpus/<snapshot_id>/")
    p.set_defaults(run=_snapshot)

    p = sub.add_parser("check", help="all checks to run before a measurement; exit 1 on any problem")
    p.add_argument("--snapshot", type=Path, required=True)
    p.add_argument("--questions", type=Path, nargs="*", default=[], help="question files (dev.jsonl, test.jsonl)")
    p.add_argument("--units", type=Path, help="units.jsonl, for excluded regions")
    p.add_argument("--plan", type=Path, help="sample-plan.json")
    p.add_argument("--runs", type=Path, nargs="*", default=[], help="runs/<run_id>/ directories")
    p.set_defaults(run=_check)

    p = sub.add_parser("reanchor", help="move gold spans onto a snapshot by finding their quotes again")
    p.add_argument("--snapshot", type=Path, required=True)
    p.add_argument("--questions", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.set_defaults(run=_reanchor)

    for name, ticket in PLANNED.items():
        p = sub.add_parser(name, help=f"not built yet (ticket {ticket})")
        p.set_defaults(run=lambda _a, name=name, ticket=ticket: _planned(name, ticket))
    return parser


def _planned(name: str, ticket: str) -> int:
    print(f"`{name}` is not built yet: see ticket {ticket} in Dataset/.scratch/eval-set-v1/issues/", file=sys.stderr)
    return 2


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.run(args)
    except FormatError as err:
        print(f"format error: {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
