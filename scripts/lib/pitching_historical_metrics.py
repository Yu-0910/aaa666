#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
投手ランキング（1950〜2025）— Phase 0 正本。

Record_pitching_historical.csv の指標が master CSV 列に解決できるか検証・ビルド時参照用。
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Union

ROOT = Path(__file__).resolve().parents[2]

RECORD_HISTORICAL = ROOT / "_data" / "master_csv" / "Record_pitching_historical.csv"

# 2026 Phase 19（canonical）専用。歴史年度 JSON には含めない。
PITCHING_METRICS_2026_ONLY: Set[str] = {
    "先発",
    "投球数",
    "P/IP",
    "QS率",
    "HQS率",
    "SQS率",
    "被打率",
    "被BABIP",
    "被出塁率",
    "被長打率",
}

# 日本語ラベル → 計算済み CSV の列名候補（先頭優先）
JAPANESE_TO_CSV_COLUMNS: Dict[str, List[str]] = {
    "防御率": ["ERA", "防御率"],
    "K-BB％": ["K-BB%", "K-BB％"],
    "K-BB%": ["K-BB%", "K-BB％"],
    "勝利": ["W", "勝利"],
    "敗戦": ["L", "敗戦"],
    "HLD": ["HOLD", "HLD"],
    "Ｓ": ["SV", "Ｓ"],
    "ＨＰ": ["HP", "ＨＰ"],
    "試合": ["G", "試合"],
    "完投": ["CG", "完投"],
    "完封": ["SHO", "完封"],
    "勝率": ["WPCT", "勝率"],
    "回数": ["IP", "投球回", "回数"],
    "被打者": ["BF", "被打者"],
    "被安": ["被安", "H"],
    "被本": ["HR", "被本"],
    "三振": ["SO", "三振"],
    "四球": ["BB", "四球"],
    "WHIP": ["WHIP"],
    "K％": ["K%", "K％"],
    "BB％": ["BB%", "BB％"],
    "敬遠": ["IBB", "敬遠"],
    "死球": ["HBP", "死球"],
    "自責": ["ER", "自責"],
    "失点": ["R", "失点"],
    "暴投": ["WP", "暴投"],
}

# lib/ranking/qualifyingPitching.ts RATE_KEYS と同期（率系＝規定到達必須）
PITCHING_RATE_METRIC_LABELS: Set[str] = {
    "防御率",
    "WHIP",
    "K-BB％",
    "K％",
    "BB％",
    "勝率",
}


def load_historical_metric_labels(record_path: Optional[Path] = None) -> List[str]:
    path = record_path or RECORD_HISTORICAL
    if not path.is_file():
        raise FileNotFoundError(f"Record_pitching_historical が見つかりません: {path}")
    line = path.read_text(encoding="utf-8-sig").splitlines()[0].strip()
    return [m.strip() for m in line.split(",") if m.strip()]


def csv_columns_for_metric(label: str) -> List[str]:
    if label in JAPANESE_TO_CSV_COLUMNS:
        return list(JAPANESE_TO_CSV_COLUMNS[label])
    return [label]


def resolve_csv_column(label: str, fieldnames: List[str]) -> Optional[str]:
    fields_set = set(fieldnames)
    for cand in csv_columns_for_metric(label):
        if cand in fields_set:
            return cand
    return None


def validate_historical_record_against_csv(csv_path: Path) -> List[str]:
    """未解決指標のラベル一覧を返す（空なら OK）"""
    labels = load_historical_metric_labels()
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames or []
    missing: List[str] = []
    for label in labels:
        if label in PITCHING_METRICS_2026_ONLY:
            missing.append(f"{label} (2026専用が historical Record に混入)")
            continue
        if resolve_csv_column(label, fields) is None:
            missing.append(label)
    return missing


Row = Dict[str, Any]


def _cell_nonempty(v: Any) -> bool:
    if v is None:
        return False
    s = str(v).strip()
    return s not in ("", "-", "－")


def _to_float(v: Any) -> Optional[float]:
    if not _cell_nonempty(v):
        return None
    try:
        return float(str(v).strip().replace(",", ""))
    except (TypeError, ValueError):
        return None


def _to_int(v: Any) -> Optional[int]:
    f = _to_float(v)
    if f is None:
        return None
    return int(f)


def ip_baseball_to_decimal(ip: Union[int, float, str]) -> float:
    """野球表記 .1/.2 → 十進イニング（compute / rankings / career 共通）"""
    f = _to_float(ip)
    if f is None or f <= 0:
        return 0.0
    whole = int(f)
    frac = f - whole
    if abs(frac - 0.1) < 0.05:
        return whole + 1 / 3
    if abs(frac - 0.2) < 0.05:
        return whole + 2 / 3
    return f


def pick_row_cell(row: Row, label: str) -> Any:
    fields = list(row.keys())
    col = resolve_csv_column(label, fields)
    if col is None:
        return None
    v = row.get(col)
    return v if _cell_nonempty(v) else None


def resolve_ip_raw(row: Row) -> Any:
    return pick_row_cell(row, "回数")


def ip_decimal_from_row(row: Row) -> float:
    raw = resolve_ip_raw(row)
    if raw is None:
        return 0.0
    return ip_baseball_to_decimal(raw)


def _h_looks_like_misaligned_ip(h: int, ip_dec: float, bf: int, bb: int = 0, so: int = 0) -> bool:
    if ip_dec <= 0 or h <= 0:
        return False
    ip_whole = int(ip_dec + 0.0001)
    # H=IP整数部でも列ずれでなければ通す（間柴1980: 188.1回188安 等）。
    # 列ずれ典型: H=207 かつ BB=177（本来被安）かつ SO=43（本来四球）。
    if h == ip_whole and h >= 30:
        if bb >= int(h * 0.75):
            return True
        if bb > 0 and so < bb and bb > (bf * 0.12 if bf > 0 else 40):
            return True
        return False
    if bf > 0 and h > bf * 0.65:
        return True
    return False


def resolve_hits_allowed_raw(row: Row) -> Any:
    fields = list(row.keys())
    ip_dec = ip_decimal_from_row(row)
    bf = _to_int(pick_row_cell(row, "被打者")) or 0

    for cand in csv_columns_for_metric("被安"):
        if cand not in fields:
            continue
        v = row.get(cand)
        if not _cell_nonempty(v):
            continue
        h = _to_int(v)
        if h is None:
            return v
        if cand == "H" and _h_looks_like_misaligned_ip(
            h, ip_dec, bf,
            bb=_to_int(pick_row_cell(row, "四球")) or 0,
            so=_to_int(pick_row_cell(row, "三振")) or 0,
        ):
            continue
        return v
    return None


def resolve_pitching_int(row: Row, label: str) -> Optional[int]:
    """Record 指標ラベル → int（ランキングビルドと同一の列解決）"""
    if label == "被安":
        return _to_int(resolve_hits_allowed_raw(row))
    return _to_int(pick_row_cell(row, label))


def resolve_pitching_float(row: Row, label: str) -> Optional[float]:
    """Record 指標ラベル → float（ランキングビルドと同一の列解決）"""
    return _to_float(pick_row_cell(row, label))
