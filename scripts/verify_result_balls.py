#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""21打席の決着球が全て集計されているか検証"""
import json
from pathlib import Path

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

# 決着球の判定（fetch_pitcher_zone_stats と同じロジック）
import re

def is_settlement_result(r):
    s = (r or "").strip()
    if re.match(r"^(左飛|中飛|右飛|二飛|一飛|レフトフライ|センターフライ|ライトフライ|フライ)$", s):
        return True
    if re.search(r"邪飛|ゴロ|ライナー|併殺", s):
        return True
    if re.match(r"^(空振り|見逃し)", s):
        return True
    if re.search(r"三振|空三振|見三振", s):
        return True
    if re.search(r"安打|ヒット|二塁打|三塁打|本塁打", s):
        return True
    if re.match(r"^(左２|右２|中２|左３|右３|中３)", s):
        return True
    return False

def is_walk(r):
    return bool(re.search(r"四球|敬遠|故意四球", (r or "").strip()))

def is_hbp(r):
    return "死球" in (r or "").strip()

def is_sf(r):
    return "犠飛" in (r or "").strip()

print("=== 21打席の決着球 検証 ===\n")
keys = sorted(pa_blocks.keys(), key=lambda x: (int(x[0]), 0 if x[1] == "表" else 1, int(x[2])))
counted = 0
skipped = []

for key in keys:
    pitches = pa_blocks[key]
    last = max(pitches, key=lambda x: int(x.get("pitch_no") or 0))
    result = (last.get("result") or "").strip()
    zid = last.get("zone_id") or ""
    
    is_settle = is_settlement_result(result) or is_walk(result) or is_hbp(result) or is_sf(result)
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
