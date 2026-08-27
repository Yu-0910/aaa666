#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 1: 名簿固定 + 通算（マスタ CSV 結合）

- _data/npb_roster_2026.csv を SSOT
- batting_*_from_master.csv / pitching_*_from_master.csv から年度別成績を組み立て
- NPB への HTTP は行わない

Usage:
  python scripts/build_player_career_from_master.py
  python scripts/build_player_career_from_master.py --limit 50
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from lib.pitching_historical_metrics import (  # noqa: E402
    resolve_ip_raw,
    resolve_pitching_float,
    resolve_pitching_int,
)
from lib.player_name_match import (  # noqa: E402
    name_keys_for_matching,
    normalize_name_team_keys,
)
DEFAULT_ROSTER = ROOT / "_data" / "npb_roster_2026.csv"
DEFAULT_MASTER_DIRS = [
    ROOT / "_data" / "master_csv_calculated",
    ROOT / "_data" / "master_csv__import_1950_2024",
]
OUT_TARGETS = ROOT / "_data" / "player_profile" / "_targets_2026.json"
OUT_CAREER_DIR = ROOT / "_data" / "derived" / "player_profile" / "career_from_master"
OUT_MISSING = ROOT / "_reports" / "player_profile_phase1_career_missing_in_master.csv"

BATTING_GLOB = "batting_*_*_from_master.csv"
PITCHING_GLOB = "pitching_*_*_from_master.csv"


def log(msg: str) -> None:
    print(msg, flush=True)


def normalize_npb_id(raw: str) -> str:
    s = (raw or "").strip()
    if not s or s.lower() in ("nan", "none", "-"):
        return ""
    digits = re.sub(r"\D", "", s)
    if not digits:
        return ""
    return digits.lstrip("0") or "0"


def safe_int(v: Any) -> Optional[int]:
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() in ("nan", "none", "-", ""):
        return None
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None


def safe_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() in ("nan", "none", "-", ""):
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def parse_year_league_from_filename(path: Path) -> Tuple[Optional[int], Optional[str]]:
    m = re.match(r"^(batting|pitching)_(\d{4})_(CL|PL|PRE)_from_master\.csv$", path.name, re.I)
    if not m:
        return None, None
    return int(m.group(2)), m.group(3).upper()


def discover_master_files(dirs: List[Path], glob_pat: str) -> List[Path]:
    seen: Set[str] = set()
    out: List[Path] = []
    for d in dirs:
        if not d.is_dir():
            continue
        for p in sorted(d.glob(glob_pat)):
            key = p.name
            if key in seen:
                continue
            seen.add(key)
            out.append(p)
    return sorted(out, key=lambda p: (parse_year_league_from_filename(p)[0] or 0, p.name))


def load_csv_rows(path: Path) -> List[Dict[str, str]]:
    for enc in ("utf-8-sig", "utf-8", "cp932"):
        try:
            with path.open(encoding=enc, newline="") as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    with path.open(encoding="utf-8", errors="replace", newline="") as f:
        return list(csv.DictReader(f))


def candidate_name_keys(name: str, team: str, *, include_team: bool) -> List[str]:
    """同一選手の移籍前後を拾うため、名前のみと名前+球団の両方を候補にする。"""
    keys: List[str] = []
    for key in name_keys_for_matching(name):
        if key and key not in keys:
            keys.append(key)
    if include_team:
        for key in normalize_name_team_keys(name, team):
            if key and key not in keys:
                keys.append(key)
    return keys


