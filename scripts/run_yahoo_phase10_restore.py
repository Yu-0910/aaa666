#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 10: テキスト速報の打席一覧 + 各打席の score?index= から一球ログを取得し、
derived JSON に保存する。続けて `merge_yahoo_phase10_canonical.ts` で canonical にマージ。

計画: docs/yahoo_npb_game_data_integration_plan.md Phase 10

例:
  python scripts/run_yahoo_phase10_restore.py --game-id 2021038624
  python scripts/run_yahoo_phase10_restore.py --game-id 2021038624 --text-from-raw --limit 5
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None  # type: ignore[misc, assignment]

if sys.platform == "win32":
    # npm 経由実行などで stdout が閉じている場合があるため、reconfigure を優先する
    try:
        if hasattr(sys.stdout, "reconfigure") and not sys.stdout.closed:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure") and not sys.stderr.closed:
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def safe_print(*args, **kwargs) -> None:
    """
    Windows + npm 経由で stdout が閉じていても落ちない print。
    """
    try:
        if getattr(sys.stdout, "closed", False):
            print(*args, file=sys.__stdout__, **{k: v for k, v in kwargs.items() if k != "file"})
            return
        print(*args, **kwargs)
    except Exception:
        try:
            print(*args, file=sys.__stdout__)
        except Exception:
            return

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from fetch_game_pitch_types import parse_plate_appearances_from_html  # noqa: E402
from scrape_yahoo_pitch_details import build_index, fetch_html, parse_pitch_details  # noqa: E402
from yahoo_scrape_guard import ensure_yahoo_network_fetch_allowed  # noqa: E402

BASE_URL = "https://baseball.yahoo.co.jp"


def pa_summary_from_text_html(html_text: str, inning: int, top_bottom: str, bat_order: int) -> str | None:
    """
    テキスト速報HTMLから、指定イニング・表裏・打席順（その回の何打席目）の要約テキストを返す。
    """
    if not html_text or BeautifulSoup is None:
        return None
    soup = BeautifulSoup(html_text, "lxml")
    target_heading = f"{inning}回{top_bottom}"
    for sec in soup.select("section.bb-liveText"):
        h = sec.select_one("h1.bb-liveText__inning")
        if not h or h.get_text(strip=True) != target_heading:
            continue
        for li in sec.select("ol.bb-liveText__orderedList > li.bb-liveText__item"):
            num_el = li.select_one("p.bb-liveText__number")
            if not num_el:
                continue
            raw = (num_el.get_text() or "").strip().rstrip("：").strip()
            m = re.match(r"^(\d+)", raw)
            if not m:
                continue
            if int(m.group(1)) != bat_order:
                continue
            parts: list[str] = []
            for p in li.select("p.bb-liveText__summary"):
                t = p.get_text(" ", strip=True)
                if t:
                    parts.append(t)
            return " ".join(parts) if parts else None
    return None


def is_intentional_walk_like(summary: str) -> bool:
    """敬遠・故意四球（テキスト上）。"""
    if not summary:
        return False
    return "敬遠" in summary or "故意四球" in summary


