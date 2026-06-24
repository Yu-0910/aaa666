#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
2025 打撃マスタ CSV の player_id / team を 2026 名簿で補完する。

- player_id 空欄 → 名簿から補完
- team 空欄 → 名簿から補完
- team 空で名前+球団マッチ不可の行 → 名簿内で名前が一意なら名前のみで照合

Usage:
  python scripts/fill_batting_player_ids_from_roster.py
  python scripts/fill_batting_player_ids_from_roster.py --dry-run
"""

from __future__ import annotations

import argparse
import csv
import io
import shutil
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from lib.player_name_match import name_keys_for_matching, normalize_name_team_keys  # noqa: E402

DEFAULT_ROSTER = ROOT / "_data" / "npb_roster_2026.csv"
DEFAULT_MASTER_DIR = ROOT / "_data" / "master_csv_calculated"
REPORT = ROOT / "_reports" / "fill_batting_player_ids_from_roster.csv"


@dataclass(frozen=True)
class RosterHit:
    pid: str
    team: str


def log(msg: str) -> None:
    print(msg, flush=True)


def load_roster_maps(path: Path) -> Tuple[Dict[str, RosterHit], Dict[str, RosterHit]]:
    by_name_team: Dict[str, RosterHit] = {}
    by_name_lists: Dict[str, List[RosterHit]] = defaultdict(list)

    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            pid = (row.get("npb_player_id") or row.get("player_id") or "").strip()
            name = (row.get("name_ja") or "").strip()
            team = (row.get("team") or "").strip()
            if not pid or not name:
                continue
            hit = RosterHit(pid=pid, team=team)
            for key in normalize_name_team_keys(name, team):
                by_name_team.setdefault(key, hit)
            for nk in name_keys_for_matching(name):
                by_name_lists[nk].append(hit)

    by_name_unique: Dict[str, RosterHit] = {}
    for nk, hits in by_name_lists.items():
        if len(hits) == 1:
            by_name_unique[nk] = hits[0]

    return by_name_team, by_name_unique


def resolve_roster_hit(
    name: str,
    team: str,
    by_name_team: Dict[str, RosterHit],
    by_name_unique: Dict[str, RosterHit],
) -> Tuple[Optional[RosterHit], str]:
    for key in normalize_name_team_keys(name, team):
        hit = by_name_team.get(key)
        if hit:
            return hit, key
    if not (team or "").strip():
        for nk in name_keys_for_matching(name):
            hit = by_name_unique.get(nk)
            if hit:
                return hit, f"{nk}|(name-only)"
    return None, ""


def batting_files(master_dir: Path, year: int) -> List[Path]:
    return sorted(master_dir.glob(f"batting_{year}_*_from_master.csv"))


def fill_csv(
    csv_path: Path,
    by_name_team: Dict[str, RosterHit],
    by_name_unique: Dict[str, RosterHit],
    *,
    dry_run: bool,
) -> Tuple[int, int, List[Dict[str, str]]]:
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)

    for col in ("player_id", "team"):
        if col not in fieldnames:
            fieldnames.append(col)

    filled = 0
    still_empty = 0
    report: List[Dict[str, str]] = []

    for row in rows:
        name = (row.get("player_name_ja") or row.get("name") or "").strip()
        if not name:
            still_empty += 1
            continue

        team = (row.get("team") or "").strip()
        existing_pid = (row.get("player_id") or "").strip()
        hit, matched_key = resolve_roster_hit(name, team, by_name_team, by_name_unique)
        if not hit:
            if not existing_pid:
                still_empty += 1
            continue

        changed: List[str] = []
        if not existing_pid:
            row["player_id"] = hit.pid
            changed.append("player_id")
        if not team and hit.team:
            row["team"] = hit.team
            changed.append("team")

        if not changed:
            continue

        filled += 1
        report.append(
            {
                "file": csv_path.name,
                "player_name_ja": name,
                "team_before": team,
                "team_after": (row.get("team") or "").strip(),
                "npb_player_id": hit.pid,
                "match_key": matched_key,
                "changed": "+".join(changed),
            }
        )

    if filled and not dry_run:
        backup = csv_path.with_suffix(
            csv_path.suffix + f".bak_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
        )
        shutil.copy2(csv_path, backup)
        with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)

    return filled, still_empty, report


def main() -> int:
    parser = argparse.ArgumentParser(description="打撃マスタ CSV の player_id / team を名簿で補完")
    parser.add_argument("--roster", type=Path, default=DEFAULT_ROSTER)
    parser.add_argument("--master-dir", type=Path, default=DEFAULT_MASTER_DIR)
    parser.add_argument("--year", type=int, default=2025)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.roster.is_file():
        log(f"ERROR: 名簿がありません: {args.roster}")
        return 1
    if not args.master_dir.is_dir():
        log(f"ERROR: マスタディレクトリがありません: {args.master_dir}")
        return 1

    files = batting_files(args.master_dir, args.year)
    if not files:
        log(f"ERROR: batting_{args.year}_*_from_master.csv が見つかりません: {args.master_dir}")
        return 1

    by_name_team, by_name_unique = load_roster_maps(args.roster)
    log(f"名簿索引: 名前+球団 {len(by_name_team)} / 名前一意 {len(by_name_unique)}")
    log(f"対象: {[p.name for p in files]}")
    if args.dry_run:
        log("(--dry-run: CSV は書き換えません)")

    all_report: List[Dict[str, str]] = []
    total_filled = 0
    total_still_empty = 0

    for path in files:
        filled, still_empty, rep = fill_csv(
            path, by_name_team, by_name_unique, dry_run=args.dry_run
        )
        total_filled += filled
        total_still_empty += still_empty
        all_report.extend(rep)
        log(f"  {path.name}: 更新 {filled} / 未解決 {still_empty}")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    with REPORT.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "file",
                "player_name_ja",
                "team_before",
                "team_after",
                "npb_player_id",
                "match_key",
                "changed",
            ],
        )
        w.writeheader()
        w.writerows(all_report)

    log(f"合計 更新 {total_filled} / 未解決 {total_still_empty}")
    log(f"レポート: {REPORT}")
    if total_filled and not args.dry_run:
        log("次: npm run player-profile:rebuild-career-2026")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
