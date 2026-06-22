#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 1: NPB 公式年度別成績ページからチーム勝敗・打撃・投手成績を取得する。

仕様: docs/plan_npb_yearly_standings_phases.md §4

実行例:
  python scripts/scrape_npb_yearly_standings.py --year 1990
  python scripts/scrape_npb_yearly_standings.py --from 1950 --to 2025
  python scripts/scrape_npb_yearly_standings.py --year 1990 --league CL --sleep 1.5

出力:
  _data/raw/npb_yearly/{year}/{CL|PL}.json
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

try:
    import requests
    from bs4 import BeautifulSoup, Tag
except ImportError:
    print("❌ pip install requests beautifulsoup4 lxml")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "_data" / "raw" / "npb_yearly"

YEAR_MIN = 1950
YEAR_MAX = 2025
LEAGUES = ("CL", "PL")


def npb_yearly_url(year: int, league: str) -> str:
    if league.upper() == "CL":
        return f"https://npb.jp/bis/yearly/centralleague_{year}.html"
    return f"https://npb.jp/bis/yearly/pacificleague_{year}.html"


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


def norm_header(text: str) -> str:
    return re.sub(r"[\s\u3000|｜]+", "", text or "").strip()


def row_cells(row: Tag) -> List[str]:
    return [c.get_text(strip=True) for c in row.find_all(["th", "td"])]


def safe_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    s = str(value).strip().replace(",", "")
    if s in ("-", "—"):
        return None
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None


def safe_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    s = str(value).strip().replace(",", "")
    if s in ("-", "—"):
        return None
    if s.startswith("."):
        s = "0" + s
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def find_section_table(soup: BeautifulSoup, section_title: str) -> Optional[Tag]:
    """■ チーム勝敗表 等の見出し直後の table を探す。"""
    anchor_ids = {
        "チーム勝敗表": "standings",
        "チーム打撃成績": "teamBatting",
        "チーム投手成績": "teamPitching",
    }
    anchor = anchor_ids.get(section_title)
    if anchor:
        node = soup.find(id=anchor)
        if node is not None:
            table = node.find_next("table")
            if table is not None:
                return table

    pattern = re.compile(re.escape(section_title))
    for el in soup.find_all(string=pattern):
        parent = el.parent
        if parent is None:
            continue
        table = parent.find_next("table")
        if table is not None:
            return table
    return None


def header_index_map(headers: List[str]) -> Dict[str, int]:
    mapping: Dict[str, int] = {}
    for idx, raw in enumerate(headers):
        h = norm_header(raw)
        if h in ("チーム", "球団"):
            mapping["team"] = idx
        elif h in ("試合",):
            mapping["g"] = idx
        elif h in ("勝利", "勝"):
            mapping["w"] = idx
        elif h in ("敗北", "敗"):
            mapping["l"] = idx
        elif h in ("引分", "分"):
            mapping["t"] = idx
        elif h in ("勝率",):
            mapping["pct"] = idx
        elif "ゲーム差" in h or h in ("差",):
            mapping["gb"] = idx
        elif h in ("打率",):
            mapping["avg"] = idx
        elif h in ("打数",):
            mapping["ab"] = idx
        elif h in ("得点",):
            mapping["runs"] = idx
        elif h in ("安打",):
            mapping["h"] = idx
        elif h in ("二塁打",):
            mapping["doubles"] = idx
        elif h in ("三塁打",):
            mapping["triples"] = idx
        elif h in ("本塁打",):
            mapping["hr"] = idx
        elif h in ("打点",):
            mapping["rbi"] = idx
        elif h in ("盗塁",):
            mapping["sb"] = idx
        elif h in ("防御率",):
            mapping["era"] = idx
        elif "セーブ" in h or h in ("セブ",):
            mapping["sv"] = idx
        elif h in ("完投",):
            mapping["cg"] = idx
        elif h in ("完封勝",):
            mapping["sho"] = idx
        elif h in ("投球回",):
            mapping["ip"] = idx
        elif h in ("奪三振",):
            mapping["so"] = idx
        elif h in ("失点",):
            mapping["runs_allowed"] = idx
    return mapping


def cell_get(cells: List[str], col_map: Dict[str, int], key: str) -> str:
    idx = col_map.get(key)
    if idx is None or idx >= len(cells):
        return ""
    return cells[idx].strip()


