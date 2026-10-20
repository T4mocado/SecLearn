# Eval-set project (`Dataset/`)

A separate Python 3.12 project (ADR 0004): it reads only the corpus snapshot in `Dataset/corpus/`, never `src/` or Postgres.

## Running it

Run everything from `Dataset/` through its own environment, by direct path:

- tests: `.venv/Scripts/python.exe -m pytest -q`
- lint: `.venv/Scripts/python.exe -m ruff check .`
- CLI: `.venv/Scripts/seclearn-eval.exe <command>` (`--help` lists the commands)

`uv` is not on PATH in agent sessions; it lives at `C:\Users\T4mocado\AppData\Roaming\Python\Python314\Scripts\uv.exe`. Use it only to change dependencies (`uv add`) or to rebuild `.venv` (`uv sync`).

The Python behind `.venv` is installed in `Dataset/.uv-python/` (git-ignored), set with `UV_PYTHON_INSTALL_DIR`. The Claude desktop app virtualizes `AppData`: anything an agent installs there exists only inside the app, so a terminal outside it fails with "No Python at …". Install tools and interpreters under the repo or `F:\`.

A new worktree has no `.venv`. Before running tests there: `UV_PYTHON_INSTALL_DIR=<repo>/Dataset/.uv-python uv.exe sync --python <repo>/Dataset/.uv-python/cpython-3.12.15-windows-x86_64-none/python.exe`, with `<repo>` and `uv.exe` written out as literal paths.

The Windows console is cp1252: an ad-hoc script printing Vietnamese or emoji crashes with `UnicodeEncodeError`. Set `PYTHONIOENCODING=utf-8` for it (the CLI already writes UTF-8).

## In a worktree

A worktree-isolated agent's shell commands must be checkable as staying inside the worktree. Write and edit files with the Write and Edit tools, and give commands literal paths: heredocs (`cat >> f <<EOF`), `export X=$PWD/...` and `cd "$computed"` are refused.

## Checks

`scripts/hooks/pre-commit` runs on commit (enabled with `git config core.hooksPath scripts/hooks`): `npm run check` when app files are staged, ruff and pytest when `Dataset/` files are. Run the same commands before handing work back.

## Conventions that cross the app boundary

- Offsets in the snapshot, units, gold spans and Label Studio imports count Unicode code points, not JS UTF-16 units (`manifest.offset_unit`). Label Studio 1.13.1 exports code points.
- Seeded randomness: sort keys before every seeded shuffle or choice; set order changes with `PYTHONHASHSEED` (`test_plan_is_the_same_in_every_process`).
