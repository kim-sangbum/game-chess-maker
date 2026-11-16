#!/usr/bin/env python3
"""Basic offline validation for README/HTML screenshot references."""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path
from urllib.parse import unquote


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--readme", default="README.md")
    parser.add_argument("--html", default="docs/index.html")
    args = parser.parse_args()

    errors = []
    checked = 0

    readme = Path(args.readme)
    if readme.exists():
        content = readme.read_text(encoding="utf-8")
        for raw in re.findall(r'!\[[^\]]*\]\(([^)]+)\)', content):
            path = raw.split("#", 1)[0].split("?", 1)[0]
            if not path or re.match(r"^(https?:|data:|mailto:)", path):
                continue
            target = (readme.parent / unquote(path)).resolve()
            checked += 1
            if not target.is_file():
                errors.append(f"README image/link target missing: {raw}")
    else:
        errors.append(f"README not found: {readme}")

    html = Path(args.html)
    if html.exists():
        content = html.read_text(encoding="utf-8")
        for raw in re.findall(r'<img\b[^>]*\bsrc=["\']([^"\']+)["\']', content, flags=re.I):
            if re.match(r"^(https?:|data:|file:)", raw):
                continue
            target = (html.parent / unquote(raw)).resolve()
            checked += 1
            if not target.is_file():
                errors.append(f"HTML image target missing: {raw}")
    else:
        errors.append(f"HTML not found: {html}")

    print(f"Checked local image references: {checked}")
    if errors:
        print("Validation: FAILED")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Validation: PASSED (local image references only)")
    print("Note: This script does not validate HTML rendering or factual accuracy.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
