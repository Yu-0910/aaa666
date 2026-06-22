#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""計算済みCSVの SB/CS を日本語列 盗塁/盗塁死 に同期する（ランキング生成用）"""

import csv
import io
import re
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
INPUT_DIR = ROOT / "_data" / "master_csv_calculated"
PATTERN = re.compile(r"^batting_(\d{4})_(CL|PL)_from_master\.csv$")


def safe_int(v):
    if v is None or v == "":
        return None
    try:
        return int(float(str(v).strip()))
    except (ValueError, TypeError):
        return None


def main() -> None:
    total = 0
    for path in sorted(INPUT_DIR.glob("batting_*_from_master.csv")):
        if not PATTERN.match(path.name):
            continue
        year = int(PATTERN.match(path.name).group(1))
        if year >= 2026:
            continue
        with path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            fields = reader.fieldnames or []
            rows = list(reader)
        if "SB" not in fields or "盗塁" not in fields:
            continue
        n = 0
        for row in rows:
            sb = safe_int(row.get("SB"))
            cs = safe_int(row.get("CS"))
            changed = False
            if sb is not None and safe_int(row.get("盗塁")) != sb:
                row["盗塁"] = str(sb)
                changed = True
            if cs is not None and "盗塁死" in fields and safe_int(row.get("盗塁死")) != cs:
                row["盗塁死"] = str(cs)
                changed = True
            if changed:
                n += 1
        if n:
            with path.open("w", encoding="utf-8-sig", newline="") as f:
                w = csv.DictWriter(f, fieldnames=fields)
                w.writeheader()
                w.writerows(rows)
            print(f"{path.name}: {n} rows")
            total += n
    print(f"done: {total} rows")


if __name__ == "__main__":
    main()
