#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Yahoo スポナビ /npb/game/{gameId}/text を Playwright で描画し、レンダリング後 HTML を保存する。

用途:
  - JS 空シェル（async-inning / async-text のみ）を、ブラウザ実行後の HTML に差し替える
  - Phase2a-repair では直らない試合の復旧

使い方:
  pip install playwright
  playwright install chromium
  python scripts/refetch_sportsnavi_text_rendered_playwright.py --year 2026 --game-ids 2021039051,2021039052,2021039055
"""

from __future__ import annotations

import argparse
import json
import sys
import time
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

try:
    from yahoo_game_main_cancelled import main_html_cancelled
except Exception:
    main_html_cancelled = None


def read_json(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def write_json(p: Path, v: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(v, ensure_ascii=False, indent=2), encoding="utf-8")


def is_async_shell_html(html: str) -> bool:
    t = (html or "").lower()
    return 'id="async-inning"' in t or 'id="async-text"' in t


def wait_for_async_payload(page, timeout_ms: int) -> bool:
    probe = """() => {
      const nodes = [document.querySelector('#async-inning'), document.querySelector('#async-text')];
      return nodes.some((node) => {
        if (!node) return false;
        return (node.textContent || '').replace(/\\s+/g, '').length > 0;
      });
    }"""
    try:
        page.wait_for_function(probe, timeout=timeout_ms)
        return True
    except PlaywrightTimeoutError:
        return False


def trigger_auto_refresh(page) -> None:
    # 既定は手動更新なので、まず自動更新に切り替えて fetchData() を即時発火させる。
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


def parse_args(argv: list[str]) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Playwright でスポナビ text を描画して保存")
    ap.add_argument("--year", default="2026")
    ap.add_argument("--game-ids", required=True, help="カンマ区切り")
    ap.add_argument("--sleep", type=float, default=1.0, help="各試合の間の待機秒")
    ap.add_argument("--timeout-ms", type=int, default=30000, help="描画待ちタイムアウト")
    ap.add_argument("--headful", action="store_true", help="ブラウザを表示して実行")
    return ap.parse_args(argv)


def fetch_rendered_text_html(page, game_id: str, timeout_ms: int) -> str:
    url = f"https://baseball.yahoo.co.jp/npb/game/{game_id}/text"
    page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
    try:
        page.wait_for_load_state("networkidle", timeout=timeout_ms)
    except PlaywrightTimeoutError:
        pass

    trigger_auto_refresh(page)
    try:
        page.wait_for_load_state("networkidle", timeout=timeout_ms)
    except PlaywrightTimeoutError:
        pass

    if not wait_for_async_payload(page, timeout_ms):
        # 一度で来ない場合に備えて、もう一回だけ自動更新を叩く。
        trigger_auto_refresh(page)
        try:
            page.wait_for_load_state("networkidle", timeout=timeout_ms)
        except PlaywrightTimeoutError:
            pass
        wait_for_async_payload(page, timeout_ms)

    return page.content()


def main() -> int:
    args = parse_args(sys.argv[1:])
    game_ids = [x.strip() for x in args.game_ids.split(",") if x.strip()]
    if not game_ids:
        print("game-ids が空です", file=sys.stderr)
        return 1

    out_dir = ROOT / "_data" / "scraped_games" / "raw_sportsnavi_text"
    meta_dir = out_dir / "_meta"
    out_dir.mkdir(parents=True, exist_ok=True)
    meta_dir.mkdir(parents=True, exist_ok=True)

    browser_type = "chromium"
    started = time.time()
    with sync_playwright() as pw:
        browser = getattr(pw, browser_type).launch(headless=not args.headful)
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
            for i, game_id in enumerate(game_ids, start=1):
                url = f"https://baseball.yahoo.co.jp/npb/game/{game_id}/text"
                print(f"[rendered-text] {i}/{len(game_ids)} {game_id} ... ", end="", flush=True)
                try:
                    html = fetch_rendered_text_html(page, game_id, args.timeout_ms)
                    cancelled = bool(main_html_cancelled(html, game_id)) if main_html_cancelled else False
                    rendered = not is_async_shell_html(html)
                    (out_dir / f"{game_id}.html").write_text(html, encoding="utf-8")
                    write_json(
                        meta_dir / f"{game_id}.json",
                        {
                            "schemaVersion": "sportsnavi-game-raw-meta-v1",
                            "year": str(args.year).strip(),
                            "gameId": game_id,
                            "fetchedAt": datetime.now(timezone.utc).isoformat(),
                            "kind": "text",
                            "sourceUrl": url,
                            "http": {"status": 200, "statusText": "OK"},
                            "renderedBy": "playwright",
                            "renderedContent": rendered,
                            "gameState": "cancelled" if cancelled else "active",
                        },
                    )
                    if cancelled:
                        print("CANCELLED")
                    elif rendered:
                        print("OK")
                    else:
                        print("ASYNC-SHELL")
                except Exception as e:
                    (out_dir / f"{game_id}.html").write_text(
                        f"FETCH_FAILED {datetime.now(timezone.utc).isoformat()}\n{e}\n",
                        encoding="utf-8",
                    )
                    write_json(
                        meta_dir / f"{game_id}.json",
                        {
                            "schemaVersion": "sportsnavi-game-raw-meta-v1",
                            "year": str(args.year).strip(),
                            "gameId": game_id,
                            "fetchedAt": datetime.now(timezone.utc).isoformat(),
                            "kind": "text",
                            "sourceUrl": url,
                            "http": {"status": 0, "statusText": "FETCH_FAILED"},
                            "renderedBy": "playwright",
                            "error": str(e),
                        },
                    )
                    print("FAIL")
                if args.sleep > 0 and i < len(game_ids):
                    time.sleep(args.sleep)
        finally:
            browser.close()

    elapsed = time.time() - started
    print(f"[rendered-text] done games={len(game_ids)} elapsed={elapsed:.1f}s out={out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
