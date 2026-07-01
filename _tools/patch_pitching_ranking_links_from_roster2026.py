#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
投手ランキング JSON の player-N を 2026 名簿の NPB player_id に差し替える。

対象:
  public/data/rankings/pitching/**/*.json

索引:
  _data/npb_roster_2026.csv（name_ja + team の一意一致のみ）

Usage:
  python _tools/patch_pitching_ranking_links_from_roster2026.py --dry-run
  python _tools/patch_pitching_ranking_links_from_roster2026.py
  python _tools/patch_pitching_ranking_links_from_roster2026.py --dry-run --only-name "小川 泰弘"
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
ROSTER_PATH = ROOT / "_data" / "npb_roster_2026.csv"
PITCHING_ROOT = ROOT / "public" / "data" / "rankings" / "pitching"
REPORT_PATH = ROOT / "_reports" / "patch_pitching_ranking_links_from_roster2026.csv"


def log(msg: str) -> None:
    print(msg, flush=True)


def clean(value: Any) -> str:
    return str(value or "").strip()


def normalize_name(name: str) -> str:
    return re.sub(r"[\s\u3000]+", "", name)


def name_team_key(name: str, team: str) -> str:
    return f"{normalize_name(name)}|{clean(team)}"


def is_placeholder_player_id(value: str) -> bool:
    return clean(value).lower().startswith("player-")


class RosterEntry:
    __slots__ = ("npb_player_id", "name_ja", "team", "name_en_short")

    def __init__(self, npb_player_id: str, name_ja: str, team: str, name_en_short: str) -> None:
        self.npb_player_id = npb_player_id
        self.name_ja = name_ja
        self.team = team
        self.name_en_short = name_en_short


def load_roster_index(path: Path) -> Dict[str, RosterEntry]:
    buckets: Dict[str, List[RosterEntry]] = defaultdict(list)
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            npb_id = clean(row.get("npb_player_id") or row.get("player_id"))
            name_ja = clean(row.get("name_ja"))
            team = clean(row.get("team"))
            if not npb_id or not name_ja or not team:
                continue
            entry = RosterEntry(
                npb_player_id=npb_id,
                name_ja=name_ja,
                team=team,
                name_en_short=clean(row.get("name_en_short")),
            )
            buckets[name_team_key(name_ja, team)].append(entry)

    index: Dict[str, RosterEntry] = {}
    for key, entries in buckets.items():
        if len(entries) == 1:
            index[key] = entries[0]
    return index


def resolve_roster_entry(row: Dict[str, Any], index: Dict[str, RosterEntry]) -> Optional[RosterEntry]:
    name = clean(row.get("name") or row.get("player"))
    team = clean(row.get("team"))
    if not name or not team:
        return None
    return index.get(name_team_key(name, team))


def patch_pitching_file(
    path: Path,
    index: Dict[str, RosterEntry],
    dry_run: bool,
    only_name: str,
) -> Tuple[int, List[Dict[str, str]]]:
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return 0, []
    if not isinstance(rows, list):
        return 0, []

    changed = 0
    report: List[Dict[str, str]] = []
    only_norm = normalize_name(only_name) if only_name else ""

    for row in rows:
        if not isinstance(row, dict):
            continue

        display_name = clean(row.get("name") or row.get("player"))
        if only_norm and normalize_name(display_name) != only_norm:
            continue

        old_id = clean(row.get("playerId") or row.get("player_id"))
        if not is_placeholder_player_id(old_id):
            continue

        entry = resolve_roster_entry(row, index)
        if not entry:
            continue

        npb_id = entry.npb_player_id
        current_npb = clean(row.get("npbPlayerId") or row.get("npb_player_id"))
        if old_id == npb_id and current_npb == npb_id:
            continue

        roman_before = clean(row.get("romanName") or row.get("roman_name"))
        roman_after = roman_before or entry.name_en_short

        if not dry_run:
            row["playerId"] = npb_id
            row["npbPlayerId"] = npb_id
            if roman_after and not roman_before:
                row["romanName"] = roman_after

        changed += 1
        report.append(
            {
                "file": str(path.relative_to(ROOT)),
                "name": display_name,
                "team": clean(row.get("team")),
                "old_player_id": old_id,
                "new_player_id": npb_id,
                "roman_name": roman_after,
            }
        )

    if changed and not dry_run:
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return changed, report


def write_report(report_rows: Iterable[Dict[str, str]]) -> None:
    rows = list(report_rows)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["file", "name", "team", "old_player_id", "new_player_id", "roman_name"],
        )
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="投手ランキング JSON の player-N を 2026 名簿 NPB ID に差し替え",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--only-name", type=str, default="", help="指定選手名のみ（空白無視）")
    args = parser.parse_args()

    if not ROSTER_PATH.is_file():
        log(f"ERROR: roster missing: {ROSTER_PATH}")
        return 1
    if not PITCHING_ROOT.is_dir():
        log(f"ERROR: pitching rankings dir missing: {PITCHING_ROOT}")
        return 1

    index = load_roster_index(ROSTER_PATH)
    log(f"roster index: {len(index)} unique name+team keys from {ROSTER_PATH.name}")

    files = sorted(PITCHING_ROOT.rglob("*.json"))
    total_changed = 0
    all_report: List[Dict[str, str]] = []

    for path in files:
        n, rep = patch_pitching_file(path, index, args.dry_run, args.only_name)
        if n:
            total_changed += n
            all_report.extend(rep)

    if not args.dry_run:
        write_report(all_report)

    log("")
    log(f"{'[dry-run] ' if args.dry_run else ''}patched rows: {total_changed}")
    if not args.dry_run:
        log(f"report: {REPORT_PATH}")

    sample = [r for r in all_report if normalize_name(r.get("name", "")) == normalize_name(args.only_name)]
    if args.only_name and sample:
        log("")
        log(f"{args.only_name} 例:")
        for r in sample[:5]:
            log(f"  {r['file']}: {r['old_player_id']} -> {r['new_player_id']} ({r['roman_name']})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
