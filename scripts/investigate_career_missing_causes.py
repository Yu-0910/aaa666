#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""182人のマスタ欠損原因を分類（一軍未出場以外を重点調査）"""

from __future__ import annotations

import csv
import io
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER_DIRS = [
    ROOT / "_data" / "master_csv_calculated",
    ROOT / "_data" / "master_csv__import_1950_2024",
]
MISSING_CSV = ROOT / "_reports" / "player_profile_phase1_career_missing_in_master.csv"
ROSTER_CSV = ROOT / "_data" / "npb_roster_2026.csv"
PROFILE_DIR = ROOT / "_data" / "derived" / "player_profile" / "profile_npb"
OUT_REPORT = ROOT / "_reports" / "player_profile_phase1_missing_cause_investigation.csv"
OUT_SUMMARY = ROOT / "_reports" / "player_profile_phase1_missing_cause_summary.txt"


def normalize_npb_id(raw: str) -> str:
    digits = re.sub(r"\D", "", (raw or "").strip())
    return digits.lstrip("0") or "0" if digits else ""


def normalize_name(name: str) -> str:
    return re.sub(r"[\s\u3000　]+", "", (name or ""))


def normalize_team(team: str) -> str:
    return re.sub(r"[\s\u3000　]+", "", (team or ""))


def load_csv(path: Path) -> List[Dict[str, str]]:
    for enc in ("utf-8-sig", "utf-8", "cp932"):
        try:
            with path.open(encoding=enc, newline="") as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    return []


def discover_files() -> List[Path]:
    seen: Set[str] = set()
    out: List[Path] = []
    for d in MASTER_DIRS:
        if not d.is_dir():
            continue
        for p in sorted(d.glob("batting_*_*_from_master.csv")) + sorted(
            d.glob("pitching_*_*_from_master.csv")
        ):
            if p.name not in seen:
                seen.add(p.name)
                out.append(p)
    return out


def parse_year(path: Path) -> Optional[int]:
    m = re.search(r"_(\d{4})_", path.name)
    return int(m.group(1)) if m else None


