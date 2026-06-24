#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
策3: NPB 選手個人ページ経由で player_id を確定する。

1. マスタ CSV の player_id 空欄行を収集
2. 該当年度の球団別名簿（bis/players/search/yearly/{year}/）から名前照合
3. 残件は NPB 選手検索 → 候補の個人ページを取得し、年度成績の有無で検証
4. 一致した ID をマスタ CSV の空欄行に書き込む

Usage:
  python _tools/resolve_player_id_via_npb_player_pages.py --dry-run
  python _tools/resolve_player_id_via_npb_player_pages.py --limit 20
  python _tools/resolve_player_id_via_npb_player_pages.py
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
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import quote

_TOOLS = Path(__file__).resolve().parent
_ROOT = _TOOLS.parent
_SCRIPTS = _ROOT / "scripts"
for p in (_TOOLS, str(_SCRIPTS)):
    if p not in sys.path:
        sys.path.insert(0, str(p))

import requests  # noqa: E402
from audit_stats_without_player_page import scan_rows_without_player_id  # noqa: E402
from build_historical_career_player_pages import (  # noqa: E402
    ROOT,
    clean,
    discover_master_files,
    normalize_name_key,
    normalize_npb_id,
    parse_year_league,
)
from scrape_2004_pitching_via_all_players import (  # noqa: E402
    get_player_list_from_team_page,
    get_team_urls_for_year,
)

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
NPB_PLAYER_URL = "https://npb.jp/bis/players/{player_id}.html"
REPORT_CSV = ROOT / "_reports" / "resolve_player_id_via_npb_pages.csv"

_year_name_index: Dict[int, Dict[str, str]] = {}
_player_page_cache: Dict[str, str] = {}


@dataclass
class Candidate:
    key: str
    name: str
    team: str
    years: Set[int] = field(default_factory=set)
    has_batting: bool = False
    has_pitching: bool = False


def log(msg: str) -> None:
    print(msg, flush=True)


def norm_name(name: str) -> str:
    return re.sub(r"[\s\u3000]+", "", name or "")


def fetch_html(url: str) -> str:
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        r.encoding = r.apparent_encoding or "utf-8"
        return r.text
    except Exception as e:
        log(f"  fetch error: {url} ({e})")
        return ""


def get_year_name_index(year: int) -> Dict[str, str]:
    if year in _year_name_index:
        return _year_name_index[year]

    index: Dict[str, str] = {}
    teams = get_team_urls_for_year(year)
    log(f"  yearly roster {year}: {len(teams)} teams")
    for _team_label, _league, team_url in teams:
        for pid, name in get_player_list_from_team_page(team_url):
            key = norm_name(name)
            if key and key not in index:
                index[key] = pid
        time.sleep(0.3)
    _year_name_index[year] = index
    return index


def fetch_player_page_html(player_id: str) -> str:
    if player_id in _player_page_cache:
        return _player_page_cache[player_id]
    html = fetch_html(NPB_PLAYER_URL.format(player_id=player_id))
    _player_page_cache[player_id] = html
    time.sleep(0.4)
    return html


def player_page_has_year_stats(html: str, years: Set[int], name: str) -> bool:
    if not html:
        return False
    if norm_name(name) not in norm_name(html):
        return False
    for year in years:
        if re.search(rf"{year}\s*年", html):
            return True
    return False


def extract_player_ids_from_html(html: str, name: str) -> List[str]:
    target = norm_name(name)
    found: List[str] = []
    pattern = re.compile(
        r'<a[^>]*href=["\']([^"\']*?/bis/players/(\d+)(?:\.html)?)["\'][^>]*>([^<]+)</a>',
        re.IGNORECASE,
    )
    for m in pattern.finditer(html):
        pid, link_text = m.group(2), re.sub(r"\([^)]*\)", "", m.group(3)).strip()
        link_norm = norm_name(link_text)
        if not link_norm:
            continue
        if target == link_norm or target in link_norm or link_norm in target:
            if pid not in found:
                found.append(pid)
    return found


