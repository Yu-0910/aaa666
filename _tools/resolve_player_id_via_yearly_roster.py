#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
策2: NPB「年度別選手一覧」→ 球団ロスター経由で player_id を確定する。

1. https://npb.jp/bis/players/all/index.html から年度別球団URLを取得
2. 各球団ページの選手リンク（/bis/players/{id}.html）から名前→IDマップを構築
3. マスタ CSV の player_id 空欄行と名前照合して書き込む

Usage:
  python _tools/resolve_player_id_via_yearly_roster.py --dry-run
  python _tools/resolve_player_id_via_yearly_roster.py --year 1976
  python _tools/resolve_player_id_via_yearly_roster.py --limit 50
"""

from __future__ import annotations

import argparse
import csv
import re
import shutil
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Set, Tuple

_TOOLS = Path(__file__).resolve().parent
_ROOT = _TOOLS.parent
_SCRIPTS = _ROOT / "scripts"
for p in (_TOOLS, str(_SCRIPTS)):
    if p not in sys.path:
        sys.path.insert(0, str(p))

from audit_stats_without_player_page import scan_rows_without_player_id  # noqa: E402
from build_historical_career_player_pages import (  # noqa: E402
    ROOT,
    clean,
    discover_master_files,
    normalize_name_key,
    normalize_npb_id,
)
from scrape_2004_pitching_via_all_players import (  # noqa: E402
    get_player_list_from_team_page,
    get_team_urls_for_year,
)

REPORT_CSV = ROOT / "_reports" / "resolve_player_id_via_yearly_roster.csv"
_year_index_cache: Dict[int, Dict[str, str]] = {}


@dataclass
class Candidate:
    key: str
    name: str
    team: str
    years: Set[int] = field(default_factory=set)


def log(msg: str) -> None:
    print(msg, flush=True)


def norm_name(name: str) -> str:
    return re.sub(r"[\s\u3000]+", "", name or "")


def build_year_index(year: int) -> Dict[str, str]:
    """年度の全球団ロスターから 正規化名前 → player_id。"""
    if year in _year_index_cache:
        return _year_index_cache[year]

    index: Dict[str, str] = {}
    teams = get_team_urls_for_year(year)
    log(f"year {year}: {len(teams)} team pages")
    for team_label, _league, team_url in teams:
        players = get_player_list_from_team_page(team_url)
        for pid, name in players:
            key = norm_name(name)
            if key and key not in index:
                index[key] = pid
        time.sleep(0.3)

    _year_index_cache[year] = index
    log(f"  -> {len(index)} unique names")
    return index


def load_candidates(year_filter: int) -> List[Candidate]:
    raw = scan_rows_without_player_id()
    out: List[Candidate] = []
    for key, acc in sorted(raw.items()):
        years = set(acc.years)
        if year_filter and year_filter not in years:
            continue
        out.append(Candidate(key=key, name=acc.name, team=acc.team, years=years))
    return out


def resolve_candidate(cand: Candidate, years_to_scan: List[int]) -> Tuple[str, str]:
    name_key = norm_name(cand.name)
    for year in years_to_scan:
        if year not in cand.years:
            continue
        pid = build_year_index(year).get(name_key, "")
        if pid:
            return pid, f"yearly_roster:{year}"
    return "", ""


def apply_resolved_ids(resolved: Dict[str, str], dry_run: bool) -> int:
    updated = 0
    for path in discover_master_files():
        with path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            headers = list(reader.fieldnames or [])
            rows = list(reader)
        if "player_id" not in headers:
            headers.append("player_id")

        changed = 0
        for row in rows:
            if normalize_npb_id(row.get("player_id") or ""):
                continue
            name = clean(row.get("player_name_ja") or row.get("player_name") or row.get("name"))
            team = clean(row.get("team") or row.get("Team") or row.get("チーム"))
            if not name:
                continue
            pid = resolved.get(normalize_name_key(name, team), "")
            if not pid:
                continue
            if not dry_run:
                row["player_id"] = pid
            changed += 1

        if changed and not dry_run:
            backup = path.with_suffix(path.suffix + ".backup_yearly_roster")
            if not backup.is_file():
                shutil.copy2(path, backup)
            with path.open("w", encoding="utf-8-sig", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
                writer.writeheader()
                writer.writerows(rows)
        updated += changed
    return updated


def main() -> int:
    parser = argparse.ArgumentParser(description="年度別球団ロスター経由で player_id を確定")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--year", type=int, default=0, help="この年度を含む選手のみ")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    candidates = load_candidates(args.year)
    log(f"candidates: {len(candidates)}")
    if args.limit > 0:
        candidates = candidates[: args.limit]

    years_to_scan = sorted({y for c in candidates for y in c.years})
    if args.year:
        years_to_scan = [y for y in years_to_scan if y == args.year]
    log(f"years to index: {years_to_scan}")

    resolved: Dict[str, str] = {}
    report: List[Dict[str, str]] = []
    ok = ng = 0

    for i, cand in enumerate(candidates, 1):
        pid, method = resolve_candidate(cand, years_to_scan)
        if pid:
            resolved[cand.key] = pid
            ok += 1
            status = "resolved"
        else:
            ng += 1
            status = "not_found"
        if i <= 5 or status == "resolved":
            log(f"[{i}] {cand.name} -> {pid or '-'} ({method or '-'})")
        report.append(
            {
                "status": status,
                "player_id": pid,
                "name_ja": cand.name,
                "team": cand.team,
                "years": ",".join(str(y) for y in sorted(cand.years)),
                "method": method,
            }
        )

    rows_updated = apply_resolved_ids(resolved, dry_run=args.dry_run)

    log("")
    log("=== resolve_player_id_via_yearly_roster ===")
    log(f"resolved: {ok}")
    log(f"not_found: {ng}")
    log(f"csv rows updated: {rows_updated}")
    log(f"dry_run: {args.dry_run}")

    REPORT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with REPORT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(
            f, fieldnames=["status", "player_id", "name_ja", "team", "years", "method"]
        )
        w.writeheader()
        w.writerows(report)
    log(f"report: {REPORT_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
