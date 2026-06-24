#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
成績行があるのに個人ページ merged JSON が無い選手を特定する。

比較:
  集合A … マスタ CSV（batting/pitching *_from_master.csv）に成績行がある選手
  集合B … _data/derived/player_profile/merged/npb_{id}.json が存在する選手

Usage:
  python _tools/audit_stats_without_player_page.py
  python _tools/audit_stats_without_player_page.py --only-missing
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Set, Tuple

_TOOLS = Path(__file__).resolve().parent
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))

from build_historical_career_player_pages import (  # noqa: E402
    ROOT,
    clean,
    discover_master_files,
    load_roster_ids,
    normalize_name_key,
    normalize_npb_id,
    parse_year_league,
    scan_master_players,
)

MERGED_DIR = ROOT / "_data" / "derived" / "player_profile" / "merged"
REPORT_CSV = ROOT / "_reports" / "stats_without_player_page.csv"
SUMMARY_TXT = ROOT / "_reports" / "stats_without_player_page_summary.txt"


@dataclass
class NoIdPlayer:
    name: str
    team: str
    has_batting: bool = False
    has_pitching: bool = False
    row_count: int = 0
    years: Set[int] = field(default_factory=set)


def load_merged_ids() -> Set[str]:
    ids: Set[str] = set()
    if not MERGED_DIR.is_dir():
        return ids
    for path in MERGED_DIR.glob("npb_*.json"):
        pid = normalize_npb_id(path.stem.removeprefix("npb_"))
        if pid:
            ids.add(pid)
    return ids


def scan_rows_without_player_id() -> Dict[str, NoIdPlayer]:
    """player_id 空欄の成績行（名前+球団でユニーク）。"""
    players: Dict[str, NoIdPlayer] = {}
    for path in discover_master_files():
        year, _league = parse_year_league(path)
        if year is None:
            continue
        kind = "batting" if path.name.startswith("batting_") else "pitching"
        with path.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                if normalize_npb_id(row.get("player_id") or ""):
                    continue
                name = clean(row.get("player_name_ja") or row.get("player_name") or row.get("name"))
                if not name:
                    continue
                team = clean(row.get("team") or row.get("Team") or row.get("チーム"))
                key = normalize_name_key(name, team)
                if key not in players:
                    players[key] = NoIdPlayer(name=name, team=team)
                acc = players[key]
                acc.row_count += 1
                acc.years.add(year)
                if kind == "batting":
                    acc.has_batting = True
                else:
                    acc.has_pitching = True
    return players


def main() -> int:
    parser = argparse.ArgumentParser(
        description="成績行あり・個人ページ merged なしの選手を監査",
    )
    parser.add_argument(
        "--only-missing",
        action="store_true",
        help="merged 無しのみ CSV に出力（サマリは常に表示）",
    )
    args = parser.parse_args()

    roster_ids = load_roster_ids()
    with_id = scan_master_players()
    merged_ids = load_merged_ids()
    no_id = scan_rows_without_player_id()

    missing_with_id: List[Dict[str, str]] = []
    has_merged_with_id = 0

    for pid, acc in sorted(with_id.items()):
        has_merged = pid in merged_ids
        if has_merged:
            has_merged_with_id += 1
            if args.only_missing:
                continue
        else:
            category = "roster_2026" if pid in roster_ids else "historical"
            missing_with_id.append(
                {
                    "issue": "missing_merged",
                    "player_id": pid,
                    "name_ja": acc.best_name(),
                    "team": acc.best_team(),
                    "has_batting": str(acc.has_batting),
                    "has_pitching": str(acc.has_pitching),
                    "in_roster_2026": str(pid in roster_ids),
                    "category": category,
                }
            )

    no_id_rows: List[Dict[str, str]] = []
    for key in sorted(no_id.keys()):
        acc = no_id[key]
        no_id_rows.append(
            {
                "issue": "empty_player_id",
                "player_id": "",
                "name_ja": acc.name,
                "team": acc.team,
                "has_batting": str(acc.has_batting),
                "has_pitching": str(acc.has_pitching),
                "in_roster_2026": "",
                "category": "needs_player_id",
                "row_count": str(acc.row_count),
                "years_sample": str(min(acc.years)) if acc.years else "",
            }
        )

    missing_historical = sum(1 for r in missing_with_id if r["category"] == "historical")
    missing_roster = sum(1 for r in missing_with_id if r["category"] == "roster_2026")

    summary_lines = [
        "=== stats vs player page audit ===",
        f"master players (with player_id): {len(with_id)}",
        f"merged npb_*.json: {len(merged_ids)}",
        f"roster 2026: {len(roster_ids)}",
        "",
        f"with_id + has merged: {has_merged_with_id}",
        f"with_id + missing merged (total): {len(missing_with_id)}",
        f"  - historical (non-roster): {missing_historical}",
        f"  - roster 2026: {missing_roster}",
        f"stats rows with empty player_id (unique name|team): {len(no_id_rows)}",
        "",
        f"report: {REPORT_CSV}",
    ]

    for line in summary_lines:
        print(line, flush=True)

    REPORT_CSV.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "issue",
        "player_id",
        "name_ja",
        "team",
        "has_batting",
        "has_pitching",
        "in_roster_2026",
        "category",
        "row_count",
        "years_sample",
    ]
    with REPORT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in missing_with_id:
            writer.writerow(row)
        for row in no_id_rows:
            writer.writerow(row)

    SUMMARY_TXT.write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
