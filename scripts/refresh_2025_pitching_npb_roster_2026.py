#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
2026年名簿（npb_roster_2026.csv）の投手について、NPB BIS から 2025 年投手成績を再取得し
pitching_2025_{CL|PL}_from_master.csv の該当行を上書きする。

- 修正済みスクレイパー（scrape_2025_pitching_via_roster）を使用
- 名簿にいるが CSV に無い行は追加
- 名簿外の行はそのまま残す
"""
from __future__ import annotations

import csv
import shutil
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ROSTER_PATH = PROJECT_ROOT / "_data" / "npb_roster_2026.csv"
YEAR = 2025
MASTER_DIRS = [
    PROJECT_ROOT / "_data" / "master_csv__import_1950_2024",
    PROJECT_ROOT / "_data" / "master_csv",
]

sys.path.insert(0, str(PROJECT_ROOT))
from scripts.scrape_2025_pitching_via_roster import (  # noqa: E402
    RST_TEAMS,
    get_player_pitching_for_year,
)

TEAM_TO_LEAGUE: Dict[str, str] = {team: league for _, (league, team) in RST_TEAMS.items()}


def load_roster_pitchers() -> List[Dict[str, str]]:
    with ROSTER_PATH.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    out: List[Dict[str, str]] = []
    for row in rows:
        pos = (row.get("position") or "").strip()
        if "投" not in pos:
            continue
        pid = (row.get("npb_player_id") or "").strip()
        name = (row.get("name_ja") or "").strip()
        team = (row.get("team") or "").strip()
        if not pid or not name or not team:
            continue
        league = TEAM_TO_LEAGUE.get(team)
        if not league:
            print(f"  ⚠️ リーグ不明: {name} / {team}", flush=True)
            continue
        out.append(
            {
                "npb_player_id": pid,
                "name_ja": name,
                "team": team,
                "league": league,
            }
        )
    return out


def csv_fieldnames(rows: List[Dict[str, Any]]) -> List[str]:
    base = [
        "year",
        "league",
        "team",
        "player_id",
        "player_name_ja",
        "player_name_en",
        "G",
        "IP",
        "W",
        "L",
        "SV",
        "ERA",
        "BF",
        "H",
        "HR",
        "BB",
        "IBB",
        "HBP",
        "SO",
        "ER",
        "R",
        "HOLD",
        "HP",
        "CG",
        "SHO",
        "WPCT",
        "WP",
        "BK",
    ]
    keys: List[str] = []
    for row in rows:
        for k in row:
            if k not in keys:
                keys.append(k)
    ordered = [k for k in base if k in keys]
    ordered.extend(sorted(set(keys) - set(ordered)))
    return ordered


def row_to_csv_dict(fresh: Dict[str, Any]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for k, v in fresh.items():
        if v is None:
            out[k] = ""
        elif k == "player_id":
            out[k] = str(v)
        elif k in ("IP", "ERA", "WPCT"):
            out[k] = str(v)
        else:
            out[k] = str(v)
    if "player_id" not in out and fresh.get("player_id"):
        out["player_id"] = str(fresh["player_id"])
    return out


def upsert_league_file(
    path: Path,
    updates: Dict[str, Dict[str, str]],
) -> Tuple[int, int]:
    """returns (updated_count, added_count)"""
    if path.exists():
        with path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            fn = list(reader.fieldnames or [])
            rows = list(reader)
    else:
        fn = csv_fieldnames(list(updates.values()))
        rows = []

    index_by_pid: Dict[str, int] = {}
    for i, row in enumerate(rows):
        pid = (row.get("player_id") or "").strip()
        if pid:
            index_by_pid[pid] = i

    updated = 0
    added = 0
    for pid, fresh in updates.items():
        if pid in index_by_pid:
            i = index_by_pid[pid]
            merged = {**rows[i], **fresh}
            rows[i] = merged
            updated += 1
        else:
            rows.append(fresh)
            added += 1

    all_keys = set(fn)
    for row in rows:
        all_keys.update(row.keys())
    fieldnames = csv_fieldnames([{k: "" for k in all_keys}])

    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return updated, added


def sync_copy(src: Path) -> None:
    for d in MASTER_DIRS:
        if d == src.parent:
            continue
        if d.is_dir():
            shutil.copy2(src, d / src.name)


def main() -> int:
    if not ROSTER_PATH.exists():
        print(f"❌ 名簿がありません: {ROSTER_PATH}", flush=True)
        return 1

    pitchers = load_roster_pitchers()
    print(f"2026名簿 投手: {len(pitchers)} 名 → {YEAR}年を NPB から再取得", flush=True)

    by_league: Dict[str, Dict[str, Dict[str, str]]] = {"CL": {}, "PL": {}}
    ok = 0
    skip = 0
    fail = 0

    for i, p in enumerate(pitchers, 1):
        pid = p["npb_player_id"]
        fresh = get_player_pitching_for_year(
            pid,
            p["name_ja"],
            p["team"],
            p["league"],
            YEAR,
        )
        if fresh is None:
            skip += 1
        else:
            fresh["player_id"] = pid
            fresh["player_name_ja"] = p["name_ja"]
            fresh["team"] = p["team"]
            fresh["league"] = p["league"]
            by_league[p["league"]][pid] = row_to_csv_dict(fresh)
            ok += 1
        if i % 25 == 0:
            print(f"  ... {i}/{len(pitchers)} (取得 {ok} / なし {skip})", flush=True)
        time.sleep(0.2)

    for league, updates in by_league.items():
        if not updates:
            continue
        primary = MASTER_DIRS[0] / f"pitching_{YEAR}_{league}_from_master.csv"
        primary.parent.mkdir(parents=True, exist_ok=True)
        updated, added = upsert_league_file(primary, updates)
        sync_copy(primary)
        print(
            f"✅ pitching_{YEAR}_{league}: 上書き {updated} / 追加 {added} / 取得計 {len(updates)}",
            flush=True,
        )

    print(f"\n完了: 取得 {ok} / {YEAR}成績なし {skip} / エラー {fail}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
