"""One CLI, one subcommand per pipeline step, each reading files and writing files."""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

from . import annotate
from .check import CheckInputs, discover, run_checks, skipped
from .clusters import build_cluster_map
from .filter import candidates_to_questions, run_filter
from .generate import generate
from .io import (
    FormatError,
    read_json,
    read_jsonl,
    read_qrels,
    read_questions,
    read_run,
    write_json,
    write_jsonl,
    write_plain_json,
    write_questions,
    write_text,
)
from .llm import CachedClient, LLMError, make_clients
from .plan import PlanParams, build_plan, plan_table
from .reanchor import reanchor
from .schema import (
    AnswerLine,
    Candidate,
    ClusterMap,
    Label,
    LLMConfig,
    PoolEntry,
    QuestionFileHeader,
    SamplePlan,
    ScoreReport,
    Unit,
)
from .snapshot import load_snapshot, verify_snapshot
from .units import build_units

#: Pipeline steps still to build, and the ticket in Dataset/.scratch/eval-set-v1/issues/ that builds them.
PLANNED = {
    "pool": "08",
    "judge": "08",
    "qrels": "08",
    "card": "11",
}


#: Where `units` writes by default, inside the snapshot directory; every `--units` defaults to it.
UNITS_FILE = "units.jsonl"


def _units_file(args: argparse.Namespace) -> Path:
    """`--units`, or the units file `units` writes next to the snapshot."""
    return args.units or args.snapshot / UNITS_FILE


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
    found = discover(args.snapshot, args.root, args.version)
    inputs = CheckInputs(
        snapshot=args.snapshot,
        questions=found.questions if args.questions is None else args.questions,
        units=args.units or found.units,
        plan=args.plan or found.plan,
        runs=found.runs if args.runs is None else args.runs,
    )
    print(
        f"checking: {len(inputs.questions)} question file(s), units {inputs.units or '-'}, "
        f"plan {inputs.plan or '-'}, {len(inputs.runs)} run(s)"
    )
    problems = run_checks(inputs)
    for p in problems:
        print(p)
    for s in skipped(inputs):
        print(f"skipped: {s}")
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


def _score(args: argparse.Namespace) -> int:
    from .score import MIN_GRADE, ScoreError, ScoreInputs, score

    _, questions = read_questions(args.questions)
    run_dir: Path = args.run_dir
    answers_file = run_dir / "answers.jsonl"
    inputs = ScoreInputs(
        run_id=run_dir.name,
        questions=questions,
        qrels=read_qrels(args.qrels),
        run=read_run(run_dir / "run.trec"),
        questions_file=args.questions.as_posix(),
        qrels_file=args.qrels.as_posix(),
        baseline_id=args.baseline.name if args.baseline else None,
        baseline=read_run(args.baseline / "run.trec") if args.baseline else None,
        units=read_jsonl(args.units, Unit) if args.units else None,
        answers=read_jsonl(answers_file, AnswerLine) if answers_file.exists() else None,
        min_grade=args.min_grade if args.min_grade is not None else MIN_GRADE,
    )
    try:
        report = score(inputs)
    except ScoreError as err:
        print(f"score: {err}", file=sys.stderr)
        return 1
    out = args.out or run_dir / "scores.json"
    write_json(out, report)
    micro = next(s for s in report.strata if s.scope == "micro").estimates
    macro = next(s for s in report.strata if s.scope == "macro").estimates
    print(f"{report.run_id}: {micro['hit@5'].n} answerable questions, {report.refusals.l6_questions} L6 apart → {out}")
    for m in report.metrics:
        print(f"  {m:<10} macro {macro[m].mean:.3f} ± {macro[m].se:.3f}   micro {micro[m].mean:.3f} ± {micro[m].se:.3f}")
    return 0


def _report(args: argparse.Namespace) -> int:
    from .report import render_latex, render_markdown

    report = read_json(args.scores, ScoreReport)
    stem = args.out or args.scores.with_suffix("")
    md, tex = stem.with_suffix(".md"), stem.with_suffix(".tex")
    write_text(md, render_markdown(report))
    write_text(tex, render_latex(report))
    print(f"{md}, {tex}")
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
    out = args.out or args.snapshot / UNITS_FILE
    write_jsonl(out, units)
    for w in warnings:
        print(f"warning: {w}")
    excluded = [u for u in units if not u.sampleable]
    print(f"{len(units)} units ({len(units) - len(excluded)} sampleable, {len(excluded)} excluded) → {out}")
    return 1 if warnings else 0


