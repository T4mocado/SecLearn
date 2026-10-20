"""SemVer of the eval set and its CHANGELOG (spec user story 70)."""

from __future__ import annotations

import pytest

from seclearn_eval.io import FormatError
from seclearn_eval.versioning import bump, read_changelog

CHANGELOG = """\
# Nhật ký thay đổi

Quy tắc ở đầu file.

## [0.2.0] - 2026-10-21

### Thêm
- 10 câu mới.

## [0.1.1] - 2026-10-20

### Sửa
- Nhãn câu q3.

## [0.1.0] - 2026-10-19

- Bản đầu.
"""


def test_changelog_lists_releases_newest_first_with_their_lines():
    releases = read_changelog(CHANGELOG)
    assert [r.version for r in releases] == ["0.2.0", "0.1.1", "0.1.0"]
    assert releases[0].date == "2026-10-21"
    assert "- 10 câu mới." in releases[0].body


def test_an_unreleased_entry_has_no_date():
    releases = read_changelog("## [1.0.0] - chưa phát hành\n- Gold set.\n\n## [0.1.0] - 2026-10-19\n- Bản đầu.\n")
    assert releases[0].version == "1.0.0" and releases[0].date is None


@pytest.mark.parametrize(
    "text",
    [
        "## [1.0] - 2026-10-19\n",  # not MAJOR.MINOR.PATCH
        "## [0.1.0] - 2026-10-19\n## [0.2.0] - 2026-10-20\n",  # older first
        "## [0.1.0] - 2026-10-19\n## [0.1.0] - 2026-10-18\n",  # same version twice
        "# Nhật ký\nno release yet\n",
    ],
)
def test_a_malformed_changelog_is_an_error(text):
    with pytest.raises(FormatError):
        read_changelog(text)


@pytest.mark.parametrize(
    ("change", "expected"),
    [("snapshot", "2.0.0"), ("gold_meaning", "2.0.0"), ("questions", "1.4.0"), ("labels", "1.3.3")],
)
def test_bump_follows_the_project_rules(change, expected):
    assert bump("1.3.2", change) == expected
