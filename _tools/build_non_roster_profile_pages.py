#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
2026名簿外の選手向けに profile-only 個人ページ用 merged JSON を生成・更新する。

「個人ページの作成」= merged JSON の name_ja と profile（生年月日・プロ入り・経歴）を整えること。
生涯年俸・FA取得（推定）・通算成績ブロックは merged から除去する（UI の profile-only 表示用）。

既に player-1 / K.Yamamoto のようにページがある選手も、profile_npb を正として文言を上書き更新する。

Usage:
  python _tools/build_non_roster_profile_pages.py --dry-run
  python _tools/build_non_roster_profile_pages.py
  python _tools/build_non_roster_profile_pages.py --only-id 01005153
  python _tools/build_non_roster_profile_pages.py --limit 50
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]

TARGETS_PATH = ROOT / "_data" / "npb_rescrape" / "targets_profile_roman.json"
ROSTER_PATH = ROOT / "_data" / "npb_roster_2026.csv"
PROFILE_DIR = ROOT / "_data" / "derived" / "player_profile" / "profile_npb"
META_DIR = ROOT / "_data" / "derived" / "npb_player_meta"
MERGED_DIR = ROOT / "_data" / "derived" / "player_profile" / "merged"
REPORT_PATH = ROOT / "_reports" / "non_roster_profile_pages_build.csv"

PROFILE_KEYS = ("birth_date_raw", "pro_debut_raw", "career_raw")

# merged から除去するキー（生涯年俸・FA・通算成績）
STRIP_KEYS = (
    "salary_by_year",
    "career_total_salary_est_yen",
    "career_total_salary_display",
    "career_batting",
    "career_pitching",
    "faEstimate",
)


