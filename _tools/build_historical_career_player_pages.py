#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
マスタ CSV に成績がある 2026 名簿外選手向けに、通算成績タブ専用個人ページ用データを生成する。

1. マスタ CSV から player_id 付き選手を収集（2026 名簿は除外）
2. 仮名簿 CSV + targets JSON を書き出し
3. scripts/build_player_career_from_master.py で career_from_master を生成
4. tsx scripts/merge_player_profile.ts --historical-career-only で merged JSON を生成
   （meta.page_kind = career_only_non_roster）

UI: PlayerPageClient が page_kind を解釈し、2026 名簿選手の「通算成績」タブ相当を表示する。

Usage:
  python _tools/build_historical_career_player_pages.py --dry-run
  python _tools/build_historical_career_player_pages.py
  python _tools/build_historical_career_player_pages.py --only-id 01005153
  python _tools/build_historical_career_player_pages.py --limit 100
  python _tools/build_historical_career_player_pages.py --patch-ranking-links
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

ROOT = Path(__file__).resolve().parents[1]
ROSTER_PATH = ROOT / "_data" / "npb_roster_2026.csv"
MASTER_DIRS = [
    ROOT / "_data" / "master_csv_calculated",
    ROOT / "_data" / "master_csv__import_1950_2024",
]
OUT_TARGETS = ROOT / "_data" / "player_profile" / "_targets_historical_career.json"
OUT_ROSTER_CSV = ROOT / "_data" / "player_profile" / "_roster_historical_career.csv"
REPORT_PATH = ROOT / "_reports" / "historical_career_player_pages_build.csv"
RANKINGS_ROOT = ROOT / "public" / "data" / "rankings"

BATTING_GLOB = "batting_*_*_from_master.csv"
PITCHING_GLOB_ALT = "pitching_*_*_from_master.csv"


def log(msg: str) -> None:
    print(msg, flush=True)


def clean(value: Any) -> str:
    return str(value or "").strip()


def normalize_npb_id(raw: str) -> str:
    s = clean(raw)
    if not s or s.lower() in ("nan", "none", "-"):
        return ""
    digits = re.sub(r"\D", "", s)
    if not digits:
        return ""
    return digits.lstrip("0") or "0"


def normalize_name_key(name: str, team: str = "") -> str:
    n = re.sub(r"[\s\u3000]+", "", name)
    t = re.sub(r"[\s\u3000]+", "", team)
    return f"{n}|{t}" if t else n


def parse_year_league(path: Path) -> Tuple[Optional[int], str]:
    m = re.match(r"(?:batting|pitching)_(\d{4})_(CL|PL)_from_master\.csv$", path.name, re.I)
    if not m:
        return None, ""
    return int(m.group(1)), m.group(2).upper()


def discover_master_files() -> List[Path]:
    seen: Set[str] = set()
    out: List[Path] = []
    for d in MASTER_DIRS:
        if not d.is_dir():
            continue
        for pattern in (BATTING_GLOB, PITCHING_GLOB_ALT):
            for p in sorted(d.glob(pattern)):
                key = str(p.resolve())
                if key not in seen:
                    seen.add(key)
                    out.append(p)
    return out


def load_roster_ids() -> Set[str]:
    ids: Set[str] = set()
    if not ROSTER_PATH.is_file():
        raise FileNotFoundError(f"missing roster: {ROSTER_PATH}")
    with ROSTER_PATH.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            pid = normalize_npb_id(row.get("npb_player_id") or row.get("player_id"))
            if pid:
                ids.add(pid)
    return ids


class PlayerAccumulator:
    __slots__ = ("name_by_year", "team_by_year", "has_batting", "has_pitching")

    def __init__(self) -> None:
        self.name_by_year: Dict[int, str] = {}
        self.team_by_year: Dict[int, str] = {}
        self.has_batting = False
        self.has_pitching = False

    def note(self, year: int, name: str, team: str, kind: str) -> None:
        if name:
            self.name_by_year[year] = name
        if team:
            self.team_by_year[year] = team
        if kind == "batting":
            self.has_batting = True
        else:
            self.has_pitching = True

    def best_name(self) -> str:
        if not self.name_by_year:
            return ""
        year = max(self.name_by_year)
        return self.name_by_year[year]

    def best_team(self) -> str:
        if not self.team_by_year:
            return ""
        year = max(self.team_by_year)
        return self.team_by_year[year]

    def registration_position(self) -> str:
        if self.has_pitching and not self.has_batting:
            return "投手"
        if self.has_batting and not self.has_pitching:
            return "外野手"
        return ""


