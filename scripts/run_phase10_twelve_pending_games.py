#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
canonical に一球未反映だった 12 試合（4/17×6 + 4/18×6）について
Phase10（テキスト→打席一覧→score?index= で一球）を取得し、
最後に batch_merge_phase10_into_all_canonical で canonical に反映する。

  python scripts/run_phase10_twelve_pending_games.py

注意:
- YAHOO_SCRAPE_DISABLED=1 だと中止されます（外す）。
- ローカル raw のテキストが空の試合があるため、**--text-from-raw は付けず**
  都度 Yahoo から /npb/game/{id}/text を取得する。

続けてマージのみ:
  npm run phase4:merge:phase10:all
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

# 開催日 4/17・4/18・中止以外で plateAppearances が空だった試合
GAME_IDS = [
    "2021038726",
    "2021038727",
    "2021038728",
    "2021038729",
    "2021038730",
    "2021038731",
    "2021038732",
    "2021038733",
    "2021038734",
    "2021038735",
    "2021038736",
    "2021038737",
]


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    restore = root / "scripts" / "run_yahoo_phase10_restore.py"
    py = sys.executable
    for i, gid in enumerate(GAME_IDS, 1):
        print(f"\n[{i}/{len(GAME_IDS)}] Phase10 restore: {gid}\n", flush=True)
        r = subprocess.run(
            [
                py,
                str(restore),
                "--game-id",
                gid,
                "--sleep",
                "1.2",
            ],
            cwd=str(root),
        )
        if r.returncode != 0:
            print(f"[run_phase10_twelve] FAILED at {gid} (exit {r.returncode})", file=sys.stderr)
            sys.exit(r.returncode)

    print("\n=== merge Phase10 → canonical (all games with derived file) ===\n", flush=True)
    # Windows: `npx` は .cmd ラッパーのため shell=False だと FileNotFoundError になりがち。
    # npm run 経由なら PATH の npm.cmd が使われる。
    if sys.platform == "win32":
        r = subprocess.run(
            ["cmd", "/c", "npm", "run", "phase4:merge:phase10:all"],
            cwd=str(root),
        )
    else:
        r = subprocess.run(
            ["npm", "run", "phase4:merge:phase10:all"],
            cwd=str(root),
        )
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
