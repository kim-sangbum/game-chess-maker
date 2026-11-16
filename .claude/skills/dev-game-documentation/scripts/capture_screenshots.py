#!/usr/bin/env python3
"""
Capture real screenshots from a running browser game using Playwright.

Prerequisites:
    python -m pip install playwright
    python -m playwright install chromium

Examples:
    python scripts/capture_screenshots.py --url http://127.0.0.1:5173
    python scripts/capture_screenshots.py --url http://127.0.0.1:5173 --out docs/screenshots --full-page
    python scripts/capture_screenshots.py --url http://127.0.0.1:5173 --selector "canvas#game"

This helper captures the page as it currently appears. It does NOT know how to play
the game or navigate menus. Use a project-specific Playwright flow for that.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture a running browser game's current screen.")
    parser.add_argument("--url", required=True, help="Local or explicitly authorized game URL.")
    parser.add_argument("--out", default="docs/screenshots", help="Screenshot output directory.")
    parser.add_argument("--name", default="00-current-screen", help="Screenshot filename without extension.")
    parser.add_argument("--width", type=int, default=1440, help="Viewport width.")
    parser.add_argument("--height", type=int, default=900, help="Viewport height.")
    parser.add_argument("--wait", type=float, default=2.0, help="Seconds to wait after page load.")
    parser.add_argument("--timeout", type=int, default=30000, help="Navigation timeout in milliseconds.")
    parser.add_argument("--full-page", action="store_true", help="Capture the full page instead of viewport.")
    parser.add_argument("--selector", help="Optional CSS selector to screenshot instead of the full page.")
    parser.add_argument("--headed", action="store_true", help="Show the browser window.")
    parser.add_argument("--no-verify-tls", action="store_true", help="Disable TLS verification (avoid unless needed).")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    parsed = urlparse(args.url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        print("ERROR: --url must be a valid http(s) URL.", file=sys.stderr)
        return 2
    if args.width < 320 or args.height < 240:
        print("ERROR: viewport must be at least 320x240.", file=sys.stderr)
        return 2

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(
            "Playwright is not installed. Install with:\n"
            "  python -m pip install playwright\n"
            "  python -m playwright install chromium",
            file=sys.stderr,
        )
        return 3

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    filename = args.name if args.name.lower().endswith(".png") else f"{args.name}.png"
    image_path = out_dir / filename
    metadata_path = out_dir / f"{Path(filename).stem}.json"

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=not args.headed)
            context = browser.new_context(
                viewport={"width": args.width, "height": args.height},
                ignore_https_errors=args.no_verify_tls,
                device_scale_factor=1,
            )
            page = context.new_page()
            response = page.goto(args.url, wait_until="networkidle", timeout=args.timeout)
            if response and response.status >= 400:
                raise RuntimeError(f"Page returned HTTP {response.status}")
            page.wait_for_timeout(max(0, int(args.wait * 1000)))

            if args.selector:
                target = page.locator(args.selector).first
                target.wait_for(state="visible", timeout=args.timeout)
                target.screenshot(path=str(image_path), animations="disabled")
            else:
                page.screenshot(
                    path=str(image_path),
                    full_page=args.full_page,
                    animations="disabled",
                )

            metadata = {
                "url": args.url,
                "page_title": page.title(),
                "viewport": {"width": args.width, "height": args.height},
                "full_page": args.full_page,
                "selector": args.selector,
                "captured_at_utc": datetime.now(timezone.utc).isoformat(),
                "http_status": response.status if response else None,
                "screenshot": filename,
            }
            metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
            browser.close()

        print(f"Screenshot: {image_path.resolve()}")
        print(f"Metadata:   {metadata_path.resolve()}")
        return 0
    except Exception as exc:
        print(f"CAPTURE FAILED: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