def scan_master_players() -> Dict[str, PlayerAccumulator]:
    players: Dict[str, PlayerAccumulator] = defaultdict(PlayerAccumulator)
    files = discover_master_files()
    log(f"scan master CSV: {len(files)} files")

    for path in files:
        year, _league = parse_year_league(path)
        if year is None:
            continue
        kind = "batting" if path.name.startswith("batting_") else "pitching"
        with path.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                pid = normalize_npb_id(row.get("player_id") or "")
                if not pid:
                    continue
                name = clean(row.get("player_name_ja") or row.get("player_name") or row.get("name"))
                team = clean(row.get("team") or row.get("Team") or row.get("チーム"))
                players[pid].note(year, name, team, kind)
    return players


def write_roster_csv(players: Iterable[Tuple[str, PlayerAccumulator]]) -> int:
    OUT_ROSTER_CSV.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with OUT_ROSTER_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["npb_player_id", "name_ja", "team", "position"],
        )
        writer.writeheader()
        for pid, acc in players:
            writer.writerow(
                {
                    "npb_player_id": pid,
                    "name_ja": acc.best_name(),
                    "team": acc.best_team(),
                    "position": acc.registration_position(),
                }
            )
            count += 1
    return count


def write_targets_json(players: Iterable[Tuple[str, PlayerAccumulator]]) -> int:
    targets: List[Dict[str, str]] = []
    for pid, acc in players:
        targets.append(
            {
                "player_id": pid,
                "npb_player_id": pid,
                "name_ja": acc.best_name(),
                "team": acc.best_team(),
                "position": acc.registration_position(),
            }
        )
    OUT_TARGETS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TARGETS.write_text(json.dumps(targets, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(targets)


def run_build_career_from_master() -> None:
    cmd = [
        sys.executable,
        str(ROOT / "scripts" / "build_player_career_from_master.py"),
        "--roster",
        str(OUT_ROSTER_CSV),
        "--out-targets",
        str(OUT_TARGETS.with_name("_targets_historical_career_build.json")),
    ]
    log(f"run: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=str(ROOT), check=True)


def run_merge_historical(dry_run: bool) -> None:
    if dry_run:
        log("skip merge (dry-run)")
        return
    cmd = ["npx", "tsx", "scripts/merge_player_profile.ts", "--historical-career-only"]
    log(f"run: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=str(ROOT), check=True)


def build_name_team_index(
    players: Dict[str, PlayerAccumulator],
) -> Dict[str, str]:
    index: Dict[str, str] = {}
    for pid, acc in players.items():
        name = re.sub(r"[\s\u3000]+", "", acc.best_name())
        team = re.sub(r"[\s\u3000]+", "", acc.best_team())
        if name:
            index[normalize_name_key(name, team)] = pid
            index[normalize_name_key(name)] = pid
    return index


def patch_ranking_json_file(path: Path, index: Dict[str, str]) -> Tuple[int, int]:
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return 0, 0
    if not isinstance(rows, list):
        return 0, 0

    touched = 0
    linked = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        current_id = clean(row.get("playerId") or row.get("player_id"))
        if current_id and re.fullmatch(r"\d{6,}", current_id):
            row["npbPlayerId"] = current_id
            continue
        name = re.sub(r"[\s\u3000]+", "", clean(row.get("name") or row.get("player")))
        team = re.sub(r"[\s\u3000]+", "", clean(row.get("team")))
        if not name:
            continue
        pid = index.get(normalize_name_key(name, team)) or index.get(normalize_name_key(name))
        if not pid:
            continue
        row["playerId"] = pid
        row["npbPlayerId"] = pid
        touched += 1
        linked += 1

    if touched > 0:
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return touched, linked


def patch_ranking_links(players: Dict[str, PlayerAccumulator], dry_run: bool) -> None:
    index = build_name_team_index(players)
    if not RANKINGS_ROOT.is_dir():
        log(f"skip ranking patch: missing {RANKINGS_ROOT}")
        return

    files = sorted(RANKINGS_ROOT.rglob("*.json"))
    total_files = 0
    total_rows = 0
    for path in files:
        if dry_run:
            try:
                rows = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if not isinstance(rows, list):
                continue
            for row in rows:
                if not isinstance(row, dict):
                    continue
                current_id = clean(row.get("playerId") or row.get("player_id"))
                if current_id and re.fullmatch(r"\d{6,}", current_id):
                    continue
                name = re.sub(r"[\s\u3000]+", "", clean(row.get("name") or row.get("player")))
                if name and (
                    index.get(normalize_name_key(name, re.sub(r"[\s\u3000]+", "", clean(row.get("team")))))
                    or index.get(normalize_name_key(name))
                ):
                    total_rows += 1
            total_files += 1
            continue

        touched, linked = patch_ranking_json_file(path, index)
        if touched:
            total_files += 1
            total_rows += linked

    log(f"ranking patch: {total_rows} rows linked in {total_files} files")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="2026名簿外・マスタ成績あり選手の通算成績専用個人ページデータを生成",
    )
    parser.add_argument("--dry-run", action="store_true", help="件数のみ表示し書き込まない")
    parser.add_argument("--only-id", type=str, default="", help="指定 NPB ID のみ")
    parser.add_argument("--limit", type=int, default=0, help="処理件数上限（0=無制限）")
    parser.add_argument(
        "--patch-ranking-links",
        action="store_true",
        help="public/data/rankings の JSON に npbPlayerId / playerId を付与（名前+球団照合）",
    )
    parser.add_argument(
        "--skip-career-build",
        action="store_true",
        help="career_from_master 生成をスキップ（merged のみ再実行）",
    )
    args = parser.parse_args()

    roster_ids = load_roster_ids()
    all_players = scan_master_players()

    historical: List[Tuple[str, PlayerAccumulator]] = []
    for pid, acc in sorted(all_players.items()):
        if pid in roster_ids:
            continue
        if not (acc.has_batting or acc.has_pitching):
            continue
        historical.append((pid, acc))

    if args.only_id.strip():
        only = normalize_npb_id(args.only_id)
        historical = [(pid, acc) for pid, acc in historical if pid == only]
        if not historical:
            log(f"ERROR: --only-id {only} はマスタ成績にありません（または 2026 名簿所属）")
            return 1

    if args.limit > 0:
        historical = historical[: args.limit]

    log("=== historical career-only player pages ===")
    log(f"master players (with id): {len(all_players)}")
    log(f"roster 2026: {len(roster_ids)}")
    log(f"historical targets: {len(historical)}")
    log(f"dry_run: {args.dry_run}")
    log("")

    if not historical:
        log("nothing to do")
        return 0

    if args.dry_run:
        for pid, acc in historical[:20]:
            log(
                f"  {pid} {acc.best_name()} "
                f"bat={acc.has_batting} pit={acc.has_pitching} pos={acc.registration_position()}"
            )
        if len(historical) > 20:
            log(f"  ... and {len(historical) - 20} more")
        if args.patch_ranking_links:
            patch_ranking_links(dict(historical), dry_run=True)
        return 0

    n_roster = write_roster_csv(historical)
    n_targets = write_targets_json(historical)
    log(f"wrote roster csv: {n_roster} -> {OUT_ROSTER_CSV}")
    log(f"wrote targets: {n_targets} -> {OUT_TARGETS}")

    if not args.skip_career_build:
        run_build_career_from_master()
    run_merge_historical(dry_run=False)

    if args.patch_ranking_links:
        patch_ranking_links(dict(historical), dry_run=False)

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "player_id",
                "name_ja",
                "team",
                "registration_position",
                "has_batting",
                "has_pitching",
                "merged_path",
                "page_url",
            ],
        )
        writer.writeheader()
        for pid, acc in historical:
            writer.writerow(
                {
                    "player_id": pid,
                    "name_ja": acc.best_name(),
                    "team": acc.best_team(),
                    "registration_position": acc.registration_position(),
                    "has_batting": acc.has_batting,
                    "has_pitching": acc.has_pitching,
                    "merged_path": str(
                        ROOT / "_data" / "derived" / "player_profile" / "merged" / f"npb_{pid}.json"
                    ),
                    "page_url": f"/players/{pid}",
                }
            )
    log(f"report: {REPORT_PATH}")
    log("")
    log("ページ URL 例: /players/{npb_player_id}")
    log("通算タブ相当 UI（今季タブなし）: meta.page_kind = career_only_non_roster")
    return 0


if __name__ == "__main__":
    if sys.platform == "win32":
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    raise SystemExit(main())
