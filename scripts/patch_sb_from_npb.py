#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NPB公式から master CSV の盗塁(SB)・盗塁刺(CS)を修復する。

原因: scrape 時に「盗塁刺」列が「盗塁」より先に判定されず CS が SB に入るバグ。

修復ソース（優先順）:
  1. 2005年以降: 盗塁リーダーボード / 規定打席者表 / チーム別 idb1_* 表
  2. 全年度: 選手個人ページ（player_id）の年度別打撃成績
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("❌ pip install requests beautifulsoup4 lxml")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
CACHE_PATH = ROOT / "_data" / "cache" / "npb_player_sb_cs_by_year.json"
DATA_DIRS = [
    ROOT / "_data" / "master_csv_calculated",
    ROOT / "_data" / "master_csv",
    ROOT / "_data" / "master_csv__import_1950_2024",
]

FILENAME_RE = re.compile(r"^batting_(\d{4})_(CL|PL)_from_master\.csv$")


def norm_name(name: str) -> str:
    s = re.sub(r"\([^)]*\)", "", name or "").strip()
    return re.sub(r"[\s\u3000]+", "", s)


def safe_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None


def is_player_name_header(text: str) -> bool:
    return "選手" in text or ("選" in text and "手" in text)


def fetch_html(url: str, retry: int = 3) -> Optional[str]:
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    last_err: Optional[Exception] = None
    for attempt in range(retry):
        try:
            if attempt:
                time.sleep(1.2 * attempt)
            resp = requests.get(url, headers=headers, timeout=30)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.content.decode("utf-8", errors="replace")
        except Exception as exc:
            last_err = exc
    print(f"  ⚠️ fetch failed: {url} ({last_err})")
    return None


def build_col_map(header_cells: List[str]) -> Dict[str, int]:
    col_map: Dict[str, int] = {}
    for idx, header_text in enumerate(header_cells):
        if is_player_name_header(header_text):
            col_map["name"] = idx
        elif header_text in ("年度", "年"):
            col_map["year"] = idx
        elif "打点" in header_text or header_text == "RBI":
            col_map["RBI"] = idx
        elif "盗塁刺" in header_text or "盗塁死" in header_text or header_text == "CS":
            col_map["CS"] = idx
        elif header_text == "盗塁" or header_text == "SB":
            col_map["SB"] = idx
    return col_map


def parse_batting_tables(html: str) -> Dict[str, Tuple[int, Optional[int]]]:
    """選手名 -> (SB, CS)"""
    soup = BeautifulSoup(html, "lxml")
    out: Dict[str, Tuple[int, Optional[int]]] = {}
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        header_idx = None
        header_cells: List[str] = []
        for i, row in enumerate(rows):
            cells = [c.get_text(strip=True) for c in row.find_all(["th", "td"])]
            joined = " ".join(cells)
            if "盗塁" in joined and (is_player_name_header(joined) or "順位" in joined):
                header_idx = i
                header_cells = cells
                break
        if header_idx is None:
            continue
        col_map = build_col_map(header_cells)
        if "name" not in col_map or "SB" not in col_map:
            continue
        for row in rows[header_idx + 1 :]:
            cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
            if len(cells) <= col_map["name"]:
                continue
            name_raw = cells[col_map["name"]]
            if not name_raw or name_raw in ("選手", "選\u3000手"):
                continue
            key = norm_name(name_raw)
            if not key:
                continue
            sb = safe_int(cells[col_map["SB"]]) if col_map["SB"] < len(cells) else None
            cs = safe_int(cells[col_map["CS"]]) if "CS" in col_map and col_map["CS"] < len(cells) else None
            if sb is not None:
                out[key] = (sb, cs)
    return out


def parse_lb_sb(html: str) -> Dict[str, int]:
    soup = BeautifulSoup(html, "lxml")
    out: Dict[str, int] = {}
    for tr in soup.find_all("tr"):
        cells = [c.get_text(strip=True) for c in tr.find_all(["td", "th"])]
        if len(cells) >= 4 and cells[0].isdigit():
            sb = safe_int(cells[3])
            if sb is not None:
                out[norm_name(cells[1])] = sb
        # リーダーズ埋め込み行: ..., '盗塁', rank, name, team, sb, ...
        if "盗塁" in cells:
            try:
                i = cells.index("盗塁")
            except ValueError:
                continue
            j = i + 1
            while j + 3 < len(cells):
                if not cells[j].isdigit():
                    break
                name = cells[j + 1]
                sb = safe_int(cells[j + 3])
                if name and sb is not None:
                    out[norm_name(name)] = sb
                j += 4
    return out


