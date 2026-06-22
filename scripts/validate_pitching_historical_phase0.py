#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
投手ランキング歴史年度 — Phase 0 検証。

Record_pitching_historical.csv の全指標が計算済み CSV 列に解決できることを確認する。
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib.pitching_historical_metrics import (  # noqa: E402
    PITCHING_METRICS_2026_ONLY,
    load_historical_metric_labels,
    validate_historical_record_against_csv,
)

SAMPLE_CSVS = [
    ROOT / "_data/master_csv_calculated/pitching_1950_CL_from_master.csv",
    ROOT / "_data/master_csv_calculated/pitching_1958_CL_from_master.csv",
    ROOT / "_data/master_csv_calculated/pitching_2000_PL_from_master.csv",
    ROOT / "_data/master_csv_calculated/pitching_2024_CL_from_master.csv",
]


def main() -> int:
    labels = load_historical_metric_labels()
    overlap = PITCHING_METRICS_2026_ONLY.intersection(labels)
    if overlap:
        print("❌ historical Record に 2026 専用指標が含まれています:", sorted(overlap))
        return 1

    print(f"✅ Record_pitching_historical: {len(labels)} 指標")
    print("   ", ",".join(labels))

    failed = False
    for csv_path in SAMPLE_CSVS:
        if not csv_path.is_file():
            print(f"⚠️  スキップ（ファイルなし）: {csv_path.name}")
            continue
        missing = validate_historical_record_against_csv(csv_path)
        if missing:
            print(f"❌ {csv_path.name}: 未解決 {missing}")
            failed = True
        else:
            print(f"✅ {csv_path.name}: 全指標が CSV 列に解決")

    if failed:
        return 1

    print("\n=== Phase 0 検証 OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
