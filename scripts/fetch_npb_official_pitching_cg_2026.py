#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
2026年の NPB公式投手成績から完投/完封列だけを抽出し、
phase19 が読む `_data/derived/npb_official_pitching_cg_2026.json` を生成する。

既存の `scrape_npb_pitching_stats.py` を再利用し、PL/CL 両リーグを取得する。
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from scrape_npb_pitching_stats import scrape_pitching_stats


PROJECT_ROOT = Path(__file__).resolve().parent.parent
YEAR = 2026
OUT_PATH = PROJECT_ROOT / "_data" / "derived" / f"npb_official_pitching_cg_{YEAR}.json"

TEAM_TO_SHORT = {
    "中日ドラゴンズ": "中日",
    "広島東洋カープ": "広島",
    "東京ヤクルトスワローズ": "ヤクルト",
    "読売ジャイアンツ": "巨人",
    "阪神タイガース": "阪神",
    "横浜DeNAベイスターズ": "DeNA",
    "オリックス・バファローズ": "オリックス",
    "千葉ロッテマリーンズ": "ロッテ",
    "北海道日本ハムファイターズ": "日本ハム",
    "東北楽天ゴールデンイーグルス": "楽天",
    "埼玉西武ライオンズ": "西武",
    "福岡ソフトバンクホークス": "ソフトバンク",
}


def to_int(value: Any) -> int:
    text = str(value or "").strip()
    if not text:
        return 0
    try:
        return int(float(text))
    except ValueError:
        return 0


def normalize_team_short(team: Any) -> str:
    text = str(team or "").strip()
    return TEAM_TO_SHORT.get(text, text)


def build_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for row in rows:
        name = str(row.get("player_name_ja") or "").strip()
        team = normalize_team_short(row.get("team"))
        npb_player_id = str(row.get("player_id") or "").strip()
        key = (npb_player_id, name, team)
        if not name or not team or key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "npbPlayerId": npb_player_id or None,
                "name": name,
                "team": team,
                "cg": to_int(row.get("CG")),
                "sho": to_int(row.get("SHO")),
            }
        )
    out.sort(key=lambda item: (item["team"], item["name"], item["npbPlayerId"] or ""))
    return out


def main() -> int:
    all_rows: List[Dict[str, Any]] = []
    for league in ("PL", "CL"):
        print(f"[npb-official-cg] fetch {YEAR} {league}")
        rows = scrape_pitching_stats(YEAR, league)
        if not rows:
            print(f"[npb-official-cg] failed to fetch {YEAR} {league}")
            return 1
        all_rows.extend(rows)

    players = build_rows(all_rows)
    if not players:
        print("[npb-official-cg] no players parsed")
        return 1

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "year": str(YEAR),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "players": players,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[npb-official-cg] wrote {OUT_PATH} players={len(players)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
