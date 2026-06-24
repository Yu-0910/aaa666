#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
player_id 空欄の成績行を持つ選手向けに、NPB 成績 HTML から ID を補完し個人ページを生成する。

1. マスタ CSV の空 player_id 行を NPB 公式成績ページから名前照合で埋める
2. 新規に ID が付いた名簿外選手について build_historical_career_player_pages.py を実行
3. ランキングリンクを一括パッチ

Usage:
  python _tools/build_player_pages_for_empty_player_ids.py --dry-run
  python _tools/build_player_pages_for_empty_player_ids.py
  python _tools/build_player_pages_for_empty_player_ids.py --assign-only
  python _tools/build_player_pages_for_empty_player_ids.py --limit 10
"""

from __future__ import annotations

import argparse
import csv
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

_TOOLS = Path(__file__).resolve().parent
_ROOT = _TOOLS.parent
_SCRIPTS = _ROOT / "scripts"
for p in (_TOOLS, str(_SCRIPTS)):
    if p not in sys.path:
        sys.path.insert(0, str(p))

from assign_player_ids import fetch_html_with_player_ids, get_known_player_ids  # noqa: E402
from build_historical_career_player_pages import (  # noqa: E402
    ROOT,
    clean,
    discover_master_files,
    load_roster_ids,
    normalize_npb_id,
    parse_year_league,
)
from audit_stats_without_player_page import MERGED_DIR, load_merged_ids  # noqa: E402

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("pip install requests beautifulsoup4 lxml", file=sys.stderr)
    raise SystemExit(1)

REPORT_CSV = ROOT / "_reports" / "build_pages_empty_player_id.csv"
StatKind = str  # "batting" | "pitching"

_html_cache: Dict[Tuple[int, str, StatKind], Dict[str, str]] = {}


def log(msg: str) -> None:
    print(msg, flush=True)


def normalize_name_for_match(name: str) -> str:
    return name.replace("\u3000", " ").replace("　", " ").strip()


def resolve_player_id(name: str, id_map: Dict[str, str]) -> str:
    key = normalize_name_for_match(name)
    if not key:
        return ""
    if key in id_map:
        return id_map[key]
    for mapped_name, mapped_id in id_map.items():
        if key in mapped_name or mapped_name in key:
            return mapped_id
    return ""


def fetch_pitching_html_with_player_ids(year: int, league: str) -> Dict[str, str]:
    league_u = league.upper()
    if year >= 2025:
        code = "p" if league_u == "PL" else "c"
        url = f"https://npb.jp/bis/{year}/stats/pit_{code}.html"
    else:
        url = f"https://npb.jp/bis/stats/{year}/{league_u.lower()}/pitching.html"

    log(f"fetch pitching HTML: {url}")
    player_id_map: Dict[str, str] = {}
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        response.encoding = response.apparent_encoding or "utf-8"
        html = response.text
        if "/bis/players/" not in html:
            return player_id_map

        link_pattern = r'<a[^>]*href=["\']([^"\']*\/bis\/players\/(\d+)[^"\']*)["\'][^>]*>([^<]+)<\/a>'
        for match in re.finditer(link_pattern, html, re.IGNORECASE):
            player_id = match.group(2)
            player_name_clean = re.sub(r"\([^)]+\)", "", match.group(3).strip()).strip()
            if player_name_clean and len(player_name_clean) < 50:
                norm = normalize_name_for_match(player_name_clean)
                player_id_map.setdefault(norm, player_id)

        soup = BeautifulSoup(html, "lxml")
        for link in soup.find_all("a", href=lambda x: x and "/bis/players/" in x if x else False):
            href = link.get("href", "")
            m = re.search(r"/bis/players/(\d+)", href)
            if not m:
                continue
            player_name_clean = re.sub(r"\([^)]+\)", "", link.get_text(strip=True)).strip()
            if player_name_clean and len(player_name_clean) < 50:
                norm = normalize_name_for_match(player_name_clean)
                player_id_map.setdefault(norm, m.group(1))
    except Exception as e:
        log(f"  pitching fetch error: {e}")
    return player_id_map


def get_id_map(year: int, league: str, kind: StatKind) -> Dict[str, str]:
    cache_key = (year, league.upper(), kind)
    if cache_key in _html_cache:
        return _html_cache[cache_key]

    if kind == "batting":
        id_map = fetch_html_with_player_ids(year, league)
    else:
        id_map = fetch_pitching_html_with_player_ids(year, league)
    id_map.update(get_known_player_ids())
    _html_cache[cache_key] = id_map
    time.sleep(0.5)
    return id_map


def csv_has_empty_player_id(path: Path) -> bool:
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            name = clean(row.get("player_name_ja") or row.get("player_name") or row.get("name"))
            if not name:
                continue
            if not normalize_npb_id(row.get("player_id") or ""):
                return True
    return False


def assign_empty_rows_in_csv(path: Path, dry_run: bool) -> Tuple[int, Set[str]]:
    year, league = parse_year_league(path)
    if year is None or not league:
        return 0, set()

    kind: StatKind = "batting" if path.name.startswith("batting_") else "pitching"
    id_map = get_id_map(year, league, kind)

    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        headers = list(reader.fieldnames or [])
        rows = list(reader)

    if "player_id" not in headers:
        headers.append("player_id")

    updated = 0
    new_ids: Set[str] = set()
    for row in rows:
        if normalize_npb_id(row.get("player_id") or ""):
            continue
        name = clean(row.get("player_name_ja") or row.get("player_name") or row.get("name"))
        if not name:
            continue
        pid = resolve_player_id(name, id_map)
        if not pid:
            continue
        norm_pid = normalize_npb_id(pid)
        if not norm_pid:
            continue
        if not dry_run:
            row["player_id"] = pid
        updated += 1
        new_ids.add(norm_pid)

    if updated and not dry_run:
        backup = path.with_suffix(path.suffix + ".backup_empty_id")
        if path.is_file() and not backup.is_file():
            shutil.copy2(path, backup)
        with path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)

    return updated, new_ids


def build_page_for_id(pid: str, dry_run: bool) -> bool:
    if dry_run:
        return True
    cmd = [
        sys.executable,
        str(ROOT / "_tools" / "build_historical_career_player_pages.py"),
        "--only-id",
        pid,
    ]
    result = subprocess.run(cmd, cwd=str(ROOT))
    return result.returncode == 0


def patch_ranking_links(dry_run: bool) -> None:
    if dry_run:
        log("skip ranking patch (dry-run)")
        return
    cmd = [
        sys.executable,
        str(ROOT / "_tools" / "patch_ranking_player_links_to_npb.py"),
    ]
    subprocess.run(cmd, cwd=str(ROOT), check=False)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="player_id 空欄の成績行から個人ページを生成",
    )
    parser.add_argument("--dry-run", action="store_true", help="書き込み・ビルドなし")
    parser.add_argument("--assign-only", action="store_true", help="ID 補完のみ")
    parser.add_argument("--limit", type=int, default=0, help="ページ生成件数上限（0=無制限）")
    parser.add_argument("--sleep", type=float, default=0.2, help="ページ生成間隔秒")
    args = parser.parse_args()

    roster_ids = load_roster_ids()
    merged_before = load_merged_ids()

    targets = [p for p in discover_master_files() if csv_has_empty_player_id(p)]
    log(f"CSV with empty player_id: {len(targets)} files")

    all_new_ids: Set[str] = set()
    total_rows_updated = 0
    for path in targets:
        n, ids = assign_empty_rows_in_csv(path, dry_run=args.dry_run)
        if n:
            log(f"  {path.relative_to(ROOT)}: {n} rows")
        total_rows_updated += n
        all_new_ids.update(ids)

    # 名簿外かつ merged 無しのみページ生成
    build_ids = sorted(
        pid for pid in all_new_ids if pid not in roster_ids and pid not in merged_before
    )
    if args.limit > 0:
        build_ids = build_ids[: args.limit]

    report_rows: List[Dict[str, str]] = []
    pages_built = 0
    pages_failed = 0

    if not args.assign_only:
        for pid in build_ids:
            ok = build_page_for_id(pid, dry_run=args.dry_run)
            if ok:
                pages_built += 1
            else:
                pages_failed += 1
            report_rows.append(
                {
                    "player_id": pid,
                    "action": "build_page",
                    "status": "ok" if ok else "failed",
                }
            )
            if not args.dry_run and args.sleep > 0:
                time.sleep(args.sleep)

        patch_ranking_links(dry_run=args.dry_run)

    log("")
    log("=== build_player_pages_for_empty_player_ids ===")
    log(f"csv files touched: {len(targets)}")
    log(f"rows assigned player_id: {total_rows_updated}")
    log(f"new unique player_ids: {len(all_new_ids)}")
    log(f"pages to build (non-roster, not merged): {len(build_ids)}")
    log(f"pages built: {pages_built}")
    log(f"pages failed: {pages_failed}")
    log(f"dry_run: {args.dry_run}")
    log(f"assign_only: {args.assign_only}")

    REPORT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with REPORT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["player_id", "action", "status"])
        writer.writeheader()
        writer.writerows(report_rows)
    log(f"report: {REPORT_CSV}")

    return 0 if pages_failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