def parse_standings_table(table: Tag) -> List[Dict[str, Any]]:
    rows = table.find_all("tr")
    header_cells: List[str] = []
    data_rows: List[List[str]] = []
    for row in rows:
        cells = row_cells(row)
        if not cells:
            continue
        joined = norm_header("".join(cells))
        if "チーム" in joined and ("試合" in joined or "勝利" in joined):
            header_cells = cells
            continue
        if not header_cells:
            continue
        if norm_header(cells[0]) in ("チーム", "球団"):
            continue
        if len(cells) < 3:
            continue
        data_rows.append(cells)

    col = header_index_map(header_cells)
    if "team" not in col:
        return []

    out: List[Dict[str, Any]] = []
    for cells in data_rows:
        team = cell_get(cells, col, "team")
        if not team:
            continue
        gb_raw = cell_get(cells, col, "gb") or "-"
        out.append(
            {
                "team": team,
                "g": safe_int(cell_get(cells, col, "g")),
                "w": safe_int(cell_get(cells, col, "w")),
                "l": safe_int(cell_get(cells, col, "l")),
                "t": safe_int(cell_get(cells, col, "t")),
                "pct": safe_float(cell_get(cells, col, "pct")),
                "gb": gb_raw,
            }
        )
    return out


def parse_batting_table(table: Tag) -> List[Dict[str, Any]]:
    rows = table.find_all("tr")
    header_cells: List[str] = []
    data_rows: List[List[str]] = []
    for row in rows:
        cells = row_cells(row)
        if not cells:
            continue
        joined = norm_header("".join(cells))
        if "チーム" in joined and "打率" in joined:
            header_cells = cells
            continue
        if not header_cells:
            continue
        if norm_header(cells[0]) in ("チーム", "球団"):
            continue
        if len(cells) < 5:
            continue
        data_rows.append(cells)

    col = header_index_map(header_cells)
    if "team" not in col:
        return []

    out: List[Dict[str, Any]] = []
    for cells in data_rows:
        team = cell_get(cells, col, "team")
        if not team:
            continue
        out.append(
            {
                "team": team,
                "avg": safe_float(cell_get(cells, col, "avg")),
                "g": safe_int(cell_get(cells, col, "g")),
                "ab": safe_int(cell_get(cells, col, "ab")),
                "runs": safe_int(cell_get(cells, col, "runs")),
                "h": safe_int(cell_get(cells, col, "h")),
                "doubles": safe_int(cell_get(cells, col, "doubles")),
                "triples": safe_int(cell_get(cells, col, "triples")),
                "hr": safe_int(cell_get(cells, col, "hr")),
                "rbi": safe_int(cell_get(cells, col, "rbi")),
                "sb": safe_int(cell_get(cells, col, "sb")),
            }
        )
    return out


def merge_ip_and_tail(cells: List[str], ip_idx: int) -> Tuple[str, int]:
    """投球回が '1182' と '.2' に分かれる行を結合し、次の読み取り位置を返す。"""
    if ip_idx >= len(cells):
        return "", ip_idx
    ip_whole = cells[ip_idx].strip()
    next_idx = ip_idx + 1
    if next_idx < len(cells) and re.fullmatch(r"\.\d", cells[next_idx].strip()):
        return f"{ip_whole}{cells[next_idx].strip()}", next_idx + 1
    return ip_whole, next_idx


def parse_pitching_table(table: Tag) -> List[Dict[str, Any]]:
    rows = table.find_all("tr")
    header_cells: List[str] = []
    data_rows: List[List[str]] = []
    for row in rows:
        cells = row_cells(row)
        if not cells:
            continue
        joined = norm_header("".join(cells))
        if "チーム" in joined and "防御率" in joined:
            header_cells = cells
            continue
        if not header_cells:
            continue
        if norm_header(cells[0]) in ("チーム", "球団"):
            continue
        if len(cells) < 5:
            continue
        data_rows.append(cells)

    col = header_index_map(header_cells)
    if "team" not in col:
        return []

    out: List[Dict[str, Any]] = []
    for cells in data_rows:
        team = cell_get(cells, col, "team")
        if not team:
            continue

        sho_idx = col.get("sho")
        ip = None
        so_val: Optional[int] = None
        runs_allowed: Optional[int] = None

        if sho_idx is not None and sho_idx + 1 < len(cells):
            ip, tail_idx = merge_ip_and_tail(cells, sho_idx + 1)
            if tail_idx < len(cells):
                so_val = safe_int(cells[tail_idx])
                tail_idx += 1
            if tail_idx < len(cells):
                runs_allowed = safe_int(cells[tail_idx])
        else:
            ip = cell_get(cells, col, "ip") or None
            so_val = safe_int(cell_get(cells, col, "so"))
            runs_allowed = safe_int(cell_get(cells, col, "runs_allowed"))

        out.append(
            {
                "team": team,
                "era": safe_float(cell_get(cells, col, "era")),
                "g": safe_int(cell_get(cells, col, "g")),
                "w": safe_int(cell_get(cells, col, "w")),
                "l": safe_int(cell_get(cells, col, "l")),
                "sv": safe_int(cell_get(cells, col, "sv")),
                "cg": safe_int(cell_get(cells, col, "cg")),
                "sho": safe_int(cell_get(cells, col, "sho")),
                "ip": ip or None,
                "so": so_val,
                "runs_allowed": runs_allowed,
            }
        )
    return out


