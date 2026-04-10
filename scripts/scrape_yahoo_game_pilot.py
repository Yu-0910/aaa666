#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scrape_yahoo_game_pilot.py

個人ページ作成計画書 Phase 1: Yahoo試合ページのスクレイピング（パイロット）

- 日程ページから試合IDを抽出
- 各試合の /top, /text, /score を取得して保存
- パイロット: 2026年3月4日のオープン戦5試合
"""

import argparse
import re
import sys
import time
import io
from pathlib import Path
from urllib.parse import urljoin

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("❌ エラー: pip install requests beautifulsoup4 lxml")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from yahoo_scrape_guard import ensure_yahoo_network_fetch_allowed

BASE_URL = "https://baseball.yahoo.co.jp"
SCHEDULE_URL = f"{BASE_URL}/npb/schedule/"
GAME_ID_PATTERN = re.compile(r'/npb/game/(\d{10})/')


def fetch_html(url: str) -> str | None:
    """HTMLを取得（UTF-8）"""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        r = requests.get(url, headers=headers, timeout=30)
        r.raise_for_status()
        r.encoding = "utf-8"
        return r.text
    except Exception as e:
        print(f"  ❌ 取得失敗: {url} - {e}")
        return None


def extract_game_ids(html: str) -> list[str]:
    """HTMLから試合IDを抽出（重複除く）"""
    ids = set()
    for m in GAME_ID_PATTERN.finditer(html):
        ids.add(m.group(1))
    return sorted(ids)


def filter_game_ids_by_date(html: str, target_date: str) -> list[str]:
    """
    指定日の試合IDのみに絞る。
    target_date: "3月4日" または "2026-03-04"
    """
    all_ids = extract_game_ids(html)
    # 日程ページは週単位なので、全IDを返す（日付との紐づけはHTMLパースが複雑なため省略）
    return all_ids


# パイロット対象: 2026年3月4日オープン戦5試合（計画書 2.4）
PILOT_GAME_IDS = ["2021040033", "2021040034", "2021040035", "2021040036", "2021040037"]


def main():
    parser = argparse.ArgumentParser(description="Yahoo試合ページ パイロットスクレイプ")
    parser.add_argument("--date", default="2026-03-02", help="日程ページのdateパラメータ")
    parser.add_argument("--pilot", action="store_true", help="2026/3/4の5試合のみ（デフォルト）")
    parser.add_argument("--limit", type=int, default=0, help="取得する試合数（0=パイロット時5件）")
    parser.add_argument("--game-ids", help="試合IDをカンマ区切りで指定（例: 2021040033,2021040036）")
    parser.add_argument("--out", default="_data/yahoo_games_pilot", help="出力ディレクトリ")
    parser.add_argument("--sleep", type=float, default=1.0, help="リクエスト間の秒数")
    args = parser.parse_args()

    ensure_yahoo_network_fetch_allowed()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"📁 出力先: {out_dir.absolute()}")

    # 1. 日程ページから試合ID取得
    schedule_url = f"{SCHEDULE_URL}?date={args.date}"
    print(f"\n1. 日程ページ取得: {schedule_url}")
    html = fetch_html(schedule_url)
    if not html:
        sys.exit(1)

    if args.game_ids:
        game_ids = [x.strip() for x in args.game_ids.split(",") if x.strip()]
        print(f"   指定された試合ID: {game_ids}")
    elif args.pilot or (args.limit == 0 and not args.game_ids):
        game_ids = PILOT_GAME_IDS
        print(f"   パイロット対象（2026/3/4 5試合）: {game_ids}")
    else:
        game_ids = extract_game_ids(html)
        print(f"   取得した試合ID: {len(game_ids)}件")
        if args.limit > 0:
            game_ids = game_ids[: args.limit]
            print(f"   先頭{args.limit}件に制限")

    # 2. 各試合の top / text / score を取得
    for i, gid in enumerate(game_ids):
        print(f"\n2.{i+1} 試合 {gid}")
        for sub in ["top", "text", "score"]:
            url = f"{BASE_URL}/npb/game/{gid}/{sub}"
            html = fetch_html(url)
            if html:
                out_file = out_dir / f"{gid}_{sub}.html"
                out_file.write_text(html, encoding="utf-8")
                print(f"   ✅ {sub}: {out_file.name} ({len(html):,} bytes)")
            time.sleep(args.sleep)

    print(f"\n✅ 完了: {len(game_ids)}試合 x 3ページ = {len(game_ids)*3}ファイル")
    print(f"   保存先: {out_dir.absolute()}")


if __name__ == "__main__":
    main()