def _plan(args: argparse.Namespace) -> int:
    snap = load_snapshot(args.snapshot)
    units = read_jsonl(_units_file(args), Unit)
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
    write_text(args.out.with_suffix(".md"), header + tables)
    print(tables)
    print(f"{len(plan.slots)} slots → {args.out} (tables: {args.out.with_suffix('.md')})")
    return 0


def _clients(args: argparse.Namespace, config: LLMConfig) -> dict:
    return make_clients(config, None if args.no_cache else args.cache)


def _cache_line(*clients: object) -> str:
    cached = [c for c in clients if isinstance(c, CachedClient)]
    if not cached:
        return "cache off"
    return f"API calls {sum(c.misses for c in cached)}, from cache {sum(c.hits for c in cached)}"


def _generate(args: argparse.Namespace) -> int:
    snap = load_snapshot(args.snapshot)
    units = read_jsonl(_units_file(args), Unit)
    plan = read_json(args.plan, SamplePlan)
    config = read_json(args.config, LLMConfig)
    client = _clients(args, config)["generator"]
    candidates, report = generate(snap, units, plan, client, oversample=config.oversample)
    write_jsonl(args.out, candidates)
    report_file = args.report or args.out.with_name("generate-report.json")
    write_json(report_file, report)
    per_level = Counter(f"{c.split}/{c.level}" for c in candidates)
    print(f"{len(candidates)} candidates → {args.out}: " + ", ".join(f"{k} {n}" for k, n in sorted(per_level.items())))
    for cell in report.cells:
        if cell.shortfall:
            where = f"{cell.split}/{cell.cluster or '-'}/{cell.level}" + (f"({cell.l6_kind})" if cell.l6_kind else "")
            print(f"  short: {where} got {cell.got} of {cell.wanted} after {cell.calls} call(s)")
    print(f"shortfall {report.n_shortfall} (report: {report_file})")
    print(_cache_line(client))
    return 0


def _filter(args: argparse.Namespace) -> int:
    snap = load_snapshot(args.snapshot)
    units = read_jsonl(_units_file(args), Unit)
    candidates = read_jsonl(args.candidates, Candidate)
    config = read_json(args.config, LLMConfig)
    clients = _clients(args, config)
    kept, report = run_filter(candidates, snap, units, judge=clients["judge"], embedder=clients["embedder"], config=config)
    header = QuestionFileHeader(canary=snap.manifest.canary, eval_version=args.eval_version, snapshot_id=snap.snapshot_id)
    write_questions(args.out, header, candidates_to_questions(kept, snap, units))
    write_json(args.report, report)
    for s in report.steps:
        reasons = ", ".join(f"{r} {n}" for r, n in s.reasons.items())
        relabel = f", relabelled {s.n_relabelled}" if s.n_relabelled else ""
        print(f"{s.step:<15} in {s.n_in:>5}  rejected {s.n_rejected:>4}{relabel}" + (f"  ({reasons})" if reasons else ""))
    print(f"kept {report.n_kept} → {args.out} (report: {args.report})")
    print(_cache_line(clients["judge"], clients["embedder"]))
    return 0


def _llm_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--snapshot", type=Path, required=True)
    p.add_argument("--units", type=Path, help="default: <snapshot>/units.jsonl")
    p.add_argument("--config", type=Path, default=Path("llm-config.json"), help="pinned models and thresholds")
    p.add_argument("--cache", type=Path, default=Path("cache/llm"), help="API responses, keyed by model + prompt + input")
    p.add_argument("--no-cache", action="store_true", help="call the API for every request")


