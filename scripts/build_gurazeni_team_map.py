#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
グラゼニ 2026年チーム別ページから gurazeni_id を一括取得し、名簿と突合。

https://www.gurazeni.com/team/1 .. /team/12

Usage:
  python scripts/build_gurazeni_team_map.py
  python scripts/build_gurazeni_team_map.py --write-salary-map
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

try:
    import requests
except ImportError:
    print("pip install requests")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from gurazeni_team import (  # noqa: E402
    GURAZENI_TEAM_PAGES,
    GURAZENI_TEAM_URL,
    build_team_lookup,
    normalize_name_key,
    parse_team_roster_table,
    resolve_gurazeni_from_team,
)
from gurazeni_team import fetch_html  # noqa: E402

TARGETS = ROOT / "_data" / "player_profile" / "_targets_2026.json"
OUT_JSON = ROOT / "_data" / "player_profile" / "gurazeni_team_2026_map.json"
CACHE_DIR = ROOT / "_data" / "cache" / "gurazeni_team_page"
SALARY_MAP = ROOT / "_data" / "player_profile" / "salary_site_map.csv"
OUT_UNMATCHED = ROOT / "_reports" / "gurazeni_team_map_unmatched.csv"


def log(msg: str) -> None:
    print(msg, flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--write-salary-map", action="store_true")
    args = parser.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    rosters_by_team: Dict[str, List[Dict[str, Any]]] = {}
    teams_meta: List[Dict[str, Any]] = []

    log(f"=== グラゼニ チーム別マップ ({args.year}年) ===")
    for team_id, short, roster_team in GURAZENI_TEAM_PAGES:
        url = GURAZENI_TEAM_URL.format(team_id=team_id)
        cache = CACHE_DIR / f"team_{team_id}_{args.year}.html"
        html = None
        if cache.is_file() and not args.force:
            html = cache.read_text(encoding="utf-8", errors="replace")
        else:
            html = fetch_html(url)
            if html:
                cache.write_text(html, encoding="utf-8")
            time.sleep(args.delay)
        if not html:
            log(f"  FAIL: {short} ({url})")
            continue
        rows = parse_team_roster_table(html, args.year)
        for r in rows:
            r["roster_team"] = roster_team
            r["gurazeni_team_id"] = team_id
        rosters_by_team[roster_team] = rows
        teams_meta.append(
            {"team_id": team_id, "short": short, "roster_team": roster_team, "players": len(rows)}
        )
        log(f"  {short}: {len(rows)} 人 <- {url}")

    lookup = build_team_lookup(rosters_by_team)
    payload = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "year": args.year,
        "teams": teams_meta,
        "lookup_count": len(lookup),
        "rosters_by_team": rosters_by_team,
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"\n保存: {OUT_JSON} (lookup keys={len(lookup)})")

    if not TARGETS.is_file():
        log("名簿なし。突合スキップ。")
        return 0

    targets = json.loads(TARGETS.read_text(encoding="utf-8"))
    matched = 0
    unmatched: List[Dict[str, str]] = []
    map_rows: Dict[str, Dict[str, str]] = {}

    if SALARY_MAP.is_file():
        with SALARY_MAP.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                pid = (row.get("npb_player_id") or "").strip()
                if pid:
                    map_rows[pid] = row

    for t in targets:
        pid = (t.get("npb_player_id") or "").strip()
        name = (t.get("name_ja") or "").strip()
        team = (t.get("team") or "").strip()
        hit = resolve_gurazeni_from_team(name, team, lookup)
        if hit:
            matched += 1
            map_rows[pid] = {
                "npb_player_id": pid,
                "name_ja": name,
                "gurazeni_id": hit["gurazeni_id"],
                "baseballinfo_slug": map_rows.get(pid, {}).get("baseballinfo_slug", ""),
                "match_method": "gurazeni_team_2026",
                "confidence": "high",
            }
        else:
            unmatched.append(
                {"npb_player_id": pid, "name_ja": name, "team": team, "name_key": normalize_name_key(name)}
            )

    log(f"名簿突合: {matched}/{len(targets)} 人")

    OUT_UNMATCHED.parent.mkdir(parents=True, exist_ok=True)
    with OUT_UNMATCHED.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["npb_player_id", "name_ja", "team", "name_key"])
        w.writeheader()
        w.writerows(unmatched)
    log(f"未一致: {len(unmatched)} 人 -> {OUT_UNMATCHED}")

    if args.write_salary_map:
        SALARY_MAP.parent.mkdir(parents=True, exist_ok=True)
        fields = [
            "npb_player_id",
            "name_ja",
            "gurazeni_id",
            "baseballinfo_slug",
            "match_method",
            "confidence",
        ]
        with SALARY_MAP.open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            for pid in sorted(map_rows.keys()):
                w.writerow(map_rows[pid])
        log(f"salary_site_map 更新: {SALARY_MAP}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
