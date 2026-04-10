"""
Remove 2026-03-04 Orix vs Hiroshima (game_id 2021040036) pilot rows for Hiroshima (Carp) players:
- plate appearances where batting_team is Carp
- pitch_details for Carp batting (top) or Carp pitching (bottom)
- all batting_stats / pitching_stats rows for affected Yahoo IDs
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PILOT = ROOT / "_data" / "yahoo_games_pilot"
GAME_ID = "2021040036"
CARP_TEAM = "広島東洋カープ"


def main() -> None:
    # --- plate_appearances_normalized: drop Carp batting PAs ---
    norm_path = PILOT / "plate_appearances_normalized.csv"
    carp_batters: set[str] = set()
    carp_pitchers: set[str] = set()

    with norm_path.open(encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        rows = list(r)
        fieldnames = r.fieldnames or []

    kept_norm: list[dict] = []
    for row in rows:
        if row.get("game_id") != GAME_ID:
            kept_norm.append(row)
            continue
        if row.get("batting_team") == CARP_TEAM:
            carp_batters.add(row.get("batter_id", "").strip())
            continue
        kept_norm.append(row)
        pid = row.get("pitcher_id", "").strip()
        if pid:
            carp_pitchers.add(pid)

    with norm_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(kept_norm)

    carp_batters.discard("")
    carp_pitchers.discard("")

    # --- plate_appearances: game + 表 = away Carp ---
    pa_path = PILOT / "plate_appearances.csv"
    with pa_path.open(encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        pa_rows = list(r)
        pa_fields = r.fieldnames or []

    kept_pa = [
        row
        for row in pa_rows
        if not (row.get("game_id") == GAME_ID and row.get("top_bottom") == "表")
    ]
    with pa_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=pa_fields)
        w.writeheader()
        w.writerows(kept_pa)

    # --- pitch_details: drop 表 OR (裏 & pitcher in carp_pitchers) ---
    pd_path = PILOT / "pitch_details.csv"
    with pd_path.open(encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        pd_rows = list(r)
        pd_fields = r.fieldnames or []

    kept_pd: list[dict] = []
    for row in pd_rows:
        if row.get("game_id") != GAME_ID:
            kept_pd.append(row)
            continue
        tb = row.get("top_bottom", "")
        pid = row.get("pitcher_id", "").strip()
        if tb == "表":
            continue
        if tb == "裏" and pid in carp_pitchers:
            continue
        kept_pd.append(row)

    with pd_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=pd_fields)
        w.writeheader()
        w.writerows(kept_pd)

    # --- batting_stats: remove all rows for Carp batters ---
    bs_path = PILOT / "batting_stats.csv"
    with bs_path.open(encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        bs_rows = list(r)
        bs_fields = r.fieldnames or []

    kept_bs = [row for row in bs_rows if row.get("player_id", "").strip() not in carp_batters]
    with bs_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=bs_fields)
        w.writeheader()
        w.writerows(kept_bs)

    # --- pitching_stats: remove Carp pitchers ---
    ps_path = PILOT / "pitching_stats.csv"
    with ps_path.open(encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        ps_rows = list(r)
        ps_fields = r.fieldnames or []

    kept_ps = [row for row in ps_rows if row.get("player_id", "").strip() not in carp_pitchers]
    with ps_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=ps_fields)
        w.writeheader()
        w.writerows(kept_ps)

    # --- pitch_details_kikuchi.csv: only Kikuchi / same game ---
    kcsv = PILOT / "pitch_details_kikuchi.csv"
    if kcsv.exists():
        with kcsv.open(encoding="utf-8", newline="") as f:
            r = csv.DictReader(f)
            kr = list(r)
            kf = r.fieldnames or []
        kkept = [row for row in kr if row.get("game_id") != GAME_ID]
        with kcsv.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=kf)
            w.writeheader()
            w.writerows(kkept)

    # --- kikuchi_20260304_blocks.json: empty pilot (no 3/4 Orix game) ---
    kjson = PILOT / "kikuchi_20260304_blocks.json"
    empty_blocks = {
        "meta": {
            "batter_id": "1100082",
            "batter_name": "菊池涼介",
            "date": "",
            "pa_count": 0,
            "game_ids": [],
        },
        "blocks": {},
    }
    with kjson.open("w", encoding="utf-8") as f:
        json.dump(empty_blocks, f, ensure_ascii=False, indent=2)

    print("Carp batters removed from batting_stats:", sorted(carp_batters))
    print("Carp pitchers removed from pitching_stats:", sorted(carp_pitchers))
    print("Done.")


if __name__ == "__main__":
    main()
