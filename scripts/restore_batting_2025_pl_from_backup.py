#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
truncated な batting_2025_PL_from_master.csv をバックアップから復元する。

現象: master_csv_calculated が 66 行程度しかなく、淺間大基など多数が欠落。
正本: master_csv__backup_20260102（320 行、player_id 付き）

Usage:
  python scripts/restore_batting_2025_pl_from_backup.py
  python scripts/restore_batting_2025_pl_from_backup.py --dry-run
"""

from __future__ import annotations

import argparse
import csv
import io
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "_data" / "master_csv__backup_20260102" / "batting_2025_PL_from_master.csv"
TARGET = ROOT / "_data" / "master_csv_calculated" / "batting_2025_PL_from_master.csv"


def count_rows(path: Path) -> int:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return sum(1 for _ in csv.DictReader(f))


def main() -> int:
    parser = argparse.ArgumentParser(description="2025 PL 打撃マスタをバックアップから復元")
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--target", type=Path, default=TARGET)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="行数に関わらず上書き")
    args = parser.parse_args()

    if not args.source.is_file():
        print(f"ERROR: バックアップがありません: {args.source}", flush=True)
        return 1

    src_n = count_rows(args.source)
    tgt_n = count_rows(args.target) if args.target.is_file() else 0
    print(f"source: {args.source} ({src_n} 行)", flush=True)
    print(f"target: {args.target} ({tgt_n} 行)", flush=True)

    if not args.force and tgt_n >= src_n:
        print("skip: target の行数が source 以上です（--force で上書き可）", flush=True)
        return 0

    if args.dry_run:
        print(f"dry-run: {args.source.name} -> {args.target}", flush=True)
        return 0

    args.target.parent.mkdir(parents=True, exist_ok=True)
    if args.target.is_file():
        bak = args.target.with_suffix(
            args.target.suffix + f".bak_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
        )
        shutil.copy2(args.target, bak)
        print(f"backup: {bak.name}", flush=True)
    shutil.copy2(args.source, args.target)
    print(f"restored: {tgt_n} -> {src_n} 行", flush=True)
    print("次: npm run player-profile:rebuild-career-2026", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
