#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""21打席の決着球が全て集計されているか検証"""
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from pa_outcome_from_ts import batch_pa_outcome_classifications

root = Path(__file__).resolve().parent.parent
debug_path = root / "_data/yahoo_games_pilot/debug_pitches_2021040084_2103788.json"
with open(debug_path, encoding="utf-8") as f:
    data = json.load(f)

# 打席ごとにグループ化、最後の投球を取得
pa_blocks = {}
for p in data:
    if p.get("pitcher_id") != "2103788":
        continue
    key = (p["inning"], p["top_bottom"], p["bat_order"])
    if key not in pa_blocks:
        pa_blocks[key] = []
    pa_blocks[key].append(p)


keys = sorted(pa_blocks.keys(), key=lambda x: (int(x[0]), 0 if x[1] == "表" else 1, int(x[2])))
last_results: list[str] = []
for key in keys:
    pitches = pa_blocks[key]
    last = max(pitches, key=lambda x: int(x.get("pitch_no") or 0))
    last_results.append((last.get("result") or "").strip())

outcome_by_result = batch_pa_outcome_classifications(last_results, root)

print("=== 21打席の決着球 検証 ===\n")
counted = 0
skipped = []

for key in keys:
    pitches = pa_blocks[key]
    last = max(pitches, key=lambda x: int(x.get("pitch_no") or 0))
    result = (last.get("result") or "").strip()
    zid = last.get("zone_id") or ""

    o = outcome_by_result[result]
    is_settle = bool(o["settlement"] or o["walk"] or o["hbp"] or o["sf"])
    has_zone = zid and 1 <= int(zid or 0) <= 25

    if is_settle and has_zone:
        status = "✓ 集計"
        counted += 1
    else:
        reason = []
        if not is_settle:
            reason.append("決着球と判定されず")
        if not has_zone:
            reason.append("zone_idなし")
        status = f"✗ スキップ ({', '.join(reason)})"
        skipped.append((f"{key[0]}{key[1]} {key[2]}番", result[:30], status))

    print(f"  {key[0]}{key[1]} {key[2]}番: {result[:35]:<35} zone={zid:<2} -> {status}")

print(f"\n集計済み: {counted}/21")
if skipped:
    print(f"\nスキップされた決着球 ({len(skipped)}件):")
    for pa, res, st in skipped:
        print(f"  {pa}: {res}")
