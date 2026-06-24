#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ランキング JSON の player-N 等を NPB player_id に差し替え、個人ページ /players/{npb_id} と接続する。

対象:
  public/data/rankings/**/*.json

索引:
  _data/player_profile/_targets_historical_career.json（build_historical_career_player_pages.py 生成）

副産物:
  public/data/player_page_roman_aliases.json  … ?roman= 付き旧 URL から NPB ID へリダイレクト用
  _reports/patch_ranking_player_links_to_npb.csv

Usage:
  python _tools/patch_ranking_player_links_to_npb.py --dry-run
  python _tools/patch_ranking_player_links_to_npb.py
  python _tools/patch_ranking_player_links_to_npb.py --only-name 山本浩二
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
TARGETS_PATH = ROOT / "_data" / "player_profile" / "_targets_historical_career.json"
RANKINGS_ROOT = ROOT / "public" / "data" / "rankings"
ROMAN_ALIASES_PATH = ROOT / "public" / "data" / "player_page_roman_aliases.json"
REPORT_PATH = ROOT / "_reports" / "patch_ranking_player_links_to_npb.csv"

# ランキング JSON の team 表記 → 索引 team の候補
TEAM_EXPAND: Dict[str, List[str]] = {
    "広島": ["広島", "広島東洋カープ", "広島カープ"],
    "巨人": ["巨人", "読売", "読売ジャイアンツ"],
    "DeNA": ["DeNA", "横浜", "横浜DeNA", "横浜DeNAベイスターズ"],
    "中日": ["中日", "中日ドラゴンズ"],
    "ヤクルト": ["ヤクルト", "東京ヤクルト", "東京ヤクルトスワローズ"],
    "阪神": ["阪神", "阪神タイガース"],
    "オリックス": ["オリックス", "オリックス・バファローズ", "近鉄", "大阪近鉄"],
    "ロッテ": ["ロッテ", "千葉ロッテ", "千葉ロッテマリーンズ"],
    "日本ハム": ["日本ハム", "北海道日本ハム", "北海道日本ハムファイターズ", "ハム"],
    "楽天": ["楽天", "東北楽天", "東北楽天ゴールデンイーグルス", "イーグルス"],
    "西武": ["西武", "埼玉西武", "埼玉西武ライオンズ", "ライオンズ"],
    "ソフトバンク": ["ソフトバンク", "福岡ソフトバンク", "福岡ソフトバンクホークス", "ホークス", "ダイエー"],
}


def log(msg: str) -> None:
    print(msg, flush=True)


def clean(value: Any) -> str:
    return str(value or "").strip()


def normalize_name(name: str) -> str:
    return re.sub(r"[\s\u3000]+", "", name)


def normalize_npb_id(raw: str) -> str:
    """01403862 → 1403862（merged ファイル名と揃える）"""
    s = clean(raw)
    if not s:
        return ""
    digits = re.sub(r"\D", "", s)
    if not digits:
        return ""
    return digits.lstrip("0") or "0"


def normalize_team_token(team: str) -> str:
    return re.sub(r"[\s\u3000・]+", "", team)


def name_team_key(name: str, team: str = "") -> str:
    n = normalize_name(name)
    t = normalize_team_token(team)
    return f"{n}|{t}" if t else n


def is_npb_player_id(value: str) -> bool:
    return bool(re.fullmatch(r"\d{6,}", clean(value)))


def expand_team_tokens(team: str) -> List[str]:
    raw = clean(team)
    if not raw:
        return [""]
    tokens = {normalize_team_token(raw)}
    for key, variants in TEAM_EXPAND.items():
        if key in raw or raw in variants or any(v in raw for v in variants):
            for v in variants:
                tokens.add(normalize_team_token(v))
            tokens.add(normalize_team_token(key))
    return sorted(tokens)


