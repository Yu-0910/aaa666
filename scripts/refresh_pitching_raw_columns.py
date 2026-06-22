#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
投手マスタ CSV の「IP 以降の生指標」だけを NPB 選手ページから再取得して上書きする。

対象列: H, HR, BB, IBB, HBP, SO, WP, BK, R, ER, ERA（＋日本語列があれば同期）

Usage:
  py scripts/refresh_pitching_raw_columns.py --year 1983 --league CL --player-id 31433867
  py scripts/refresh_pitching_raw_columns.py --year 1983 --league CL --detect-misaligned --dry-run
  py scripts/refresh_pitching_raw_columns.py --year 1983 --league CL --all-with-id
"""
from __future__ import annotations

import argparse
import csv
import shutil
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from scrape_2004_pitching_via_all_players import get_player_pitching_for_year  # noqa: E402
from lib.pitching_historical_metrics import (  # noqa: E402
    ip_baseball_to_decimal,
    resolve_hits_allowed_raw,
)

MASTER_DIRS = [
    PROJECT_ROOT / "_data" / "master_csv__import_1950_2024",
    PROJECT_ROOT / "_data" / "master_csv",
]
DEFAULT_CACHE = PROJECT_ROOT / "_data" / "cache" / "npb_player_page"

# 再取得対象（生データ）
RAW_KEYS: Tuple[str, ...] = (
    "H", "HR", "BB", "IBB", "HBP", "SO", "WP", "BK", "R", "ER", "ERA",
)
JA_ALIASES: Dict[str, Tuple[str, ...]] = {
    "H": ("被安",),
    "HR": ("被本",),
    "BB": ("四球",),
    "IBB": ("敬遠",),
    "HBP": ("死球",),
    "SO": ("三振",),
    "WP": ("暴投",),
    "R": ("失点",),
    "ER": ("自責",),
    "ERA": ("防御率",),
}


def _float_cell(row: Dict[str, str], key: str) -> Optional[float]:
    v = (row.get(key) or "").strip().replace(",", "")
    if not v:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _int_cell(row: Dict[str, str], key: str) -> int:
    v = _float_cell(row, key)
    return int(v) if v is not None else 0


def _cell_missing(row: Dict[str, str], *keys: str) -> bool:
    for key in keys:
        v = (row.get(key) or "").strip()
        if v not in ("", "-", "－"):
            return False
    return True


def is_misaligned_row(row: Dict[str, str]) -> bool:
    """IP 分割セル列ずれ・被安欠落の典型パターン（表示 '-' になる行も含む）"""
    ip = ip_baseball_to_decimal(row.get("IP") or "")
    if ip <= 0:
        return False
    g = _int_cell(row, "G")
    bf = _int_cell(row, "BF")
    if g <= 0 and bf <= 0:
        return False

    h = _float_cell(row, "H")
    ip_whole = int(ip + 0.0001)

    # 被安 H 列・被安列が共に空（槙原1983型）
    if h is None and _cell_missing(row, "H", "被安") and ip >= 10:
        return True

    # H が投球回整数部と完全一致（桑田1987型 / 表示層で '-' になる）
    if h is not None and h == ip_whole and h >= 30:
        return True

    # CSV に H はあるが resolve_hits_allowed が拒否
    if h is not None and h >= 30 and resolve_hits_allowed_raw(row) is None:
        return True

    bb = _int_cell(row, "BB")
    so = _int_cell(row, "SO")
    if bf > 0 and bb > bf * 0.15 and so < bb:
        return True

    # 被本 0 なのに四球が被安級（列ずれで BB←H）
    hr = _int_cell(row, "HR")
    if hr == 0 and bb >= 100 and ip >= 100:
        return True

    er = _float_cell(row, "ER")
    r = _float_cell(row, "R")
    if er == 0 and r is not None and 0 < r < 10 and ip >= 50:
        era = _float_cell(row, "ERA")
        if era is not None and era <= 0.01:
            return True
    return False


def find_csv_path(year: int, league: str) -> Optional[Path]:
    name = f"pitching_{year}_{league}_from_master.csv"
    for d in MASTER_DIRS:
        p = d / name
        if p.is_file():
            return p
    return None


def match_row(
    row: Dict[str, str],
    year: int,
    league: str,
    player_id: str,
    player_name: str,
) -> bool:
    if (row.get("year") or "").strip() != str(year):
        return False
    if (row.get("league") or "").strip().upper() != league.upper():
        return False
    pid = (row.get("player_id") or "").strip()
    if player_id and pid == player_id:
        return True
    if player_name:
        name = (row.get("player_name_ja") or "").replace("\u3000", " ").strip()
        want = player_name.replace("\u3000", " ").strip()
        if want in name or name in want:
            return True
    return False


def patch_values(fresh: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for key in RAW_KEYS:
        if key in fresh and fresh[key] is not None:
            out[key] = fresh[key]
    return out


def apply_row_patch(row: Dict[str, str], patch: Dict[str, Any], fieldnames: List[str]) -> None:
    fields = set(fieldnames)
    for key, val in patch.items():
        if key in fields:
            row[key] = "" if val is None else str(val)
        for ja in JA_ALIASES.get(key, ()):
            if ja in fields:
                row[ja] = "" if val is None else str(val)


def sync_master_dirs(source_path: Path) -> None:
    for d in MASTER_DIRS:
        if d == source_path.parent:
            continue
        dest = d / source_path.name
        if dest.parent.is_dir():
            shutil.copy2(source_path, dest)


def collect_targets(
    csv_path: Path,
    year: int,
    league: str,
    player_id: str,
    player_name: str,
    detect: bool,
    all_with_id: bool,
) -> List[Tuple[int, Dict[str, str]]]:
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    out: List[Tuple[int, Dict[str, str]]] = []
    for i, row in enumerate(rows):
        if (row.get("year") or "").strip() != str(year):
            continue
        if (row.get("league") or "").strip().upper() != league.upper():
            continue
        if player_id or player_name:
            if not match_row(row, year, league, player_id, player_name):
                continue
        elif all_with_id:
            if not (row.get("player_id") or "").strip():
                continue
        elif detect:
            if not is_misaligned_row(row):
                continue
        else:
            continue
        out.append((i, row))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="投手 CSV の IP 以降生指標のみ再取得")
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--league", choices=["CL", "PL"], required=True)
    parser.add_argument("--player-id", type=str, default="", help="例: 11513862（桑田真澄）")
    parser.add_argument("--player-name", type=str, default="", help="player_id 未指定時の名前一致")
    parser.add_argument("--detect-misaligned", action="store_true", help="列ずれ・被安欠落行を自動検出")
    parser.add_argument(
        "--all-with-id",
        action="store_true",
        help="player_id がある全行を再取得（1950-2025 一括向け）",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--cache-dir", type=str, default=str(DEFAULT_CACHE))
    parser.add_argument("--sleep", type=float, default=0.3)
    args = parser.parse_args()

    mode_count = sum(
        bool(x)
        for x in (args.player_id, args.player_name, args.detect_misaligned, args.all_with_id)
    )
    if mode_count != 1:
        print("❌ --player-id / --player-name / --detect-misaligned / --all-with-id のいずれか1つを指定してください")
        return 1

    csv_path = find_csv_path(args.year, args.league)
    if csv_path is None:
        print(f"❌ pitching_{args.year}_{args.league}_from_master.csv が見つかりません")
        return 1

    cache_dir = Path(args.cache_dir)
    if not cache_dir.is_absolute():
        cache_dir = PROJECT_ROOT / cache_dir

    targets = collect_targets(
        csv_path, args.year, args.league,
        args.player_id.strip(), args.player_name.strip(),
        args.detect_misaligned, args.all_with_id,
    )
    print(f"対象: {len(targets)} 行 ({csv_path.name})", flush=True)
    if not targets:
        return 0

    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        fieldnames = list(csv.DictReader(f).fieldnames or [])

    updates: Dict[int, Dict[str, Any]] = {}
    ok = fail = 0
    for row_idx, row in targets:
        pid = (row.get("player_id") or args.player_id or "").strip()
        name = (row.get("player_name_ja") or args.player_name or "").strip()
        team = (row.get("team") or "").strip()
        if not pid:
            print(f"  スキップ（player_id なし）: {name}", flush=True)
            fail += 1
            continue

        fresh, via_net = get_player_pitching_for_year(
            pid, name, team, args.league, args.year, cache_dir,
        )
        if fresh is None:
            print(f"  取得失敗: {name} ({pid})", flush=True)
            fail += 1
            continue

        patch = patch_values(fresh)
        src = "network" if via_net else "cache"
        print(
            f"  OK [{src}] {name}: H={patch.get('H')} BB={patch.get('BB')} "
            f"SO={patch.get('SO')} ER={patch.get('ER')} R={patch.get('R')}",
            flush=True,
        )
        if args.dry_run:
            ok += 1
            continue
        updates[row_idx] = patch
        ok += 1
        time.sleep(args.sleep)

    if not args.dry_run and updates:
        with csv_path.open(encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
        for ri, patch in updates.items():
            apply_row_patch(rows[ri], patch, fieldnames)
        with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)
        sync_master_dirs(csv_path)
        print(f"更新: {csv_path.name} ({len(updates)} 行)", flush=True)

    print(f"完了。成功 {ok} / 失敗 {fail}", flush=True)
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
