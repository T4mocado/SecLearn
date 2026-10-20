"""Where the eval set keeps its files, relative to its root (`Dataset/`): the CLI's defaults and what `card` reads."""

from __future__ import annotations

from pathlib import Path

CHANGELOG = Path("CHANGELOG.md")
CARD = Path("CARD.md")
CLUSTERS = Path("clusters.json")
LLM_CONFIG = Path("llm-config.json")
POOL_CONFIG = Path("pool-config.json")
ANNOTATION = Path("annotation")
LABELS = Path("judgments/labels.jsonl")
POOL = Path("judgments/pool.jsonl")
AGREEMENT = Path("judgments/agreement.json")
QUESTIONS = Path("questions")
SMOKE = QUESTIONS / "smoke"
#: `questions/<GOLD_VERSION>/` holds the gold set.
GOLD_VERSION = "v1.0"
GOLD = QUESTIONS / GOLD_VERSION
#: The two split files of a question set directory.
SPLIT_FILES = ("test.jsonl", "dev.jsonl")
