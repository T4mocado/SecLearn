"""One CLI, one subcommand per pipeline step, each reading files and writing files."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import annotate
from .check import CheckInputs, run_checks
from .clusters import build_cluster_map
from .io import FormatError, read_json, read_jsonl, read_questions, write_json, write_jsonl, write_questions
from .plan import PlanParams, build_plan, plan_table
from .reanchor import reanchor
from .schema import ClusterMap, Label, PoolEntry, Unit
from .snapshot import load_snapshot, verify_snapshot
from .units import build_units

#: Pipeline steps still to build, and the ticket in Dataset/.scratch/eval-set-v1/issues/ that builds them.
PLANNED = {
    "generate": "05",
    "filter": "05",
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


def _clusters(args: argparse.Namespace) -> int:
    if args.out.exists() and not args.force:
        print(f"{args.out} exists (it may hold your review); --force to overwrite", file=sys.stderr)
        return 1
    cmap = build_cluster_map(load_snapshot(args.snapshot).manifest)
    write_json(args.out, cmap)
    counts: dict[str, int] = {}
    for c in cmap.documents.values():
        counts[c] = counts.get(c, 0) + 1
    print(f"{len(cmap.documents)} cheat sheets → {args.out}: " + ", ".join(f"{c} {n}" for c, n in sorted(counts.items())))
    print("Review it before `units` / `plan`: the clusters are guessed from document names.")
    return 0


def _units(args: argparse.Namespace) -> int:
    snap = load_snapshot(args.snapshot)
    units, warnings = build_units(snap, read_json(args.clusters, ClusterMap))
    out = args.out or args.snapshot / "units.jsonl"
    write_jsonl(out, units)
    for w in warnings:
        print(f"warning: {w}")
    excluded = [u for u in units if not u.sampleable]
    print(f"{len(units)} units ({len(units) - len(excluded)} sampleable, {len(excluded)} excluded) → {out}")
    return 1 if warnings else 0


def _plan(args: argparse.Namespace) -> int:
    snap = load_snapshot(args.snapshot)
    units = read_jsonl(args.units or args.snapshot / "units.jsonl", Unit)
    params = PlanParams(
        seed=args.seed,
        test_answerable=args.test_answerable,
        test_floor=args.test_floor,
        dev_answerable=args.dev_answerable,
        cap=args.cap,
    )
    plan = build_plan(snap.snapshot_id, units, params)
    write_json(args.out, plan)
    tables = f"{plan_table(plan, 'test')}\n\n{plan_table(plan, 'dev')}\n"
    header = f"# Sample plan {snap.snapshot_id}, seed {plan.seed}\n\n"
    args.out.with_suffix(".md").write_text(header + tables, encoding="utf-8", newline="\n")
    print(tables)
    print(f"{len(plan.slots)} slots → {args.out} (tables: {args.out.with_suffix('.md')})")
    return 0


def _annotate_export(args: argparse.Namespace) -> int:
    snap = load_snapshot(args.snapshot)
    _, questions = read_questions(args.questions)
    version = annotate.guideline_version(args.guideline)
    if args.kind == "review":
        units = read_jsonl(args.units or args.snapshot / "units.jsonl", Unit)
        tasks = annotate.review_tasks(questions, snap, units, version)
    else:
        if args.pool is None:
            print("--pool is required for --kind pool", file=sys.stderr)
            return 1
        tasks = annotate.pool_tasks(read_jsonl(args.pool, PoolEntry), questions, snap, version)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(tasks, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(tasks)} {args.kind} tasks (guideline {version}, snapshot {snap.snapshot_id}) → {args.out}")
    print(f"Import into the Label Studio project whose labeling config is annotation/{args.kind}.xml.")
    return 0


def _annotate_import(args: argparse.Namespace) -> int:
    snap = load_snapshot(args.snapshot)
    annotations = annotate.read_export(args.export)
    if args.kind == "review":
        if args.questions is None or args.out is None:
            print("--questions and --out are required for --kind review", file=sys.stderr)
            return 1
        header, questions = read_questions(args.questions)
        reviewed, new = annotate.import_review(questions, annotations, snap, args.offset_unit)
        write_questions(args.out, header, reviewed)
        print(f"{len(new)} reviewed of {len(questions)} questions → {args.out}")
    else:
        new = annotate.import_pool(annotations, snap)
    old = read_jsonl(args.labels, Label) if args.labels.exists() else []
    merged = annotate.merge_labels(old, new)
    write_jsonl(args.labels, merged)
    print(f"{len(merged) - len(old)} new labels → {args.labels}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="seclearn-eval", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("snapshot", help="load a corpus snapshot and check it against its manifest")
    p.add_argument("dir", type=Path, help="corpus/<snapshot_id>/")
    p.set_defaults(run=_snapshot)

    p = sub.add_parser("clusters", help="starting cluster file from document names, for you to review")
    p.add_argument("--snapshot", type=Path, required=True)
    p.add_argument("--out", type=Path, default=Path("clusters.json"))
    p.add_argument("--force", action="store_true", help="overwrite an existing (maybe reviewed) file")
    p.set_defaults(run=_clusters)

    p = sub.add_parser("units", help="sampling units with offsets, clusters and excluded regions")
    p.add_argument("--snapshot", type=Path, required=True)
    p.add_argument("--clusters", type=Path, default=Path("clusters.json"))
    p.add_argument("--out", type=Path, help="default: <snapshot>/units.jsonl")
    p.set_defaults(run=_units)

    p = sub.add_parser("plan", help="sample plan, method R: slots per cluster, unit and level")
    p.add_argument("--snapshot", type=Path, required=True)
    p.add_argument("--units", type=Path, help="default: <snapshot>/units.jsonl")
    p.add_argument("--out", type=Path, default=Path("questions/v1.0/sample-plan.json"))
    defaults = PlanParams()
    p.add_argument("--seed", type=int, default=defaults.seed)
    p.add_argument("--test-answerable", type=int, default=defaults.test_answerable)
    p.add_argument("--test-floor", type=int, default=defaults.test_floor)
    p.add_argument("--dev-answerable", type=int, default=defaults.dev_answerable)
    p.add_argument("--cap", type=int, default=defaults.cap)
    p.set_defaults(run=_plan)

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

    p = sub.add_parser("annotate", help="questions / pools ↔ Label Studio tasks and exports")
    asub = p.add_subparsers(dest="direction", required=True)
    e = asub.add_parser("export", help="Label Studio tasks to import into a project")
    e.add_argument("--kind", choices=["review", "pool"], default="review")
    e.add_argument("--snapshot", type=Path, required=True)
    e.add_argument("--questions", type=Path, required=True)
    e.add_argument("--units", type=Path, help="review: default <snapshot>/units.jsonl")
    e.add_argument("--pool", type=Path, help="pool: pool.jsonl")
    e.add_argument("--guideline", type=Path, default=Path("annotation/guideline-v0.md"), help="its `guideline_version:` line goes on every label")
    e.add_argument("--out", type=Path, required=True)
    e.set_defaults(run=_annotate_export)
    i = asub.add_parser("import", help="a Label Studio JSON export back into questions and labels")
    i.add_argument("--kind", choices=["review", "pool"], default="review")
    i.add_argument("--snapshot", type=Path, required=True)
    i.add_argument("--export", type=Path, required=True, help="Label Studio JSON export (annotation/exports/raw/)")
    i.add_argument("--questions", type=Path, help="review: the file the tasks were made from")
    i.add_argument("--out", type=Path, help="review: reviewed question file")
    i.add_argument("--labels", type=Path, default=Path("judgments/labels.jsonl"), help="labels accumulate here")
    i.add_argument("--offset-unit", choices=["utf16", "codepoint"], default="utf16", help="what Label Studio's region offsets count")
    i.set_defaults(run=_annotate_import)

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