def _annotate_export(args: argparse.Namespace) -> int:
    snap = load_snapshot(args.snapshot)
    _, questions = read_questions(args.questions)
    version = annotate.guideline_version(args.guideline)
    if args.kind == "review":
        units = read_jsonl(_units_file(args), Unit)
        tasks = annotate.review_tasks(questions, snap, units, version)
    else:
        if args.pool is None:
            print("--pool is required for --kind pool", file=sys.stderr)
            return 1
        tasks = annotate.pool_tasks(read_jsonl(args.pool, PoolEntry), questions, snap, version)
    write_plain_json(args.out, tasks)
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

    p = sub.add_parser("generate", help="candidates for the plan's root-level slots (Claude), about 1.6x the plan")
    _llm_args(p)
    p.add_argument("--plan", type=Path, default=Path("questions/v1.0/sample-plan.json"))
    p.add_argument("--out", type=Path, default=Path("questions/v1.0/candidates.jsonl"))
    p.add_argument("--report", type=Path, help="wanted / got / calls per cell; default: generate-report.json next to --out")
    p.set_defaults(run=_generate)

    p = sub.add_parser("filter", help="the 6 filter steps; kept candidates become pending questions")
    _llm_args(p)
    p.add_argument("--candidates", type=Path, default=Path("questions/v1.0/candidates.jsonl"))
    p.add_argument("--out", type=Path, default=Path("questions/v1.0/filtered.jsonl"))
    p.add_argument("--report", type=Path, default=Path("questions/v1.0/filter-report.json"))
    p.add_argument("--eval-version", default="1.0.0")
    p.set_defaults(run=_filter)

    p = sub.add_parser("check", help="all checks to run before a measurement; exit 1 on any problem")
    p.add_argument("--snapshot", type=Path, required=True)
    p.add_argument("--root", type=Path, default=Path("."), help="eval-set root holding questions/ and runs/")
    p.add_argument("--version", default="v1.0", help="questions/<version>/ to check")
    p.add_argument("--questions", type=Path, nargs="*", help="question files; default questions/<version>/*.jsonl")
    p.add_argument("--units", type=Path, help="default: <snapshot>/units.jsonl")
    p.add_argument("--plan", type=Path, help="default: questions/<version>/sample-plan.json")
    p.add_argument("--runs", type=Path, nargs="*", help="runs/<run_id>/ directories; default every one under runs/")
    p.set_defaults(run=_check)

    p = sub.add_parser("reanchor", help="move gold spans onto a snapshot by finding their quotes again")
    p.add_argument("--snapshot", type=Path, required=True)
    p.add_argument("--questions", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.set_defaults(run=_reanchor)

    p = sub.add_parser("annotate", help="questions / pools <-> Label Studio tasks and exports")
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

    p = sub.add_parser("score", help="retrieval scores of a run on the answerable questions, with cluster-adjusted error bars")
    p.add_argument("--questions", type=Path, required=True, help="question file (test.jsonl)")
    p.add_argument("--qrels", type=Path, required=True, help="qrels for the run's chunker_version")
    p.add_argument("--run", dest="run_dir", metavar="RUN", type=Path, required=True, help="runs/<run_id>/ with run.trec (and answers.jsonl, if any)")
    p.add_argument("--baseline", type=Path, help="runs/<run_id>/ to compare against, paired by question")
    p.add_argument("--units", type=Path, help="units.jsonl: corpus shares for the post-stratified score")
    p.add_argument("--min-grade", type=int, help="grade from which a chunk is relevant for hit / MRR / recall (default 2)")
    p.add_argument("--out", type=Path, help="default: <run>/scores.json")
    p.set_defaults(run=_score)

    p = sub.add_parser("report", help="markdown and LaTeX tables from a scores.json")
    p.add_argument("--scores", type=Path, required=True)
    p.add_argument("--out", type=Path, help="output path without suffix (default: next to the scores file)")
    p.set_defaults(run=_report)

    for name, ticket in PLANNED.items():
        p = sub.add_parser(name, help=f"not built yet (ticket {ticket})")
        p.set_defaults(run=lambda _a, name=name, ticket=ticket: _planned(name, ticket))
    return parser


def _planned(name: str, ticket: str) -> int:
    print(f"`{name}` is not built yet: see ticket {ticket} in Dataset/.scratch/eval-set-v1/issues/", file=sys.stderr)
    return 2


def _utf8_console() -> None:
    """A Windows console or pipe defaults to cp1252, which cannot print Vietnamese or an arrow: write UTF-8 instead."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="backslashreplace")


def main(argv: list[str] | None = None) -> int:
    _utf8_console()
    args = build_parser().parse_args(argv)
    try:
        return args.run(args)
    except FormatError as err:
        print(f"format error: {err}", file=sys.stderr)
        return 1
    except LLMError as err:
        print(f"LLM error: {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
