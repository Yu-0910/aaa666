#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_pitching_rankings_from_calculated.py

計算済み投手 CSV からランキング JSON を一括生成（1950〜2025）。

入力: _data/master_csv_calculated/pitching_{year}_{CL|PL}_from_master.csv
出力: public/data/rankings/pitching/{year}/{league}/{metric}.json

2026 は Phase 19（canonical）を正とするためデフォルトでは上書きしない（--max-year 2025）。
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).parent))

from build_rankings_2025_PL_full import (  # noqa: E402
    load_csv_with_encoding,
    sanitize_filename,
    normalize_string,
    safe_float,
    safe_int,
)
from add_qualifying_pa_flags import normalize_team_name  # noqa: E402
from lib.filename_parser import (  # noqa: E402
    parse_pitching_filename,
    build_pitching_rankings_output_path,
)
from lib.pitching_historical_metrics import (  # noqa: E402
    load_historical_metric_labels,
    PITCHING_RATE_METRIC_LABELS,
    JAPANESE_TO_CSV_COLUMNS,
    pick_row_cell,
    resolve_hits_allowed_raw,
    resolve_ip_raw,
    ip_baseball_to_decimal,
)

CALCULATED_DIR = ROOT / "_data" / "master_csv_calculated"
OUTPUT_BASE = ROOT / "public" / "data" / "rankings"
METRIC_MAP_PATH = ROOT / "config" / "pitching_metric_map.json"
STANDINGS_DIR = ROOT / "public" / "data" / "standings"
LEGACY_STANDINGS_DIR = ROOT / "public" / "standings-json"
TOP_N = 100
QUALIFYING_IP_PER_TEAM_GAME = 1.0

# lib/ranking/pitchingSortOrder.ts と同期（歴史年度で使う指標のみ）
ASC_JSON_KEYS = frozenset({"era", "whip", "bb_pct"})

# 計算済み CSV 英語列 → JSON キー
CSV_FIELD_TO_JSON: Dict[str, str] = {
    "ERA": "era",
    "K-BB%": "k_bb_pct",
    "WHIP": "whip",
    "W": "w",
    "L": "l",
    "G": "g",
    "IP": "ip",
    "SV": "sv",
    "BF": "bf",
    "H": "ha",
    "HR": "hra",
    "SO": "so",
    "BB": "bb",
    "IBB": "ibb",
    "HBP": "hbp",
    "ER": "er",
    "R": "r",
    "HOLD": "hld",
    "HP": "hp",
    "CG": "cg",
    "SHO": "sho",
    "WPCT": "wpct",
    "K%": "k_pct",
    "BB%": "bb_pct",
    "WP": "wp",
}


def safe_str(x: Any) -> str:
    if x is None:
        return ""
    if isinstance(x, float) and math.isnan(x):
        return ""
    return str(x).strip()


def load_pitching_metric_map() -> Dict[str, str]:
    if not METRIC_MAP_PATH.is_file():
        raise FileNotFoundError(f"pitching_metric_map.json が見つかりません: {METRIC_MAP_PATH}")
    data = json.loads(METRIC_MAP_PATH.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}


def label_to_json_key(label: str, metric_map: Dict[str, str]) -> str:
    key = metric_map.get(label)
    if key:
        return key
    raise KeyError(f"指標ラベルに JSON キーがありません: {label}")


def metric_sort_asc(json_key: str) -> bool:
    k = json_key.lower().strip()
    if k == "bb_pct":
        return True
    return k in ASC_JSON_KEYS


def sort_value(row: Dict[str, Any], json_key: str) -> float:
    v = row.get(json_key)
    if isinstance(v, (int, float)) and math.isfinite(v):
        return float(v)
    if isinstance(v, str) and v:
        try:
            n = float(v)
            if math.isfinite(n):
                return n
        except ValueError:
            pass
    return 0.0