def batting_row_to_career(row: Dict[str, str], year: int, league: str) -> Dict[str, Any]:
    # master_csv_calculated の列名ゆれ（英語/日本語/別名）をできるだけ吸収する。
    # 存在しない指標は None のままにする（年度・世代で列が異なるため）。
    career = {
        "year": year,
        "league": league,
        "team": (row.get("team") or "").strip(),
        "games": safe_int(row.get("G") or row.get("試合")),
        "pa": safe_int(row.get("PA") or row.get("打席")),
        "ab": safe_int(row.get("AB") or row.get("打数")),
        "runs": safe_int(row.get("R") or row.get("得点")),
        "hits": safe_int(row.get("H") or row.get("安打")),
        "doubles": safe_int(row.get("2B") or row.get("二塁打")),
        "triples": safe_int(row.get("3B") or row.get("三塁打")),
        "hr": safe_int(row.get("HR") or row.get("本塁打")),
        "tb": safe_int(row.get("TB") or row.get("塁打")),
        "rbi": safe_int(row.get("RBI") or row.get("打点")),
        "sb": safe_int(row.get("SB") or row.get("盗塁")),
        "cs": safe_int(row.get("CS") or row.get("盗塁死")),
        "sh": safe_int(row.get("SH") or row.get("犠打")),
        "sf": safe_int(row.get("SF") or row.get("犠飛")),
        "bb": safe_int(row.get("BB") or row.get("四球")),
        "ibb": safe_int(row.get("IBB") or row.get("敬遠")),
        "so": safe_int(row.get("SO") or row.get("三振")),
        "hbp": safe_int(row.get("HBP") or row.get("死球")),
        "gidp": safe_int(row.get("GDP") or row.get("併殺打")),
        "avg": safe_float(row.get("AVG") or row.get("打率")),
        "obp": safe_float(row.get("OBP") or row.get("出塁率")),
        "slg": safe_float(row.get("SLG") or row.get("長打率")),
        "ops": safe_float(row.get("OPS")),
        # sabermetrics (存在する場合のみ)
        "isop": safe_float(row.get("IsoP")),
        "isod": safe_float(row.get("IsoD")),
        "bb_pct": safe_float(row.get("BB%") or row.get("BB％")),
        "k_pct": safe_float(row.get("K%") or row.get("K％")),
        "bb_k": safe_float(row.get("BB/K")),
        "rc": safe_float(row.get("RC")),
        "xr": safe_float(row.get("XR")),
        "babip": safe_float(row.get("BABIP")),
        "seca": safe_float(row.get("SecA")),
        "ta": safe_float(row.get("TA")),
        "noi": safe_float(row.get("NOI")),
        "gpa": safe_float(row.get("GPA")),
    }
    return sanitize_batting_career_row(career)


def sanitize_batting_career_row(career: Dict[str, Any]) -> Dict[str, Any]:
    games = career.get("games")
    pa = career.get("pa")
    ab = career.get("ab")
    if games != 0 or pa != 0 or ab != 0:
        return career

    stat_keys = [
        "runs",
        "hits",
        "doubles",
        "triples",
        "hr",
        "tb",
        "rbi",
        "sb",
        "cs",
        "sh",
        "sf",
        "bb",
        "ibb",
        "so",
        "hbp",
        "gidp",
    ]
    derived_keys = [
        "avg",
        "obp",
        "slg",
        "ops",
        "isop",
        "isod",
        "bb_pct",
        "k_pct",
        "bb_k",
        "rc",
        "xr",
        "babip",
        "seca",
        "ta",
        "noi",
        "gpa",
    ]
    has_impossible_counts = any((career.get(key) or 0) != 0 for key in stat_keys)
    has_impossible_derived = any(career.get(key) not in (None, 0, 0.0) for key in derived_keys)
    if not has_impossible_counts and not has_impossible_derived:
        return career

    sanitized = dict(career)
    for key in stat_keys:
        sanitized[key] = 0
    for key in derived_keys:
        sanitized[key] = None if key in {"bb_pct", "k_pct", "bb_k", "rc", "babip", "seca", "ta"} else 0.0
    return sanitized


def _pitching_int(row: Dict[str, str], *keys: str) -> Optional[int]:
    for k in keys:
        if k not in row:
            continue
        v = row.get(k)
        if v is None or str(v).strip() == "":
            continue
        n = safe_int(v)
        if n is not None:
            return n
    return None


