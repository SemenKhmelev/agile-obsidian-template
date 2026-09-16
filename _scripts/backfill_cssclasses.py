#!/usr/bin/env python3
"""Backfill `cssclasses: [dev-<slug>]` in daily comment cards of a sprint.

The CSS snippet .obsidian/snippets/dev-avatars.css uses this class to show a
developer avatar next to the inline title inside an opened card. New cards get
the class automatically from the Templater template; this script only fills in
existing cards.

Usage:
    python3 _scripts/backfill_cssclasses.py            # current sprint from _scripts/globalprops.js
    python3 _scripts/backfill_cssclasses.py sprint1

Idempotent — skips files that already have cssclasses in their frontmatter.
"""
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _devs import SLUG  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent


def current_sprint() -> str:
    """Текущий спринт — строка, которую возвращает _scripts/globalprops.js."""
    m = re.search(r"['\"]([^'\"]+)['\"]", (ROOT / "_scripts" / "globalprops.js").read_text(encoding="utf-8"))
    if not m:
        sys.exit("cannot read current sprint from _scripts/globalprops.js")
    return m.group(1)


def main() -> None:
    sprint = sys.argv[1] if len(sys.argv) > 1 else current_sprint()
    comments_dir = ROOT / sprint / "comments"
    if not comments_dir.is_dir():
        sys.exit(f"not a directory: {comments_dir}")

    updated = skipped = 0
    for p in sorted(comments_dir.glob("*.md")):
        text = p.read_text(encoding="utf-8")
        m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
        if not m:
            skipped += 1
            continue
        fm = m.group(1)
        if re.search(r"^cssclasses:", fm, re.M):
            skipped += 1
            continue
        um = re.search(r"^user:[ \t]*(\S.*?)[ \t]*$", fm, re.M)
        if not um:
            skipped += 1
            continue
        slug = SLUG.get(um.group(1))
        if not slug:
            skipped += 1
            continue
        new_fm = fm + f"\ncssclasses:\n  - dev-{slug}"
        new_text = text.replace(f"---\n{fm}\n---\n", f"---\n{new_fm}\n---\n", 1)
        p.write_text(new_text, encoding="utf-8")
        updated += 1

    print(f"{sprint}: updated={updated}, skipped={skipped}")


if __name__ == "__main__":
    main()
