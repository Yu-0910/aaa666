#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
report_mori_zone_stats.py

森翔平投手の 2026/3/15 広島vs阪神戦 コース別成績（被ISOP・被打率・被本塁打）を算出・表示。

使い方:
  1. 先に fetch_pitcher_zone_stats を実行して zone_stats JSON を生成:
     python scripts/fetch_pitcher_zone_stats.py --game-id 2021040084 --pitcher-id 2103788

  2. 本スクリプトでレポート表示:
     python scripts/report_mori_zone_stats.py

  JSON が無い場合は --fetch で取得してから表示:
     python scripts/report_mori_zone_stats.py --fetch
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

# ゾーンID → 位置名（5x5: row=高→低, col=内→外。投手目線＝投手がマウンドから見る視点）
def zone_name(zid: int) -> str:
    row, col = (zid - 1) // 5, (zid - 1) % 5
    rows = ["高", "中高", "中", "中低", "低"]
    cols = ["内", "やや内", "中", "やや外", "外"]
    return rows[row] + cols[col]


def format_zone_table(zones: list[dict], hand_label: str) -> str:
    """ゾーン別成績を表形式で整形"""
    lines = [f"\n=== {hand_label} ===", ""]
    # 有効データのあるゾーンのみ
    rows = [z for z in zones if z.get("ab", 0) > 0 or z.get("pitches", 0) > 0]
    if not rows:
        lines.append("  （打席結果なし）")
        return "\n".join(lines)

    lines.append(f"{'ゾーン':<8} {'被打率':<8} {'被ISOP':<8} {'被本塁打':<6} {'打数':<4} {'安打':<4}")
    lines.append("-" * 50)
    for z in sorted(rows, key=lambda x: x["zoneId"]):
        zid = z["zoneId"]
        name = zone_name(zid)
        avg = z.get("avg", "—")
        if "isop" in z:
            isop_raw = z["isop"]
        else:
            isop_raw = z.get("ops", "—")
        if isop_raw is None or isop_raw == "":
            isop = "—"
        else:
            isop = str(isop_raw)
        hr = z.get("hr", 0)
        ab = z.get("ab", 0)
        h = z.get("h", 0)
        lines.append(f"{name:<8} {avg:<8} {isop:<8} {hr:<6} {ab:<4} {h:<4}")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="森翔平 3/15 コース別成績レポート")
    parser.add_argument("--fetch", action="store_true", help="先にfetchしてから表示")
    parser.add_argument("--game-id", default="2021040084")
    parser.add_argument("--pitcher-id", default="2103788")
    parser.add_argument("--out-dir", default="_data/yahoo_games_pilot")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    out_dir = root / args.out_dir.strip()
    json_path = out_dir / f"zone_stats_{args.game_id}_{args.pitcher_id}.json"

    if args.fetch:
        print("📥 取得中...")
        fetch_script = root / "scripts" / "fetch_pitcher_zone_stats.py"
        if not fetch_script.exists():
            print("❌ fetch_pitcher_zone_stats.py が見つかりません")
            sys.exit(1)
        result = subprocess.run(
            [
                sys.executable,
                str(fetch_script),
                "--game-id", args.game_id,
                "--pitcher-id", args.pitcher_id,
                "--out-dir", args.out_dir,
            ],
            cwd=str(root),
        )
        if result.returncode != 0:
            print("❌ 取得に失敗しました")
            sys.exit(1)

    if not json_path.exists():
        print(f"❌ {json_path} が見つかりません")
        print("  先に以下を実行してください:")
        print(f"  python scripts/fetch_pitcher_zone_stats.py --game-id {args.game_id} --pitcher-id {args.pitcher_id}")
        sys.exit(1)

    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    print("=" * 60)
    print("森翔平 2026/3/15 広島vs阪神戦 コース別投球成績")
    print("  被ISOP / 被打率 / 被本塁打（25マスゾーン、対右/対左）")
    print("=" * 60)

    for hand, label in [("vsRight", "対右打者"), ("vsLeft", "対左打者")]:
        zones = data.get(hand, [])
        print(format_zone_table(zones, label))

    # 合計
    vs_r = data.get("vsRight", [])
    vs_l = data.get("vsLeft", [])
    total_ab = sum(z.get("ab", 0) for z in vs_r + vs_l)
    total_h = sum(z.get("h", 0) for z in vs_r + vs_l)
    total_hr = sum(z.get("hr", 0) for z in vs_r + vs_l)
    # 簡易合計（対右+対左を統合した全体）
    print("\n=== 全体（対右+対左 統合） ===")
    if total_ab > 0:
        avg = total_h / total_ab
        # ゾーン別指標の加重平均ではなく、ここでは打率のみ簡易表示
        print(f"  打数: {total_ab}, 安打: {total_h}, 被本塁打: {total_hr}")
        print(f"  被打率: {avg:.3f}")
    else:
        print("  （打席結果なし）")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