def _pitching_float(row: Dict[str, str], *keys: str) -> Optional[float]:
    for k in keys:
        if k not in row:
            continue
        v = row.get(k)
        if v is None or str(v).strip() == "":
            continue
        f = safe_float(v)
        if f is not None:
            return f
    return None


def pitching_row_to_career(row: Dict[str, str], year: int, league: str) -> Dict[str, Any]:
    ip_cell = resolve_ip_raw(row)
    ip_raw = (str(ip_cell).strip() if ip_cell is not None else "") or None
    return {
        "year": year,
        "league": league,
        "team": (row.get("team") or "").strip(),
        "games": resolve_pitching_int(row, "試合"),
        "wins": resolve_pitching_int(row, "勝利"),
        "losses": resolve_pitching_int(row, "敗戦"),
        "saves": resolve_pitching_int(row, "Ｓ"),
        "ip": ip_raw,
        "era": resolve_pitching_float(row, "防御率"),
        "bf": resolve_pitching_int(row, "被打者"),
        "hits_allowed": resolve_pitching_int(row, "被安"),
        "hr_allowed": resolve_pitching_int(row, "被本"),
        "bb": resolve_pitching_int(row, "四球"),
        "ibb": resolve_pitching_int(row, "敬遠"),
        "hbp": resolve_pitching_int(row, "死球"),
        "so": resolve_pitching_int(row, "三振"),
        "er": resolve_pitching_int(row, "自責"),
        "r": resolve_pitching_int(row, "失点"),
        "holds": resolve_pitching_int(row, "HLD"),
        "hp": resolve_pitching_int(row, "ＨＰ"),
        "cg": resolve_pitching_int(row, "完投"),
        "sho": resolve_pitching_int(row, "完封"),
        "wp": resolve_pitching_int(row, "暴投"),
        "k_bb_pct": resolve_pitching_float(row, "K-BB％"),
        "whip": resolve_pitching_float(row, "WHIP"),
        "wpct": resolve_pitching_float(row, "勝率"),
        "k_pct": resolve_pitching_float(row, "K％"),
        "bb_pct": resolve_pitching_float(row, "BB％"),
    }


def load_roster(path: Path) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            pid = (row.get("npb_player_id") or row.get("player_id") or "").strip()
            name = (row.get("name_ja") or "").strip()
            if not pid and not name:
                continue
            rows.append(row)
    return rows


def index_master_files(
    files: List[Path],
    kind: str,
    batting_index: Dict[str, List[Dict[str, Any]]],
    pitching_index: Dict[str, List[Dict[str, Any]]],
    batting_name_index: Dict[str, List[Dict[str, Any]]],
    pitching_name_index: Dict[str, List[Dict[str, Any]]],
) -> Tuple[int, int]:
    """Returns (rows_indexed, files_skipped)"""
    rows_indexed = 0
    skipped = 0
    total = len(files)
    for i, path in enumerate(files, 1):
        year, league = parse_year_league_from_filename(path)
        if year is None:
            skipped += 1
            log(f"  [{i}/{total}] skip (name): {path.name}")
            continue
        log(f"  [{i}/{total}] load {kind} {year} {league} <- {path.name}")
        raw_rows = load_csv_rows(path)
        n = 0
        for row in raw_rows:
            career = (
                batting_row_to_career(row, year, league)
                if kind == "batting"
                else pitching_row_to_career(row, year, league)
            )
            name = (row.get("player_name_ja") or row.get("name") or "").strip()
            team = (row.get("team") or "").strip()
            indexed = False
            pid = normalize_npb_id(row.get("player_id") or "")
            if pid:
                if kind == "batting":
                    batting_index[pid].append(career)
                else:
                    pitching_index[pid].append(career)
                indexed = True
            if name:
                # 移籍・復帰などで NPB ID が変わった選手も現行IDのページへ通算統合する。
                # 重複年度は後段で (year, league, team) 単位に除外される。
                if kind == "pitching":
                    for key in candidate_name_keys(name, team, include_team=True):
                        pitching_name_index[key].append(career)
                    indexed = True
                elif kind == "batting":
                    for key in candidate_name_keys(name, team, include_team=True):
                        batting_name_index[key].append(career)
                    indexed = True
            if indexed:
                n += 1
        rows_indexed += n
        log(f"       -> {n} rows indexed")
    return rows_indexed, skipped