def main() -> None:
    # Build master indexes
    by_id: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    by_name: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    by_name_team: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    files = discover_files()
    print(f"マスタファイル: {len(files)}", flush=True)

    for path in files:
        year = parse_year(path)
        kind = "batting" if path.name.startswith("batting") else "pitching"
        for row in load_csv(path):
            pid = normalize_npb_id(row.get("player_id") or "")
            name = normalize_name(row.get("player_name_ja") or row.get("name") or "")
            team = normalize_team(row.get("team") or "")
            if not name:
                continue
            rec = {
                "year": year,
                "kind": kind,
                "player_id": pid,
                "player_id_raw": (row.get("player_id") or "").strip(),
                "name": name,
                "team": team,
                "file": path.name,
            }
            if pid:
                by_id[pid].append(rec)
            by_name[name].append(rec)
            if team:
                by_name_team[f"{name}|{team}"].append(rec)

    missing = list(csv.DictReader(MISSING_CSV.open(encoding="utf-8-sig")))
    roster = {r["npb_player_id"]: r for r in csv.DictReader(ROSTER_CSV.open(encoding="utf-8-sig"))}

    def debut_year(pid: str) -> Optional[int]:
        p = PROFILE_DIR / f"{pid}.json"
        if not p.is_file():
            return None
        raw = (json.loads(p.read_text(encoding="utf-8")).get("profile") or {}).get(
            "pro_debut_raw"
        ) or ""
        m = re.search(r"(20\d{2})", raw)
        return int(m.group(1)) if m else None

    rows_out: List[Dict[str, str]] = []
    cause_counts: Dict[str, int] = defaultdict(int)

    for m in missing:
        pid_raw = m["npb_player_id"]
        norm = normalize_npb_id(pid_raw)
        name = normalize_name(m["name_ja"])
        team = normalize_team(m.get("team") or roster.get(pid_raw, {}).get("team", ""))
        is_new = roster.get(pid_raw, {}).get("is_new_2026", "")
        dy = debut_year(pid_raw)

        id_hits = by_id.get(norm, [])
        nt_hits = by_name_team.get(f"{name}|{team}", [])
        name_hits = by_name.get(name, [])

        # Classify
        cause = "not_in_master_anywhere"
        detail = ""
        master_ids: Set[str] = set()
        years: Set[int] = set()

        if id_hits:
            cause = "id_exists_in_master_phase1_bug"
            master_ids = {h["player_id_raw"] or h["player_id"] for h in id_hits}
            years = {h["year"] for h in id_hits if h["year"]}
            detail = f"norm_id={norm} raw_ids={master_ids} years={sorted(years)}"
        elif nt_hits:
            cause = "name_team_match_id_empty_or_mismatch"
            master_ids = {h["player_id_raw"] or h["player_id"] or "(empty)" for h in nt_hits}
            years = {h["year"] for h in nt_hits if h["year"]}
            detail = f"master_ids={master_ids} years={sorted(years)} kinds={sorted({h['kind'] for h in nt_hits})}"
        elif name_hits:
            other_teams = sorted({h["team"] for h in name_hits if h["team"] != team})[:5]
            cause = "name_only_other_team_or_duplicate"
            master_ids = {h["player_id_raw"] or h["player_id"] or "(empty)" for h in name_hits[:20]}
            years = {h["year"] for h in name_hits if h["year"]}
            detail = f"roster_team={team} other_teams={other_teams} sample_ids={list(master_ids)[:3]}"
        else:
            if roster.get(pid_raw, {}).get("is_new_2026") == "1":
                cause = "likely_no_ichi_gun_new_2026"
            elif dy is None and (PROFILE_DIR / f"{pid_raw}.json").exists():
                p = json.loads((PROFILE_DIR / f"{pid_raw}.json").read_text(encoding="utf-8"))
                if p.get("fetch_status") == "fail":
                    cause = "npb_page_missing"
                else:
                    cause = "likely_no_ichi_gun_no_debut_parsed"
            elif dy and dy >= 2025:
                cause = "likely_no_ichi_gun_2025_draft"
            elif dy == 2024:
                cause = "likely_no_ichi_gun_2024_draft"
            elif dy and dy <= 2023:
                cause = "likely_no_ichi_gun_long_term_dev"
            else:
                cause = "likely_no_ichi_gun_unknown"
            detail = f"debut={dy} is_new_2026={is_new}"

        cause_counts[cause] += 1
        rows_out.append(
            {
                "npb_player_id": pid_raw,
                "name_ja": m["name_ja"],
                "team": m.get("team", ""),
                "position": m.get("position", ""),
                "is_new_2026": is_new,
                "debut_year": str(dy) if dy else "",
                "cause": cause,
                "detail": detail[:500],
            }
        )

    OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    with OUT_REPORT.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows_out[0].keys()))
        w.writeheader()
        w.writerows(rows_out)

    other = {k: v for k, v in cause_counts.items() if not k.startswith("likely_no_ichi")}
    likely = {k: v for k, v in cause_counts.items() if k.startswith("likely_no_ichi")}

    lines = [
        "=== Phase1 欠損 182人 原因調査 ===",
        "",
        "【一軍未出場以外（要対応・要確認）】",
    ]
    for k, v in sorted(other.items(), key=lambda x: -x[1]):
        lines.append(f"  {k}: {v}")
    lines.append(f"  小計: {sum(other.values())}")
    lines.append("")
    lines.append("【一軍未出場が主因と推定】")
    for k, v in sorted(likely.items(), key=lambda x: -x[1]):
        lines.append(f"  {k}: {v}")
    lines.append(f"  小計: {sum(likely.values())}")
    lines.append("")
    lines.append(f"詳細: {OUT_REPORT}")

    OUT_SUMMARY.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines), flush=True)


if __name__ == "__main__":
    main()