def synthetic_intentional_walk_pitch_row(
    game_id: str,
    inning: int,
    top_bottom: str,
    bat_order: int,
    pa: dict,
    summary_text: str,
) -> dict:
    """一球ページに詳細テーブルが無いが、テキストで敬遠と分かる場合の1行（記録上の合成）。"""
    label = "敬遠（故意四球）" if "敬遠" in summary_text else "故意四球"
    return {
        "game_id": game_id,
        "inning": str(inning),
        "top_bottom": top_bottom,
        "bat_order": str(bat_order),
        "pitcher_id": pa.get("pitcher_id") or "",
        "batter_id": pa.get("batter_id") or "",
        "batter_name": "",
        "batter_hand": "",
        "pitch_no": "1",
        "pitch_type": "",
        "speed_kmh": "",
        "result": label,
        "zone_top_px": "",
        "zone_left_px": "",
        "zone_row": "",
        "zone_col": "",
        "zone_id": "",
        "record_kind": "intentional_walk",
        "text_summary": summary_text,
        "source": "text_summary_synthetic",
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Phase10: 一球ログを取得して derived JSON に保存")
    ap.add_argument("--game-id", default="2021038624", help="試合ID")
    ap.add_argument("--sleep", type=float, default=1.2, help="打席間の待機秒")
    ap.add_argument(
        "--text-from-raw",
        action="store_true",
        help="テキストHTMLは _data/scraped_games/raw/{game_id}/text.html を使う（無ければ取得）",
    )
    ap.add_argument("--limit", type=int, default=0, help="打席数上限（0=全件）")
    args = ap.parse_args()

    ensure_yahoo_network_fetch_allowed()

    game_id = args.game_id.strip()
    root = Path(__file__).resolve().parent.parent
    raw_text = root / "_data" / "scraped_games" / "raw" / game_id / "text.html"
    text_url = f"{BASE_URL}/npb/game/{game_id}/text"

    if args.text_from_raw and raw_text.is_file():
        html_text = raw_text.read_text(encoding="utf-8")
        safe_print(f"テキスト: ローカル {raw_text}")
    else:
        safe_print(f"テキスト取得: {text_url}")
        html_text = fetch_html(text_url)
        if not html_text:
            safe_print("❌ テキストページの取得に失敗しました", file=sys.stderr)
            sys.exit(1)

    pas = parse_plate_appearances_from_html(html_text, game_id)
    if args.limit > 0:
        pas = pas[: args.limit]
        safe_print(f"打席数（limit）: {len(pas)}")
    else:
        safe_print(f"打席数: {len(pas)}")

    all_rows: list[dict] = []
    missing: list[str] = []
    # 敬遠合成行で pitcher_id が空のとき、同一表・裏で直前打席に確定した投手を引き継ぐ（merge と同じ運用ルール）
    last_pitcher_by_half: dict[str, str] = {}

    for i, pa in enumerate(pas):
        inning = int(pa["inning"])
        top_bottom = pa["top_bottom"]
        bat_order = int(pa["bat_order"])
        half_key = f"{inning}|{top_bottom}"
        index = build_index(inning, top_bottom, bat_order)
        url = f"{BASE_URL}/npb/game/{game_id}/score?index={index}"
        safe_print(f"  [{i + 1}/{len(pas)}] {index} ... ", end="", flush=True)
        html = fetch_html(url)
        if not html:
            missing.append(f"score:{index}:fetch_failed")
            safe_print("❌ fetch")
            time.sleep(args.sleep)
            continue
        rows = parse_pitch_details(html, game_id, inning, top_bottom, bat_order)
        if rows:
            all_rows.extend(rows)
            pid0 = (rows[0].get("pitcher_id") or "").strip()
            if pid0:
                last_pitcher_by_half[half_key] = pid0
            safe_print(f"✅ {len(rows)}球")
        else:
            summary = pa_summary_from_text_html(html_text, inning, top_bottom, bat_order)
            if summary and is_intentional_walk_like(summary):
                carry = (pa.get("pitcher_id") or "").strip() or last_pitcher_by_half.get(half_key, "")
                row = synthetic_intentional_walk_pitch_row(
                    game_id, inning, top_bottom, bat_order, pa, summary
                )
                if carry and not (row.get("pitcher_id") or "").strip():
                    row["pitcher_id"] = carry
                all_rows.append(row)
                pcar = (row.get("pitcher_id") or "").strip()
                if pcar:
                    last_pitcher_by_half[half_key] = pcar
                safe_print(f"✅ 敬遠(テキスト) 「{summary[:28]}…」" if len(summary) > 28 else f"✅ 敬遠(テキスト) 「{summary}」")
            else:
                missing.append(f"score:{index}:no_pitch_rows")
                safe_print("⚠️ 投球なし")
        time.sleep(args.sleep)

    out = {
        "schemaVersion": "yahoo-phase10-restored-v1",
        "gameId": game_id,
        "restoredAt": datetime.now(timezone.utc).isoformat(),
        "pitchRows": all_rows,
        "missingOrPartial": missing,
    }
    derived = root / "_data" / "scraped_games" / "derived"
    derived.mkdir(parents=True, exist_ok=True)
    out_path = derived / f"{game_id}_phase10_restored.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    safe_print(f"\nWrote {out_path} (pitch rows={len(all_rows)}, missing={len(missing)})")


if __name__ == "__main__":
    main()