def parse_yearly_html(html: str) -> Dict[str, List[Dict[str, Any]]]:
    soup = BeautifulSoup(html, "lxml")
    standings_table = find_section_table(soup, "チーム勝敗表")
    batting_table = find_section_table(soup, "チーム打撃成績")
    pitching_table = find_section_table(soup, "チーム投手成績")

    if not standings_table or not batting_table or not pitching_table:
        missing = []
        if not standings_table:
            missing.append("standings")
        if not batting_table:
            missing.append("batting")
        if not pitching_table:
            missing.append("pitching")
        raise ValueError(f"missing tables: {', '.join(missing)}")

    return {
        "standings": parse_standings_table(standings_table),
        "batting": parse_batting_table(batting_table),
        "pitching": parse_pitching_table(pitching_table),
    }


def scrape_one(year: int, league: str, sleep_sec: float, dry_run: bool) -> bool:
    url = npb_yearly_url(year, league)
    print(f"[phase1] {year} {league} ← {url}")

    html = fetch_html(url)
    if not html:
        print(f"  ❌ no HTML ({year} {league})")
        return False

    try:
        tables = parse_yearly_html(html)
    except ValueError as exc:
        print(f"  ❌ parse error: {exc}")
        return False

    n_stand = len(tables["standings"])
    n_bat = len(tables["batting"])
    n_pitch = len(tables["pitching"])
    if n_stand == 0 or n_bat == 0 or n_pitch == 0:
        print(f"  ❌ empty rows: standings={n_stand} batting={n_bat} pitching={n_pitch}")
        return False

    payload = {
        "schemaVersion": "npb-yearly-raw-v1",
        "year": year,
        "league": league,
        "source_url": url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        **tables,
    }

    out_path = OUT_DIR / str(year) / f"{league}.json"
    if dry_run:
        print(f"  ✓ dry-run: standings={n_stand} batting={n_bat} pitching={n_pitch} → {out_path}")
        return True

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  ✓ saved: {out_path.relative_to(ROOT)} ({n_stand} teams)")
    if sleep_sec > 0:
        time.sleep(sleep_sec)
    return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="NPB 公式年度別成績ページからチーム成績を取得（Phase 1）")
    parser.add_argument("--year", type=int, help="単一年度")
    parser.add_argument("--from", dest="year_from", type=int, default=YEAR_MIN, help=f"開始年度（既定 {YEAR_MIN}）")
    parser.add_argument("--to", dest="year_to", type=int, default=YEAR_MAX, help=f"終了年度（既定 {YEAR_MAX}）")
    parser.add_argument(
        "--league",
        choices=["CL", "PL", "both"],
        default="both",
        help="リーグ（既定: both）",
    )
    parser.add_argument("--sleep", type=float, default=1.0, help="リクエスト間スリープ秒（既定 1.0）")
    parser.add_argument("--dry-run", action="store_true", help="保存せずパースのみ")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.year is not None:
        years = [args.year]
    else:
        years = list(range(args.year_from, args.year_to + 1))

    leagues = list(LEAGUES) if args.league == "both" else [args.league]

    ok = 0
    ng = 0
    for year in years:
        for league in leagues:
            if scrape_one(year, league, args.sleep, args.dry_run):
                ok += 1
            else:
                ng += 1

    print(f"\n[phase1] done: ok={ok} ng={ng}")
    if ng > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
