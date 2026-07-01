#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Yahoo スポナビ /npb/game/{gameId}/text のネット通信を記録する。

目的:
  - async-inning / async-text を埋める XHR / fetch / JSON エンドポイントを特定する
  - JS 空シェルの復旧経路を future-proof にする

使い方:
  pip install playwright
  playwright install chromium
  python scripts/probe_sportsnavi_text_xhr_playwright.py --game-id 2021039051 --wait-ms 8000
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure") and not sys.stdout.closed:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure") and not sys.stderr.closed:
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright
except ImportError as e:
    print("Playwright がインストールされていません。", file=sys.stderr)
    print("  pip install playwright", file=sys.stderr)
    print("  playwright install chromium", file=sys.stderr)
    raise SystemExit(1) from e

ROOT = Path(__file__).resolve().parent.parent
OUT_ROOT = ROOT / "_data" / "reports" / "sportsnavi_text_probe"


def parse_args(argv: list[str]) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="スポナビ text の XHR/fetch を記録")
    ap.add_argument("--game-id", required=True)
    ap.add_argument("--wait-ms", type=int, default=8000)
    ap.add_argument("--headful", action="store_true")
    return ap.parse_args(argv)


def is_interesting_url(url: str) -> bool:
    u = url.lower()
    return any(
        part in u
        for part in [
            "/npb/game/",
            "/async",
            "/api/",
            ".json",
            "text",
            "inning",
            "play",
            "score",
        ]
    )


def safe_name(url: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", url.replace("https://", "").replace("http://", ""))


def trigger_auto_refresh(page) -> None:
    page.evaluate(
        """() => {
          const input = document.querySelector('#js-reloadToggle01');
          if (input) {
            input.click();
            return true;
          }
          const label = document.querySelector('label[for="js-reloadToggle01"]');
          if (label) {
            label.click();
            return true;
          }
          return false;
        }"""
    )


def main() -> int:
    args = parse_args(sys.argv[1:])
    game_id = args.game_id.strip()
    if not game_id:
        print("game-id が空です", file=sys.stderr)
        return 1

    out_dir = OUT_ROOT / game_id
    out_dir.mkdir(parents=True, exist_ok=True)

    url = f"https://baseball.yahoo.co.jp/npb/game/{game_id}/text"
    seen: list[dict] = []
    bodies_written = 0
    started_at = datetime.now(timezone.utc).isoformat()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not args.headful)
        try:
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
                ),
                locale="ja-JP",
                viewport={"width": 1440, "height": 1600},
            )
            page = context.new_page()

            def on_request(req):
                rec = {
                    "kind": "request",
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "method": req.method,
                    "resourceType": req.resource_type,
                    "url": req.url,
                }
                if is_interesting_url(req.url):
                    seen.append(rec)
                    print(f"[req] {req.resource_type:10} {req.method:6} {req.url}")

            def on_response(resp):
                req = resp.request
                rec = {
                    "kind": "response",
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "status": resp.status,
                    "resourceType": req.resource_type,
                    "url": resp.url,
                    "contentType": resp.headers.get("content-type", ""),
                }
                if is_interesting_url(resp.url) or req.resource_type in {"xhr", "fetch"}:
                    seen.append(rec)
                    ctype = resp.headers.get("content-type", "")
                    print(f"[res] {req.resource_type:10} {resp.status:3} {ctype[:50]:50} {resp.url}")
                    if "json" in ctype.lower() or req.resource_type in {"xhr", "fetch"}:
                        try:
                            text = resp.text()
                            if text:
                                body_path = out_dir / f"{len(seen):03d}_{safe_name(resp.url)}.txt"
                                body_path.write_text(text[:20000], encoding="utf-8")
                                nonlocal_bodies["count"] += 1
                        except Exception:
                            pass

            nonlocal_bodies = {"count": 0}

            page.on("request", on_request)
            page.on("response", on_response)

            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            try:
                page.wait_for_load_state("networkidle", timeout=30000)
            except PlaywrightTimeoutError:
                pass
            trigger_auto_refresh(page)
            try:
                page.wait_for_load_state("networkidle", timeout=30000)
            except PlaywrightTimeoutError:
                pass
            page.wait_for_timeout(args.wait_ms)
            html = page.content()
            (out_dir / "page.html").write_text(html, encoding="utf-8")
            (out_dir / "events.json").write_text(json.dumps(seen, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[probe] bodies_saved={nonlocal_bodies['count']} html_len={len(html)}")
        finally:
            browser.close()

    print(f"[probe] done game={game_id} startedAt={started_at} out={out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