def parse_player_page(html: str) -> Dict[int, Tuple[int, Optional[int]]]:
    """year -> (SB, CS)"""
    soup = BeautifulSoup(html, "lxml")
    result: Dict[int, Tuple[int, Optional[int]]] = {}
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        header_idx = None
        header_cells: List[str] = []
        for i, row in enumerate(rows):
            cells = [c.get_text(strip=True) for c in row.find_all(["th", "td"])]
            if "年度" in cells and "盗塁" in cells and "試合" in cells:
                header_idx = i
                header_cells = cells
                break
        if header_idx is None:
            continue
        col_map = build_col_map(header_cells)
        if "year" not in col_map or "SB" not in col_map:
            continue
        for row in rows[header_idx + 1 :]:
            cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
            if len(cells) <= col_map["year"]:
                continue
            year = safe_int(cells[col_map["year"]])
            if year is None or year < 1900:
                continue
            sb = safe_int(cells[col_map["SB"]]) if col_map["SB"] < len(cells) else None
            cs = safe_int(cells[col_map["CS"]]) if "CS" in col_map and col_map["CS"] < len(cells) else None
            if sb is not None:
                result[year] = (sb, cs)
    return result


def npb_batting_url(year: int, league: str) -> str:
    code = "p" if league.upper() == "PL" else "c"
    return f"https://npb.jp/bis/{year}/stats/bat_{code}.html"


def npb_lb_sb_url(year: int, league: str) -> str:
    code = "p" if league.upper() == "PL" else "c"
    return f"https://npb.jp/bis/{year}/stats/lb_sb_{code}.html"


def npb_idb_urls_from_index(year: int, league: str) -> List[str]:
    lg = "cl" if league.upper() == "CL" else "pl"
    index_url = f"https://npb.jp/bis/{year}/leagues/index_{lg}.html"
    html = fetch_html(index_url)
    if not html:
        return []
    pages = sorted(set(re.findall(rf"/bis/{year}/stats/(idb1_[a-z]+)\.html", html)))
    return [f"https://npb.jp/bis/{year}/stats/{p}.html" for p in pages if p != "idb1_db"]


def npb_yearly_url(year: int, league: str) -> str:
    if league.upper() == "CL":
        return f"https://npb.jp/bis/yearly/centralleague_{year}.html"
    return f"https://npb.jp/bis/yearly/pacificleague_{year}.html"


def fetch_season_maps(year: int, league: str, sleep: float) -> Tuple[Dict[str, Tuple[int, Optional[int]]], List[str]]:
    merged: Dict[str, Tuple[int, Optional[int]]] = {}
    sources: List[str] = []

    if year >= 2005:
        html = fetch_html(npb_lb_sb_url(year, league))
        if html:
            for name, sb in parse_lb_sb(html).items():
                prev = merged.get(name)
                merged[name] = (sb, prev[1] if prev else None)
            sources.append("lb_sb")
        time.sleep(sleep)

        html = fetch_html(npb_batting_url(year, league))
        if html:
            merged.update(parse_batting_tables(html))
            sources.append("bat")
        time.sleep(sleep)

        for url in npb_idb_urls_from_index(year, league):
            html = fetch_html(url)
            if html:
                merged.update(parse_batting_tables(html))
            time.sleep(sleep * 0.25)
        if any("idb" in s for s in sources) or merged:
            sources.append("idb")

    if year < 2005 or not merged:
        html = fetch_html(npb_yearly_url(year, league))
        if html:
            yearly = parse_batting_tables(html)
            merged.update(yearly)
            sources.append("yearly")

    return merged, sources


def load_cache() -> Dict[str, Dict[str, List[Optional[int]]]]:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: Dict[str, Dict[str, List[Optional[int]]]]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def ensure_player_cache(
    player_ids: Set[str],
    cache: Dict[str, Dict[str, List[Optional[int]]]],
    sleep: float,
) -> int:
    fetched = 0
    for i, pid in enumerate(sorted(player_ids), 1):
        if pid in cache:
            continue
        url = f"https://npb.jp/bis/players/{pid}.html"
        html = fetch_html(url)
        if not html:
            cache[pid] = {}
            fetched += 1
            time.sleep(sleep)
            continue
        by_year = parse_player_page(html)
        cache[pid] = {str(y): [sb, cs] for y, (sb, cs) in by_year.items()}
        fetched += 1
        if fetched % 50 == 0:
            print(f"  player pages: {fetched}/{len(player_ids)} ...")
            save_cache(cache)
        time.sleep(sleep)
    save_cache(cache)
    return fetched


def discover_csv_files(year_from: int, year_to: int, leagues: List[str]) -> List[Path]:
    paths: List[Path] = []
    seen: Set[str] = set()
    for data_dir in DATA_DIRS:
        if not data_dir.exists():
            continue
        for path in sorted(data_dir.glob("batting_*_from_master.csv")):
            m = FILENAME_RE.match(path.name)
            if not m:
                continue
            year, league = int(m.group(1)), m.group(2)
            if year < year_from or year > year_to or year >= 2026 or league not in leagues:
                continue
            key = f"{year}:{league}:{data_dir.name}"
            if key in seen:
                continue
            seen.add(key)
            paths.append(path)
    return paths