def career_row_dedupe_key(r: Dict[str, Any]) -> Tuple[Any, Any, Any]:
    return (r.get("year"), r.get("league"), r.get("team"))


def merge_career_rows_from_id_and_name(
    id_rows: List[Dict[str, Any]],
    name: str,
    team: str,
    name_index: Dict[str, List[Dict[str, Any]]],
    *,
    use_name_team_keys: bool,
) -> List[Dict[str, Any]]:
    """player_id 索引と名前+球団索引を年度単位でユニオン（2025 の空 ID 行を落とさない）。"""
    merged = list(id_rows)
    seen = {career_row_dedupe_key(r) for r in merged}
    keys = candidate_name_keys(name, team, include_team=use_name_team_keys)
    for key in keys:
        if not key:
            continue
        for r in name_index.get(key, []):
            rk = career_row_dedupe_key(r)
            if rk in seen:
                continue
            seen.add(rk)
            merged.append(r)
    return merged


def resolve_batting_rows(
    norm_id: str,
    name: str,
    team: str,
    batting_index: Dict[str, List[Dict[str, Any]]],
    batting_name_index: Dict[str, List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    id_rows = list(batting_index.get(norm_id, []))
    return merge_career_rows_from_id_and_name(
        id_rows, name, team, batting_name_index, use_name_team_keys=True
    )


def resolve_pitching_rows(
    norm_id: str,
    name: str,
    team: str,
    pitching_index: Dict[str, List[Dict[str, Any]]],
    pitching_name_index: Dict[str, List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    id_rows = list(pitching_index.get(norm_id, []))
    return merge_career_rows_from_id_and_name(
        id_rows, name, team, pitching_name_index, use_name_team_keys=False
    )


def sort_career_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(rows, key=lambda r: (r.get("year") or 0, r.get("league") or "", r.get("team") or ""))


def write_targets(roster: List[Dict[str, str]], out_path: Path) -> None:
    targets = []
    for row in roster:
        pid = (row.get("npb_player_id") or "").strip()
        targets.append(
            {
                "npb_player_id": pid,
                "npb_player_id_normalized": normalize_npb_id(pid),
                "name_ja": (row.get("name_ja") or "").strip(),
                "team": (row.get("team") or "").strip(),
                "team_code": (row.get("team_code") or "").strip(),
                "position": (row.get("position") or "").strip(),
                "uniform_no": (row.get("uniform_no") or "").strip(),
                "npb_url": f"https://npb.jp/bis/players/{pid}.html" if pid else "",
            }
        )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(targets, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 1: 通算成績をマスタ CSV から一括組み立て")
    parser.add_argument("--roster", type=Path, default=DEFAULT_ROSTER)
    parser.add_argument(
        "--master-dir",
        type=Path,
        action="append",
        default=None,
        help="マスタ CSV ディレクトリ（複数可）。未指定時は calculated + import",
    )
    parser.add_argument("--out-career-dir", type=Path, default=OUT_CAREER_DIR)
    parser.add_argument("--out-targets", type=Path, default=OUT_TARGETS)
    parser.add_argument("--out-missing", type=Path, default=OUT_MISSING)
    parser.add_argument("--limit", type=int, default=0, help="デバッグ: 名簿の先頭 N 人だけ出力")
    args = parser.parse_args()

    master_dirs = args.master_dir if args.master_dir else DEFAULT_MASTER_DIRS
    t0 = time.time()

    log("=== Phase 1: 通算（マスタ結合）開始 ===")
    log(f"roster: {args.roster}")

    if not args.roster.is_file():
        log(f"ERROR: 名簿がありません: {args.roster}")
        return 1

    roster = load_roster(args.roster)
    if args.limit > 0:
        roster = roster[: args.limit]
    log(f"名簿: {len(roster)} 人")

    log("")
    log("[Step 1/4] _targets_2026.json を生成")
    write_targets(roster, args.out_targets)
    log(f"  -> {args.out_targets}")

    batting_files = discover_master_files(master_dirs, BATTING_GLOB)
    pitching_files = discover_master_files(master_dirs, PITCHING_GLOB)
    log("")
    log(f"[Step 2/4] マスタ CSV を読込（打撃 {len(batting_files)} / 投手 {len(pitching_files)} ファイル）")

    batting_index: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    pitching_index: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    batting_name_index: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    pitching_name_index: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    log("  -- 打撃 --")
    b_rows, b_skip = index_master_files(
        batting_files, "batting", batting_index, pitching_index, batting_name_index, pitching_name_index
    )
    log("  -- 投手 --")
    p_rows, p_skip = index_master_files(
        pitching_files, "pitching", batting_index, pitching_index, batting_name_index, pitching_name_index
    )

    unique_bat = len(batting_index)
    unique_pit = len(pitching_index)
    log("")
    log(f"  打撃行: {b_rows} / 投手行: {p_rows}")
    log(f"  ユニーク選手（打撃）: {unique_bat} / （投手）: {unique_pit}")

    log("")
    log("[Step 3/4] 名簿選手ごとに JSON 出力")
    args.out_career_dir.mkdir(parents=True, exist_ok=True)
    built_at = datetime.now(timezone.utc).isoformat()

    missing: List[Dict[str, str]] = []
    with_batting = 0
    with_pitching = 0
    with_either = 0
    total = len(roster)

    for i, row in enumerate(roster, 1):
        pid_raw = (row.get("npb_player_id") or "").strip()
        norm = normalize_npb_id(pid_raw)
        name = (row.get("name_ja") or "").strip()

        team = (row.get("team") or "").strip()
        bat_rows = sort_career_rows(
            resolve_batting_rows(norm, name, team, batting_index, batting_name_index)
        )
        pit_rows = sort_career_rows(
            resolve_pitching_rows(norm, name, team, pitching_index, pitching_name_index)
        )

        if bat_rows:
            with_batting += 1
        if pit_rows:
            with_pitching += 1
        if bat_rows or pit_rows:
            with_either += 1
        else:
            missing.append(
                {
                    "npb_player_id": pid_raw,
                    "name_ja": name,
                    "team": (row.get("team") or "").strip(),
                    "position": (row.get("position") or "").strip(),
                }
            )

        payload = {
            "npb_player_id": pid_raw,
            "npb_player_id_normalized": norm,
            "name_ja": name,
            "built_at": built_at,
            "source": "master_csv",
            "career_batting": {"rows": bat_rows, "total": {}},
            "career_pitching": {"rows": pit_rows, "total": {}} if pit_rows else None,
        }
        out_file = args.out_career_dir / f"{pid_raw or norm or f'unknown_{i}'}.json"
        out_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

        if i == 1 or i == total or i % 50 == 0:
            pct = 100.0 * i / total if total else 0
            log(
                f"  [{i}/{total}] ({pct:5.1f}%) {name} "
                f"打撃{len(bat_rows)}年 投手{len(pit_rows)}年"
            )

    log("")
    log("[Step 4/4] レポート")
    args.out_missing.parent.mkdir(parents=True, exist_ok=True)
    with args.out_missing.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["npb_player_id", "name_ja", "team", "position"],
        )
        w.writeheader()
        w.writerows(missing)
    log(f"  マスタに年度行なし: {len(missing)} 人 -> {args.out_missing}")

    elapsed = time.time() - t0
    log("")
    log("=== Phase 1 完了 ===")
    log(f"  出力先: {args.out_career_dir}")
    log(f"  成績あり: {with_either}/{total} ({100*with_either/total:.1f}%)" if total else "")
    log(f"    打撃: {with_batting} / 投手: {with_pitching}")
    log(f"  経過: {elapsed:.1f}s")
    log("  NPB HTTP: 0")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