def load_targets() -> List[Dict[str, str]]:
    if not TARGETS_PATH.is_file():
        raise FileNotFoundError(f"missing targets: {TARGETS_PATH}")
    raw = json.loads(TARGETS_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError(f"invalid targets: {TARGETS_PATH}")
    return [r for r in raw if isinstance(r, dict)]


def build_player_index(targets: Iterable[Dict[str, str]]) -> Dict[str, str]:
    index: Dict[str, str] = {}
    for row in targets:
        pid = normalize_npb_id(clean(row.get("player_id") or row.get("npb_player_id")))
        name = clean(row.get("name_ja"))
        team = clean(row.get("team"))
        if not pid or not name:
            continue
        for team_token in expand_team_tokens(team):
            for key in (name_team_key(name, team_token), name_team_key(name)):
                index.setdefault(key, pid)
    return index


def resolve_npb_id(row: Dict[str, Any], index: Dict[str, str]) -> Optional[str]:
    explicit = clean(row.get("npbPlayerId") or row.get("npb_player_id"))
    if explicit and is_npb_player_id(explicit):
        return normalize_npb_id(explicit)

    current = clean(row.get("playerId") or row.get("player_id"))
    if current and is_npb_player_id(current):
        return normalize_npb_id(current)

    name = normalize_name(clean(row.get("name") or row.get("player")))
    if not name:
        return None

    team_raw = clean(row.get("team"))
    candidates: List[str] = []
    for team_token in expand_team_tokens(team_raw):
        candidates.append(name_team_key(name, team_token))
    candidates.append(name_team_key(name))

    for key in candidates:
        pid = index.get(key)
        if pid:
            return normalize_npb_id(pid)
    return None


def patch_ranking_file(
    path: Path,
    index: Dict[str, str],
    dry_run: bool,
    only_name: str,
) -> Tuple[int, List[Dict[str, str]]]:
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return 0, []
    if not isinstance(rows, list):
        return 0, []

    changed = 0
    report: List[Dict[str, str]] = []
    only_norm = normalize_name(only_name) if only_name else ""

    for row in rows:
        if not isinstance(row, dict):
            continue
        name = normalize_name(clean(row.get("name") or row.get("player")))
        if only_norm and name != only_norm:
            continue

        old_id = clean(row.get("playerId") or row.get("player_id"))
        npb_id = resolve_npb_id(row, index)
        if not npb_id:
            continue
        if normalize_npb_id(old_id) == npb_id and normalize_npb_id(clean(row.get("npbPlayerId"))) == npb_id:
            continue

        if not dry_run:
            row["playerId"] = npb_id
            row["npbPlayerId"] = npb_id

        changed += 1
        report.append(
            {
                "file": str(path.relative_to(ROOT)),
                "name": clean(row.get("name") or row.get("player")),
                "team": clean(row.get("team")),
                "old_player_id": old_id,
                "new_player_id": npb_id,
                "roman_name": clean(row.get("romanName") or row.get("roman_name")),
            }
        )

    if changed and not dry_run:
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return changed, report


def collect_roman_aliases(report_rows: Iterable[Dict[str, str]]) -> Dict[str, str]:
    aliases: Dict[str, str] = {}
    for row in report_rows:
        roman = clean(row.get("roman_name"))
        npb_id = clean(row.get("new_player_id"))
        if roman and npb_id:
            aliases[roman] = npb_id
    return aliases


def merge_existing_roman_aliases(base: Dict[str, str]) -> Dict[str, str]:
    if not ROMAN_ALIASES_PATH.is_file():
        return base
    try:
        existing = json.loads(ROMAN_ALIASES_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return base
    if isinstance(existing, dict):
        merged = dict(existing)
        merged.update(base)
        return merged
    return base


def main() -> int:
    parser = argparse.ArgumentParser(description="ランキング JSON の playerId を NPB ID に差し替え")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--only-name", type=str, default="", help="指定選手名のみ（空白無視）")
    args = parser.parse_args()

    targets = load_targets()
    index = build_player_index(targets)
    log(f"player index: {len(index)} keys from {len(targets)} targets")

    if not RANKINGS_ROOT.is_dir():
        log(f"ERROR: rankings dir missing: {RANKINGS_ROOT}")
        return 1

    files = sorted(RANKINGS_ROOT.rglob("*.json"))
    files = [p for p in files if p.name != "player_page_roman_aliases.json"]

    total_changed = 0
    all_report: List[Dict[str, str]] = []

    for path in files:
        n, rep = patch_ranking_file(path, index, args.dry_run, args.only_name)
        if n:
            total_changed += n
            all_report.extend(rep)

    roman_aliases = merge_existing_roman_aliases(collect_roman_aliases(all_report))

    if not args.dry_run:
        ROMAN_ALIASES_PATH.parent.mkdir(parents=True, exist_ok=True)
        ROMAN_ALIASES_PATH.write_text(
            json.dumps(roman_aliases, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=["file", "name", "team", "old_player_id", "new_player_id", "roman_name"],
            )
            writer.writeheader()
            writer.writerows(all_report)

    log("")
    log(f"{'[dry-run] ' if args.dry_run else ''}patched rows: {total_changed}")
    log(f"roman aliases: {len(roman_aliases)}")
    if not args.dry_run:
        log(f"roman map: {ROMAN_ALIASES_PATH}")
        log(f"report: {REPORT_PATH}")

    sample = [r for r in all_report if normalize_name(r.get("name", "")) == "山本浩二"]
    if sample:
        log("")
        log("山本浩二 例:")
        for r in sample[:3]:
            log(f"  {r['file']}: {r['old_player_id']} -> {r['new_player_id']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
