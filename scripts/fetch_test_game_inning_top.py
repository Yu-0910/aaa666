#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
テスト: 指定試合の「1 イニング・表（または裏）」の各打順について、
Yahoo score?index= を取得し parse_pitch_details の行数を報告する。

例（日本ハム vs 西武 5回表）:
  python scripts/fetch_test_game_inning_top.py --game-id 2021038735 --inning 5 --top-bottom 表 --bat-from 1 --bat-to 9
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from scrape_yahoo_pitch_details import (  # noqa: E402
    build_index,
    fetch_pitch_detail_score_pages_for_pa,
    parse_pitch_details_merged_score_pages,
)

BASE_URL = "https://baseball.yahoo.co.jp"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--game-id", required=True)
    ap.add_argument("--inning", type=int, required=True)
    ap.add_argument("--top-bottom", default="表", choices=("表", "裏"))
    ap.add_argument("--bat-from", type=int, default=1)
    ap.add_argument("--bat-to", type=int, default=9)
    args = ap.parse_args()
    gid = args.game_id.strip()
    inn = args.inning
    tb = args.top_bottom
    print(f"game={gid} {inn}回{tb} 打順 {args.bat_from}..{args.bat_to}")
    print("-" * 60)
    for bat in range(args.bat_from, args.bat_to + 1):
        index = build_index(inn, tb, bat)
        url = f"{BASE_URL}/npb/game/{gid}/score?index={index}"
        chain = fetch_pitch_detail_score_pages_for_pa(gid, inn, tb, bat, sleep_sec=0.0)
        hlen = sum(len(h or "") for _i, h in chain)
        rows = (
            parse_pitch_details_merged_score_pages([h for _i, h in chain], gid, inn, tb, bat)
            if chain
            else []
        )
        idx_chain = ",".join(ix for ix, _h in chain) if chain else ""
        print(f"打順{bat:>2}  index={index}" + (f" → {idx_chain}" if idx_chain != index else ""))
        print(f"       url={url}")
        print(f"       html_len(sum)={hlen}  parsed_rows={len(rows)}  pages={len(chain)}")
        for r in rows[:12]:
            res = (r.get("result") or "")[:56]
            print(f"       #{r.get('pitch_no')} {(r.get('pitch_type') or '')[:8]:<8} {res}")
        if len(rows) > 12:
            print(f"       ... ({len(rows) - 12} more)")
        print()


if __name__ == "__main__":
    main()
