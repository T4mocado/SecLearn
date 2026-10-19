"""The CLI itself: it must run on a Windows console whose encoding is cp1252, not only on UTF-8 terminals."""

from __future__ import annotations

import io
import sys
from pathlib import Path

import pytest

from seclearn_eval.cli import build_parser, main


def cp1252_console(monkeypatch) -> tuple[io.BytesIO, io.BytesIO]:
    out, err = io.BytesIO(), io.BytesIO()
    monkeypatch.setattr(sys, "stdout", io.TextIOWrapper(out, encoding="cp1252"))
    monkeypatch.setattr(sys, "stderr", io.TextIOWrapper(err, encoding="cp1252"))
    return out, err


@pytest.mark.parametrize("argv", [["--help"], ["annotate", "--help"], ["score", "--help"], ["generate", "--help"]])
def test_help_prints_on_a_cp1252_console(monkeypatch, argv):
    out, _ = cp1252_console(monkeypatch)
    with pytest.raises(SystemExit) as exit_:
        main(argv)
    assert exit_.value.code == 0
    sys.stdout.flush()
    assert b"usage" in out.getvalue()


def test_arrows_in_output_do_not_crash_a_cp1252_console(monkeypatch, snap_dir, tmp_path):
    out, _ = cp1252_console(monkeypatch)
    # `clusters` prints "… cheat sheets → clusters.json".
    assert main(["clusters", "--snapshot", str(snap_dir), "--out", str(tmp_path / "clusters.json")]) == 0
    sys.stdout.flush()
    assert "→".encode() in out.getvalue()


def test_every_subcommand_has_its_handler_in_run_and_score_takes_a_run_dir():
    def leaves(parser, path=()):
        subs = [a for a in parser._actions if a.choices and isinstance(a.choices, dict)]
        if not subs:
            yield path, parser
        for a in subs:
            for name, p in a.choices.items():
                yield from leaves(p, (*path, name))

    for path, p in leaves(build_parser()):
        assert callable(p.get_default("run")), " ".join(path)
    args = build_parser().parse_args(["score", "--questions", "q", "--qrels", "r", "--run", "runs/A"])
    assert args.run_dir == Path("runs/A") and callable(args.run)
