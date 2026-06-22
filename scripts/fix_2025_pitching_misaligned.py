#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
2025年投手マスタの列ずれ行を NPB BIS から再取得して修正する。

検出条件（いずれか）:
- IP>0 かつ ER=0 かつ ERA>5（失点が防御率列に入っている等）
- IP>0 かつ ER>0 だが ERA が (ER×9/IP) と大きく乖離
- SO 列より BK 列の方が大きい（三振が BK 列にずれている典型）

対象ディレクトリ:
- _data/master_csv__import_1950_2024
- _data/master_csv（存在すれば同期）
"""
from __future__ import annotations

import csv
import shutil
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MASTER_DIRS = [
    PROJECT_ROOT / "_data" / "master_csv__import_1950_2024",
    PROJECT_ROOT / "_data" / "master_csv",
]


def parse_ip(s: Any) -> Optional[float]:
    if s is None or not str(s).strip():
        return None
    s = str(s).strip().replace(",", "")
    if "." not in s:
        try:
            return float(s)
        except ValueError:
            return None
    a, b = s.split(".", 1)
    try:
        w = int(a)
    except ValueError:
        return None
    if b in ("0", "00"):
        return float(w)
    if b == "1":
        return w + 1 / 3
    if b == "2":
        return w + 2 / 3
    try:
        return float(s)
    except ValueError:
        return None


def _float_cell(row: Dict[str, str], key: str) -> Optional[float]:
    v = (row.get(key) or "").strip().replace(",", "")
    if not v:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _int_cell(row: Dict[str, str], key: str) -> int:
    v = _float_cell(row, key)
    if v is None:
        return 0
    return int(v)


def is_misaligned_2025_row(row: Dict[str, str]) -> bool:
    if (row.get("year") or "").strip() != "2025":
        return False
    pid = (row.get("player_id") or "").strip()
    if not pid:
        return False
    ip = parse_ip(row.get("IP"))
    if ip is None or ip <= 0:
        return False

    era = _float_cell(row, "ERA")
    er = _float_cell(row, "ER") or 0.0

    if er > 0 and era is not None:
        expected = (er * 9) / ip
        if abs(era - expected) > 0.25:
            return True
        return False

    if er > 0:
        return False

    if era is not None and era > 5:
        return True

    so_n = _int_cell(row, "SO")
    bk_n = _int_cell(row, "BK")
    if bk_n > so_n and bk_n >= 10:
        return True

    # H が投球回と同じ整数（120.0 → 120）のときは列ずれの典型
    h = _float_cell(row, "H")
    if h is not None and abs(h - int(ip)) < 0.01 and abs(ip - round(ip)) < 0.01:
        return True

    return False


def collect_targets() -> List[Tuple[Path, int, Dict[str, str]]]:
    out: List[Tuple[Path, int, Dict[str, str]]] = []
    seen: set[Tuple[str, str]] = set()
    for master_dir in MASTER_DIRS:
        if not master_dir.is_dir():
            continue
        for path in sorted(master_dir.glob("pitching_2025_*_from_master.csv")):
            with open(path, encoding="utf-8-sig") as f:
                rows = list(csv.DictReader(f))
            for i, row in enumerate(rows):
                if not is_misaligned_2025_row(row):
                    continue
                pid = (row.get("player_id") or "").strip()
                key = (path.name, pid)
                if key in seen:
                    continue
                seen.add(key)
                out.append((path, i, row))
    return out


def apply_updates(path: Path, updates: Dict[int, Dict[str, Any]]) -> None:
    with open(path, encoding="utf-8-sig") as f:
        fn = list(csv.DictReader(f).fieldnames or [])
        f.seek(0)
        rows = list(csv.DictReader(f))
    for ri, fresh in updates.items():
        if ri >= len(rows):
            continue
        for k in fn:
            if k in fresh:
                v = fresh[k]
                rows[ri][k] = "" if v is None else str(v)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fn, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def sync_master_dirs(source_path: Path) -> None:
    """import を正とし、もう一方の同名ファイルへコピー"""
    for d in MASTER_DIRS:
        if d == source_path.parent:
            continue
        dest = d / source_path.name
        if dest.parent.is_dir():
            shutil.copy2(source_path, dest)


def main() -> int:
    sys.path.insert(0, str(PROJECT_ROOT))
    from scripts.scrape_2025_pitching_via_roster import get_player_pitching_for_year

    items = collect_targets()
    print(f"修正対象: {len(items)} 行", flush=True)
    if not items:
        return 0

    updates_by_path: Dict[Path, Dict[int, Dict[str, Any]]] = {}
    ok = 0
    fail = 0
    for path, row_idx, row in items:
        pid = (row.get("player_id") or "").strip()
        name = (row.get("player_name_ja") or "").strip()
        team = (row.get("team") or "").strip()
        league = (row.get("league") or "").strip()
        fresh = get_player_pitching_for_year(pid, name, team, league, 2025)
        if fresh is None:
            print(f"  取得失敗: {name} ({pid})", flush=True)
            fail += 1
            continue
        updates_by_path.setdefault(path, {})[row_idx] = fresh
        ok += 1
        if ok % 20 == 0:
            print(f"  ... {ok}/{len(items)}", flush=True)
        time.sleep(0.2)

    for path, up in updates_by_path.items():
        apply_updates(path, up)
        sync_master_dirs(path)
        print(f"  更新: {path.name} ({len(up)} 行)", flush=True)

    print(f"完了。成功 {ok} / 失敗 {fail}", flush=True)
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
