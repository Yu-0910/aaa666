#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""投手ランキング歴史年度 — Phase 1 検証（ファイル名パース・出力パス）"""

from __future__ import annotations

import io
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib.filename_parser import (  # noqa: E402
    build_pitching_rankings_output_path,
    parse_pitching_filename,
)

CASES = [
    ("pitching_1950_CL_from_master.csv", 1950, "CL", "pitching/1950/CL"),
    ("pitching_1958_PL_from_master.csv", 1958, "PL", "pitching/1958/PL"),
    ("pitching_2024_CL_from_master.csv", 2024, "CL", "pitching/2024/CL"),
    ("pitching_2025_PL_from_master.csv", 2025, "PL", "pitching/2025/PL"),
]

INVALID = [
    "pitching_1936_PRE_from_master.csv",
    "pitching_1958_CL_qualifying.csv",
    "batting_2024_CL_from_master.csv",
]


def main() -> int:
    calc_dir = ROOT / "_data" / "master_csv_calculated"
    files = sorted(calc_dir.glob("pitching_*_from_master.csv"))
    parsed_count = 0
    for f in files:
        p = parse_pitching_filename(f.name)
        if p:
            parsed_count += 1
    print(f"master_csv_calculated: pitching ファイル {len(files)} 件 / パース成功 {parsed_count} 件")
    if parsed_count != len(files):
        print("❌ パースできない pitching ファイルがあります")
        for f in files:
            if not parse_pitching_filename(f.name):
                print("   ", f.name)
        return 1

    for name, year, league, out_path in CASES:
        p = parse_pitching_filename(name)
        if not p or p["year"] != year or p["league_key"] != league:
            print(f"❌ parse 失敗: {name} -> {p}")
            return 1
        built = build_pitching_rankings_output_path(year, league)
        if built != out_path:
            print(f"❌ path 失敗: {name} -> {built} (expected {out_path})")
            return 1
        print(f"✅ {name} -> {p} -> public/data/rankings/{built}/")

    for name in INVALID:
        if parse_pitching_filename(name) is not None:
            print(f"❌ パースすべきでないファイルが通った: {name}")
            return 1
    print(f"✅ 無効パターン {len(INVALID)} 件は None")

    print("\n=== Phase 1 検証 OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