def clean(value: Any) -> str:
    return str(value or "").strip()


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def load_targets() -> list[dict[str, str]]:
    if not TARGETS_PATH.is_file():
        raise FileNotFoundError(f"missing targets: {TARGETS_PATH}")
    raw = json.loads(TARGETS_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError(f"invalid targets format: {TARGETS_PATH}")
    out: list[dict[str, str]] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        pid = clean(row.get("player_id") or row.get("npb_player_id"))
        if not pid:
            continue
        out.append(
            {
                "player_id": pid,
                "name_ja": clean(row.get("name_ja")),
            }
        )
    return out


def load_roster_ids() -> set[str]:
    if not ROSTER_PATH.is_file():
        raise FileNotFoundError(f"missing roster: {ROSTER_PATH}")
    ids: set[str] = set()
    with ROSTER_PATH.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            pid = clean(row.get("npb_player_id"))
            if pid:
                ids.add(pid)
    return ids


def read_profile_npb(pid: str) -> dict[str, Any] | None:
    for name in (f"npb_{pid}.json", f"{pid}.json"):
        data = load_json(PROFILE_DIR / name)
        if data:
            return data
    return None


def read_meta(pid: str) -> dict[str, Any] | None:
    for name in (f"{pid}.json", f"npb_{pid}.json"):
        data = load_json(META_DIR / name)
        if data:
            return data
    return None


def profile_block_from_sources(
    profile_npb: dict[str, Any] | None,
    existing: dict[str, Any] | None,
) -> dict[str, str]:
    src_npb = (profile_npb or {}).get("profile") or {}
    src_existing = (existing or {}).get("profile") or {}
    out: dict[str, str] = {}
    for key in PROFILE_KEYS:
        val = clean(src_npb.get(key)) or clean(src_existing.get(key))
        if val:
            out[key] = val
    return out


def has_profile_content(profile: dict[str, str]) -> bool:
    return any(clean(profile.get(k)) for k in PROFILE_KEYS)


def resolve_name_ja(
    target_name: str,
    profile_npb: dict[str, Any] | None,
    existing: dict[str, Any] | None,
    meta: dict[str, Any] | None,
) -> str:
    for candidate in (
        target_name,
        clean((profile_npb or {}).get("name_ja")),
        clean((existing or {}).get("name_ja")),
        clean((meta or {}).get("name_ja")),
    ):
        if candidate:
            return candidate
    return ""


def roman_short_from_meta(meta: dict[str, Any] | None) -> str:
    if not meta:
        return ""
    roman = meta.get("roman") or {}
    if isinstance(roman, dict):
        return clean(roman.get("name_en_short"))
    return ""


def build_profile_only_merged(
    pid: str,
    target_name: str,
    profile_npb: dict[str, Any] | None,
    existing: dict[str, Any] | None,
    meta: dict[str, Any] | None,
) -> dict[str, Any] | None:
    profile = profile_block_from_sources(profile_npb, existing)
    if not has_profile_content(profile):
        return None

    name_ja = resolve_name_ja(target_name, profile_npb, existing, meta)
    if not name_ja:
        return None

    prev_meta = (existing or {}).get("meta") or {}
    if not isinstance(prev_meta, dict):
        prev_meta = {}

    profile_source = "NPB_OFFICIAL" if profile_npb and profile_npb.get("profile") else clean(
        prev_meta.get("profile_source")
    ) or "existing"

    merged: dict[str, Any] = {
        "npb_player_id": pid,
        "name_ja": name_ja,
        "profile": profile,
        "meta": {
            **{k: v for k, v in prev_meta.items() if k not in {"merged_at", "page_kind"}},
            "merged_at": datetime.now(timezone.utc).isoformat(),
            "profile_source": profile_source,
            "page_kind": "profile_only_non_roster",
        },
    }

    roman_short = roman_short_from_meta(meta)
    if roman_short:
        merged["meta"]["name_en_short"] = roman_short

    return merged


def write_merged(path: Path, payload: dict[str, Any], dry_run: bool) -> None:
    if dry_run:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="2026名簿外選手の profile-only merged JSON を生成・更新",
    )
    parser.add_argument("--dry-run", action="store_true", help="書き込まず件数のみ表示")
    parser.add_argument("--only-id", type=str, default="", help="指定 NPB ID のみ処理")
    parser.add_argument("--limit", type=int, default=0, help="処理件数上限（0=無制限）")
    args = parser.parse_args()

    targets = load_targets()
    roster_ids = load_roster_ids()

    if args.only_id.strip():
        only = clean(args.only_id)
        targets = [t for t in targets if t["player_id"] == only]
        if not targets:
            print(f"ERROR: --only-id {only} は targets にありません", file=sys.stderr)
            return 1

    non_roster = [t for t in targets if t["player_id"] not in roster_ids]
    if args.limit > 0:
        non_roster = non_roster[: args.limit]

    created = 0
    updated = 0
    skipped_no_profile = 0
    report_rows: list[dict[str, str]] = []

    print("=== non-roster profile-only page build ===")
    print(f"targets total: {len(targets)}")
    print(f"roster 2026: {len(roster_ids)}")
    print(f"non-roster to process: {len(non_roster)}")
    print(f"dry_run: {args.dry_run}")
    print()

    for t in non_roster:
        pid = t["player_id"]
        out_path = MERGED_DIR / f"npb_{pid}.json"

        profile_npb = read_profile_npb(pid)
        existing = load_json(out_path)
        meta = read_meta(pid)

        merged = build_profile_only_merged(
            pid,
            t.get("name_ja", ""),
            profile_npb,
            existing,
            meta,
        )

        if not merged:
            skipped_no_profile += 1
            report_rows.append(
                {
                    "player_id": pid,
                    "name_ja": t.get("name_ja", ""),
                    "action": "skip_no_profile",
                    "path": str(out_path),
                    "roman_short": roman_short_from_meta(meta),
                }
            )
            continue

        existed = out_path.is_file()
        write_merged(out_path, merged, args.dry_run)

        if existed:
            updated += 1
            action = "updated"
        else:
            created += 1
            action = "created"

        report_rows.append(
            {
                "player_id": pid,
                "name_ja": merged["name_ja"],
                "action": action,
                "path": str(out_path),
                "roman_short": clean(merged.get("meta", {}).get("name_en_short")),
                "birth_date_raw": clean(merged.get("profile", {}).get("birth_date_raw")),
                "pro_debut_raw": clean(merged.get("profile", {}).get("pro_debut_raw")),
            }
        )

    if not args.dry_run:
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        fieldnames = [
            "player_id",
            "name_ja",
            "action",
            "roman_short",
            "birth_date_raw",
            "pro_debut_raw",
            "path",
        ]
        with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(report_rows)

    print(f"created: {created}")
    print(f"updated: {updated}")
    print(f"skipped (no profile data): {skipped_no_profile}")
    if not args.dry_run:
        print(f"report: {REPORT_PATH}")
    print()
    print("ページ URL 例: /players/{npb_player_id}")
    print("ローマ字表示例: /players/{npb_player_id}?roman=K.Yamamoto")
    print("（meta.name_en_short があれば ?roman= に使えます）")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