def collect_player_ids(csv_paths: List[Path]) -> Set[str]:
    ids: Set[str] = set()
    for path in csv_paths:
        with path.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                pid = str(row.get("player_id", "")).strip()
                if pid:
                    ids.add(pid)
    return ids


def patch_csv_file(
    csv_path: Path,
    year: int,
    league: str,
    season_map: Dict[str, Tuple[int, Optional[int]]],
    player_cache: Dict[str, Dict[str, List[Optional[int]]]],
    dry_run: bool,
) -> int:
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        rows = list(reader)
    if "SB" not in fieldnames:
        return 0

    updated = 0
    year_key = str(year)
    for row in rows:
        new_sb: Optional[int] = None
        new_cs: Optional[int] = None

        name_key = norm_name(row.get("player_name_ja", ""))
        if name_key and name_key in season_map:
            new_sb, new_cs = season_map[name_key]

        pid = str(row.get("player_id", "")).strip()
        if pid and pid in player_cache and year_key in player_cache[pid]:
            sb_v, cs_v = player_cache[pid][year_key]
            if sb_v is not None:
                new_sb = sb_v
            if cs_v is not None:
                new_cs = cs_v

        if new_sb is None:
            continue

        old_sb = safe_int(row.get("SB"))
        old_cs = safe_int(row.get("CS"))
        changed = False
        if old_sb != new_sb:
            row["SB"] = str(new_sb)
            changed = True
        if new_cs is not None and "CS" in fieldnames and old_cs != new_cs:
            row["CS"] = str(new_cs)
            changed = True
        if new_sb is not None and "盗塁" in fieldnames and safe_int(row.get("盗塁")) != new_sb:
            row["盗塁"] = str(new_sb)
            changed = True
        if new_cs is not None and "盗塁死" in fieldnames and safe_int(row.get("盗塁死")) != new_cs:
            row["盗塁死"] = str(new_cs)
            changed = True
        if changed:
            updated += 1

    if updated and not dry_run:
        with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
    return updated


def main() -> None:
    parser = argparse.ArgumentParser(description="NPB公式から盗塁(SB)をmaster CSVに反映")
    parser.add_argument("--year-from", type=int, default=1950)
    parser.add_argument("--year-to", type=int, default=2025)
    parser.add_argument("--year", type=int)
    parser.add_argument("--league", choices=["CL", "PL"])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sleep", type=float, default=0.3)
    parser.add_argument("--skip-player-fetch", action="store_true", help="選手ページ取得をスキップ")
    parser.add_argument("--rebuild-rankings", action="store_true")
    args = parser.parse_args()

    year_from = args.year or args.year_from
    year_to = args.year or args.year_to
    leagues = [args.league] if args.league else ["CL", "PL"]

    csv_paths = discover_csv_files(year_from, year_to, leagues)
    if not csv_paths:
        print("対象CSVなし")
        sys.exit(1)

    player_cache = load_cache()
    if not args.skip_player_fetch:
        pids = collect_player_ids(csv_paths)
        missing = {p for p in pids if p not in player_cache}
        print(f"選手ページキャッシュ: {len(player_cache)}件 / 未取得 {len(missing)}件")
        if missing:
            print("選手ページを取得中...")
            ensure_player_cache(missing, player_cache, args.sleep)

    seasons = sorted({(int(FILENAME_RE.match(p.name).group(1)), FILENAME_RE.match(p.name).group(2)) for p in csv_paths})
    season_maps: Dict[Tuple[int, str], Dict[str, Tuple[int, Optional[int]]]] = {}
    for year, league in seasons:
        smap, sources = fetch_season_maps(year, league, args.sleep)
        season_maps[(year, league)] = smap
        print(f"{year} {league}: bulk {len(smap)}人 ({', '.join(sources) or 'none'})")

    total_rows = 0
    for path in csv_paths:
        m = FILENAME_RE.match(path.name)
        assert m
        year, league = int(m.group(1)), m.group(2)
        n = patch_csv_file(path, year, league, season_maps.get((year, league), {}), player_cache, args.dry_run)
        total_rows += n
        if n:
            rel = path.relative_to(ROOT)
            print(f"{'[dry] ' if args.dry_run else ''}patch {rel}: {n} rows")

    print(f"\n合計更新: {total_rows} 行 ({len(csv_paths)} ファイル)")

    if args.rebuild_rankings and not args.dry_run and total_rows > 0:
        import subprocess

        print("\nランキング再生成...")
        for year, league in seasons:
            cmd = [
                sys.executable,
                str(ROOT / "scripts" / "build_rankings_from_calculated.py"),
                "--year",
                str(year),
                "--league",
                league,
            ]
            subprocess.run(cmd, cwd=ROOT, check=False)


if __name__ == "__main__":
    main()