def resolve_via_yearly_roster(cand: Candidate) -> Tuple[str, str]:
    for year in sorted(cand.years):
        index = get_year_name_index(year)
        pid = index.get(norm_name(cand.name), "")
        if not pid:
            continue
        html = fetch_player_page_html(pid)
        if player_page_has_year_stats(html, {year}, cand.name):
            return pid, f"yearly_roster:{year}"
    return "", ""


def resolve_via_npb_search(cand: Candidate) -> Tuple[str, str]:
    keyword = cand.name.strip()
    for active in ("", "Y"):
        qs = f"search_keyword={quote(keyword, encoding='utf-8')}"
        if active:
            qs += "&active_flg=Y"
        url = f"https://npb.jp/bis/players/search/result?{qs}"
        html = fetch_html(url)
        if not html:
            continue
        for pid in extract_player_ids_from_html(html, cand.name):
            page = fetch_player_page_html(pid)
            if player_page_has_year_stats(page, cand.years, cand.name):
                return pid, "npb_search+player_page"
        time.sleep(0.5)
    return "", ""


def resolve_candidate(cand: Candidate) -> Tuple[str, str]:
    pid, method = resolve_via_yearly_roster(cand)
    if pid:
        return pid, method
    return resolve_via_npb_search(cand)


def apply_resolved_ids(resolved: Dict[str, str], dry_run: bool) -> int:
    updated = 0
    for path in discover_master_files():
        with path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            headers = list(reader.fieldnames or [])
            rows = list(reader)
        if "player_id" not in headers:
            headers.append("player_id")

        file_changed = 0
        for row in rows:
            if normalize_npb_id(row.get("player_id") or ""):
                continue
            name = clean(row.get("player_name_ja") or row.get("player_name") or row.get("name"))
            team = clean(row.get("team") or row.get("Team") or row.get("チーム"))
            if not name:
                continue
            key = normalize_name_key(name, team)
            pid = resolved.get(key, "")
            if not pid:
                continue
            if not dry_run:
                row["player_id"] = pid
            file_changed += 1

        if file_changed and not dry_run:
            backup = path.with_suffix(path.suffix + ".backup_resolve_id")
            if not backup.is_file():
                shutil.copy2(path, backup)
            with path.open("w", encoding="utf-8-sig", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
                writer.writeheader()
                writer.writerows(rows)
        updated += file_changed
    return updated


def load_candidates() -> List[Candidate]:
    raw = scan_rows_without_player_id()
    out: List[Candidate] = []
    for key, acc in sorted(raw.items()):
        out.append(
            Candidate(
                key=key,
                name=acc.name,
                team=acc.team,
                years=set(acc.years),
                has_batting=acc.has_batting,
                has_pitching=acc.has_pitching,
            )
        )
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="NPB個人ページ経由で player_id を確定")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    candidates = load_candidates()
    log(f"candidates (empty player_id): {len(candidates)}")
    if args.limit > 0:
        candidates = candidates[: args.limit]

    resolved: Dict[str, str] = {}
    report_rows: List[Dict[str, str]] = []
    ok = 0
    ng = 0

    for i, cand in enumerate(candidates, 1):
        log(f"[{i}/{len(candidates)}] {cand.name} ({cand.team}) years={sorted(cand.years)}")
        pid, method = resolve_candidate(cand)
        if pid:
            resolved[cand.key] = pid
            ok += 1
            status = "resolved"
        else:
            ng += 1
            status = "not_found"
        report_rows.append(
            {
                "status": status,
                "player_id": pid,
                "name_ja": cand.name,
                "team": cand.team,
                "years": ",".join(str(y) for y in sorted(cand.years)),
                "method": method,
            }
        )

    rows_updated = 0
    if resolved and not args.dry_run:
        rows_updated = apply_resolved_ids(resolved, dry_run=False)
    elif resolved and args.dry_run:
        rows_updated = apply_resolved_ids(resolved, dry_run=True)

    log("")
    log("=== resolve_player_id_via_npb_player_pages ===")
    log(f"resolved: {ok}")
    log(f"not_found: {ng}")
    log(f"csv rows to update: {rows_updated}")
    log(f"dry_run: {args.dry_run}")

    REPORT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with REPORT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["status", "player_id", "name_ja", "team", "years", "method"],
        )
        writer.writeheader()
        writer.writerows(report_rows)
    log(f"report: {REPORT_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