def assign_ranks(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [{**row, "rank": idx + 1} for idx, row in enumerate(rows)]


def get_required_innings(
    year: int,
    league: str,
    team_games: int,
    team_rank: Optional[int] = None,
) -> Optional[float]:
    league_upper = safe_str(league).upper()
    if league_upper not in {"CL", "PL"}:
        return None
    if year >= 1964:
        return team_games * QUALIFYING_IP_PER_TEAM_GAME
    if year == 1950:
        return 180.0 if league_upper == "CL" else 135.0
    if year == 1951:
        return 135.0
    if year == 1952:
        if league_upper == "CL":
            return 180.0
        if team_rank is None:
            return None
        return 180.0 if team_rank <= 4 else 162.0
    if year == 1953:
        return 176.0 if league_upper == "CL" else 180.0
    if year == 1954:
        return 198.0 if league_upper == "CL" else 210.0
    if year == 1955:
        return 190.0 if league_upper == "CL" else 210.0
    if year == 1956:
        return 190.0 if league_upper == "CL" else 230.0
    if year == 1957:
        return 195.0 if league_upper == "CL" else 198.0
    if year == 1958:
        return 190.0
    if year == 1959:
        return 182.0 if league_upper == "CL" else team_games * 1.4
    if year == 1960:
        return 182.0 if league_upper == "CL" else team_games * 1.4
    if year == 1961:
        return 182.0 if league_upper == "CL" else 196.0
    if year == 1962:
        return team_games * 1.4
    if year == 1963:
        return 196.0 if league_upper == "CL" else 210.0
    return None


def load_standings_rows(year: int, league: str) -> Optional[List[Dict[str, Any]]]:
    league_upper = safe_str(league).upper()
    candidate_paths = [
        STANDINGS_DIR / str(year) / f"{league_upper}.json",
        LEGACY_STANDINGS_DIR / str(year) / f"{league_upper}.json",
    ]
    for candidate_path in candidate_paths:
        if not candidate_path.is_file():
            continue
        try:
            raw = json.loads(candidate_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        rows = raw.get("rows")
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
    return None


def set_threshold_alias(by_team: Dict[str, float], key: str, min_ip: float) -> None:
    normalized = safe_str(key)
    if not normalized:
        return
    by_team[normalized] = max(by_team.get(normalized, 0.0), min_ip)


def compute_qualifying_thresholds(
    rows: List[Dict[str, Any]],
    year: int,
    league: str,
) -> Tuple[Dict[str, float], float]:
    by_team_max_g: Dict[str, int] = {}
    global_max_g = 0
    for row in rows:
        g = safe_int(row.get("g"), 0)
        global_max_g = max(global_max_g, g)
        team = safe_str(row.get("team"))
        if team:
            by_team_max_g[team] = max(by_team_max_g.get(team, 0), g)
    by_team: Dict[str, float] = {}

    standings_rows = load_standings_rows(year, league)
    if standings_rows:
        for standing in standings_rows:
            team = safe_str(standing.get("team"))
            team_name = safe_str(standing.get("teamName"))
            npb_label = safe_str(standing.get("npbLabel"))
            games = safe_int(standing.get("g"), 0)
            rank = safe_int(standing.get("rank"), 0)
            if games <= 0:
                continue
            required = get_required_innings(year, league, games, rank if rank > 0 else None)
            min_ip = required if required is not None else games * QUALIFYING_IP_PER_TEAM_GAME
            set_threshold_alias(by_team, team, min_ip)
            set_threshold_alias(by_team, team_name, min_ip)
            set_threshold_alias(by_team, npb_label, min_ip)
            global_max_g = max(global_max_g, games)
    else:
        for team, games in by_team_max_g.items():
            required = get_required_innings(year, league, games)
            by_team[team] = required if required is not None else games * QUALIFYING_IP_PER_TEAM_GAME

    max_from_teams = max(by_team_max_g.values()) if by_team_max_g else 0
    fallback_games = max(global_max_g, max_from_teams)
    fallback = get_required_innings(year, league, fallback_games)
    if fallback is None:
        fallback = fallback_games * QUALIFYING_IP_PER_TEAM_GAME
    return by_team, fallback


def row_meets_qualifying(
    row: Dict[str, Any],
    by_team: Dict[str, float],
    fallback: float,
) -> bool:
    ip = ip_baseball_to_decimal(row.get("ip"))
    team = safe_str(row.get("team"))
    min_ip = by_team.get(team, fallback) if team else fallback
    return ip >= min_ip


def normalize_player_name_key(name: str) -> str:
    return normalize_string(name.replace("\u3000", " "))


def _csv_row_completeness_score(row: Dict[str, Any]) -> int:
    score = 0
    if safe_str(row.get("player_id")):
        score += 100
    for col in ("H", "SO", "BF", "IP", "ERA", "WHIP"):
        if safe_str(row.get(col)):
            score += 1
    return score


def dedupe_pitching_csv_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """同一 (チーム, 正規化選手名) の重複行を除去（全角スペース差・追補マージ対策）。"""
    best: Dict[Tuple[str, str], Dict[str, Any]] = {}
    order: List[Tuple[str, str]] = []
    for row in rows:
        team_raw = safe_str(row.get("team") or row.get("Team"))
        team = normalize_team_name(team_raw) if team_raw else ""
        name = normalize_player_name_key(
            safe_str(row.get("player_name_ja"))
            or safe_str(row.get("player_name"))
            or safe_str(row.get("name"))
        )
        if not name:
            continue
        key = (team, name)
        if key not in best:
            order.append(key)
            best[key] = row
        elif _csv_row_completeness_score(row) > _csv_row_completeness_score(best[key]):
            best[key] = row
    return [best[k] for k in order]


def build_pitching_player_row(
    csv_row: Dict[str, Any],
    row_index: int,
    metric_map: Dict[str, str],
) -> Dict[str, Any]:
    name = normalize_string(
        safe_str(csv_row.get("player_name_ja"))
        or safe_str(csv_row.get("player_name"))
        or safe_str(csv_row.get("name"))
    )
    player_id = safe_str(csv_row.get("player_id"))
    if not player_id:
        player_id = f"player-{row_index + 1}"

    team_raw = safe_str(csv_row.get("team") or csv_row.get("Team"))
    team = normalize_team_name(team_raw) if team_raw else ""

    stats: Dict[str, Any] = {}
    for label in JAPANESE_TO_CSV_COLUMNS:
        json_key = metric_map.get(label)
        if not json_key:
            continue
        if json_key == "ha":
            raw = resolve_hits_allowed_raw(csv_row)
        elif json_key == "ip":
            raw = resolve_ip_raw(csv_row)
        else:
            raw = pick_row_cell(csv_row, label)
        if raw is None or raw == "":
            continue

        if json_key == "ip":
            stats[json_key] = round(ip_baseball_to_decimal(safe_float(raw)), 3)
        elif json_key in ("era", "whip", "k_bb_pct", "k_pct", "bb_pct", "wpct"):
            stats[json_key] = round(safe_float(raw), 3)
        elif json_key in (
            "w", "l", "g", "sv", "bf", "ha", "hra", "so", "bb", "ibb", "hbp",
            "er", "r", "hld", "hp", "cg", "sho", "wp",
        ):
            stats[json_key] = safe_int(raw, 0)
        else:
            stats[json_key] = safe_float(raw)

    row: Dict[str, Any] = {
        "playerId": player_id,
        "player": name or player_id,
        "name": name or player_id,
        "team": team,
        "metric": "防御率",
        **stats,
    }
    roman = safe_str(csv_row.get("player_name_en"))
    if roman:
        row["romanName"] = roman
    return row


def write_json(path: Path, rows: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def process_pitching_csv(
    csv_path: Path,
    metrics: List[str],
    metric_map: Dict[str, str],
    *,
    dry_run: bool = False,
) -> Tuple[bool, Dict[str, Any]]:
    parsed = parse_pitching_filename(csv_path.name)
    if not parsed:
        return False, {"error": f"ファイル名パース失敗: {csv_path.name}"}

    year = parsed["year"]
    league_key = parsed["league_key"]
    rel_out = build_pitching_rankings_output_path(year, league_key)
    output_dir = OUTPUT_BASE / rel_out

    try:
        csv_rows = load_csv_with_encoding(str(csv_path))
    except Exception as e:
        return False, {"year": year, "league": league_key, "error": str(e)}

    raw_count = len(csv_rows)
    csv_rows = dedupe_pitching_csv_rows(csv_rows)
    if len(csv_rows) < raw_count:
        print(f"   重複除去: {raw_count} -> {len(csv_rows)} 行")

    player_rows = [
        build_pitching_player_row(r, i, metric_map) for i, r in enumerate(csv_rows)
    ]
    if not player_rows:
        return False, {"year": year, "league": league_key, "error": "行が0件"}

    by_team, fallback = compute_qualifying_thresholds(player_rows, year, league_key)
    written = 0

    if dry_run:
        return True, {
            "year": year,
            "league": league_key,
            "players": len(player_rows),
            "metrics": len(metrics),
            "output_dir": str(output_dir),
            "dry_run": True,
        }

    for label in metrics:
        json_key = label_to_json_key(label, metric_map)
        is_rate = label in PITCHING_RATE_METRIC_LABELS
        asc = metric_sort_asc(json_key)

        metric_rows = [{**r, "metric": label} for r in player_rows]
        sorted_rows = sorted(
            metric_rows,
            key=lambda r: sort_value(r, json_key),
            reverse=not asc,
        )
        ranked_all = assign_ranks(sorted_rows[:TOP_N])

        if is_rate:
            qualified = [
                r for r in sorted_rows if row_meets_qualifying(r, by_team, fallback)
            ]
            ranked_public = assign_ranks(qualified[:TOP_N])
        else:
            ranked_public = ranked_all

        file_base = sanitize_filename(label)
        write_json(output_dir / f"{file_base}.json", ranked_public)
        write_json(output_dir / f"{file_base}_all.json", ranked_all)
        written += 2

    return True, {
        "year": year,
        "league": league_key,
        "players": len(player_rows),
        "files_written": written,
        "output_dir": str(output_dir),
    }


def parse_exclude_pattern(exclude_str: str) -> List[Tuple[int, str]]:
    patterns: List[Tuple[int, str]] = []
    for part in exclude_str.split(","):
        part = part.strip()
        if not part or ":" not in part:
            continue
        year_str, league_str = part.split(":", 1)
        try:
            patterns.append((int(year_str.strip()), league_str.strip().upper()))
        except ValueError:
            print(f"警告: 無効な除外パターン: {part}")
    return patterns


def should_skip_year(
    year: int,
    *,
    max_year: Optional[int],
    year_from: Optional[int],
    year_to: Optional[int],
    filter_year: Optional[int],
) -> bool:
    if max_year is not None and year > max_year:
        return True
    if year_from is not None and year < year_from:
        return True
    if year_to is not None and year > year_to:
        return True
    if filter_year is not None and year != filter_year:
        return True
    return False


def collect_csv_files(args: argparse.Namespace) -> List[Path]:
    exclude = parse_exclude_pattern(args.exclude)
    files: List[Path] = []
    candidates: List[Path] = []
    for league in ("CL", "PL"):
        candidates.extend(CALCULATED_DIR.glob(f"pitching_*_{league}_from_master.csv"))
    for csv_path in sorted(set(candidates)):
        parsed = parse_pitching_filename(csv_path.name)
        if not parsed:
            continue
        year = parsed["year"]
        league = parsed["league_key"]
        if should_skip_year(
            year,
            max_year=args.max_year,
            year_from=args.year_from,
            year_to=args.year_to,
            filter_year=args.year,
        ):
            continue
        if args.league and league != args.league.upper():
            continue
        if (year, league) in exclude:
            continue
        files.append(csv_path)
    return files


def main() -> int:
    parser = argparse.ArgumentParser(
        description="計算済み投手 CSV からランキング JSON を生成（1950〜2025）"
    )
    parser.add_argument("--year", type=int, help="単一年度のみ")
    parser.add_argument("--league", type=str, help="CL または PL")
    parser.add_argument("--year-from", type=int, help="開始年度")
    parser.add_argument("--year-to", type=int, help="終了年度")
    parser.add_argument(
        "--max-year",
        type=int,
        default=2025,
        help="この年度以下のみ処理（デフォルト 2025 = 2026 を保護）",
    )
    parser.add_argument("--exclude", type=str, default="", help="除外: 2026:CL,2026:PL")
    parser.add_argument("--dry-run", action="store_true", help="件数のみ表示")
    args = parser.parse_args()

    if not CALCULATED_DIR.is_dir():
        print(f"エラー: 入力ディレクトリがありません: {CALCULATED_DIR}")
        return 1

    try:
        metrics = load_historical_metric_labels()
        metric_map = load_pitching_metric_map()
    except Exception as e:
        print(f"エラー: {e}")
        return 1

    csv_files = collect_csv_files(args)
    print(f"処理対象: {len(csv_files)} ファイル（指標 {len(metrics)} 件）")
    if args.max_year:
        print(f"max-year: {args.max_year}（{args.max_year + 1} 年以降はスキップ）")
    if not csv_files:
        print("エラー: 対象 CSV がありません")
        return 1

    ok = 0
    ng = 0
    for csv_path in csv_files:
        success, info = process_pitching_csv(
            csv_path, metrics, metric_map, dry_run=args.dry_run
        )
        if success:
            ok += 1
            if args.dry_run:
                print(
                    f"  [dry-run] {info['year']} {info['league']}: "
                    f"{info['players']} 投手 x {info['metrics']} 指標"
                )
            else:
                print(
                    f"  OK {info['year']} {info['league']}: "
                    f"{info['players']} 投手, {info['files_written']} JSON"
                )
        else:
            ng += 1
            print(f"  NG {csv_path.name}: {info.get('error', 'unknown')}")

    print(f"\n完了: 成功 {ok}, 失敗 {ng}")
    return 0 if ng == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
