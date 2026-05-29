#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
salary_site_map.csv の gurazeni_id が別人ページを指していないか検査する。

- gurazeni_id がある行について、キャッシュHTML `_data/cache/gurazeni_player_page/{id}.html` の <title> を読む
- title から選手名っぽい部分を抽出し、正規化して名簿名と比較
"""

from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from gurazeni_team import normalize_name_key, name_lookup_keys


ROOT = Path(__file__).resolve().parent.parent
MAP_CSV = ROOT / "_data" / "player_profile" / "salary_site_map.csv"
CACHE_DIR = ROOT / "_data" / "cache" / "gurazeni_player_page"
OUT_REPORT = ROOT / "_reports" / "salary_site_map_gurazeni_title_mismatch.csv"


def read_text_any(path: Path) -> str:
    for enc in ("utf-8", "utf-8-sig", "cp932"):
        try:
            return path.read_text(encoding=enc)
        except UnicodeDecodeError:
            continue
    return path.read_text(encoding="utf-8", errors="replace")


def extract_title(html: str) -> str:
    m = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
    if not m:
        return ""
    t = re.sub(r"\s+", " ", m.group(1)).strip()
    return t


def title_to_name_hint(title: str) -> str:
    """
    例:
    - "由規(佐藤由規) 楽天年俸・背番号推移..." -> "由規(佐藤由規)"
    - "東浜 巨 ソフトバンク年俸・..." -> "東浜 巨"
    """
    if not title:
        return ""
    # " 年俸" より前を優先
    t = title.split("年俸", 1)[0].strip()
    parts = [p for p in t.split(" ") if p]
    if not parts:
        return ""
    # 末尾が球団名であるケースが多いので、最後の1トークンを落として残りを名前候補にする
    # （球団名が含まれないタイトルもあるため、最低1トークンは残す）
    if len(parts) >= 2:
        candidate = " ".join(parts[:-1]).strip()
        if candidate:
            return candidate
    return parts[0].strip()


def is_match(expected_name_ja: str, title_hint: str) -> bool:
    """
    - 日本人名: 正規化した完全一致
    - 外国人名: 略称（Ｌ．苗字）とフルネーム（ルーク・苗字）などの揺れを許可
    """
    exp_raw = (expected_name_ja or "").strip()
    hint_raw = title_to_name_hint(title_hint)
    if not exp_raw or not hint_raw:
        return False

    exp_keys = set(name_lookup_keys(exp_raw))
    hint_keys = set(name_lookup_keys(hint_raw))
    if exp_keys & hint_keys:
        return True

    # hint に "(別名)" が入ることがあるので、括弧部分も key に追加して再評価
    aliases: List[str] = []
    m = re.search(r"\((.*?)\)", hint_raw)
    if m:
        aliases.append(m.group(1))
    aliases.extend(re.findall(r"[（](.*?)[）]", hint_raw))
    for a in aliases:
        if not a:
            continue
        if exp_keys & set(name_lookup_keys(a)):
            return True

    # 最後の保険（完全一致）
    return normalize_name_key(exp_raw) == normalize_name_key(hint_raw)


def main() -> int:
    if not MAP_CSV.is_file():
        print(f"ERROR: {MAP_CSV} not found")
        return 1
    rows: List[Dict[str, str]] = []
    with MAP_CSV.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    report: List[Dict[str, str]] = []
    checked = 0
    missing_cache = 0
    mismatch = 0

    for r in rows:
        pid = (r.get("npb_player_id") or "").strip()
        name = (r.get("name_ja") or "").strip()
        gid = (r.get("gurazeni_id") or "").strip()
        if not pid or not name or not gid:
            continue
        checked += 1
        cache = CACHE_DIR / f"{gid}.html"
        if not cache.is_file():
            missing_cache += 1
            report.append(
                {
                    "npb_player_id": pid,
                    "name_ja": name,
                    "gurazeni_id": gid,
                    "cache": "missing",
                    "title": "",
                    "title_name_hint": "",
                    "normalized_expected": normalize_name_key(name),
                    "normalized_hint": "",
                    "status": "cache_missing",
                }
            )
            continue
        html = read_text_any(cache)
        title = extract_title(html)
        hint = title_to_name_hint(title)
        ok = is_match(name, title)
        if not ok:
            mismatch += 1
            report.append(
                {
                    "npb_player_id": pid,
                    "name_ja": name,
                    "gurazeni_id": gid,
                    "cache": "ok",
                    "title": title,
                    "title_name_hint": hint,
                    "normalized_expected": normalize_name_key(name),
                    "normalized_hint": normalize_name_key(hint),
                    "status": "mismatch",
                }
            )

    OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    with OUT_REPORT.open("w", encoding="utf-8-sig", newline="") as f:
        fieldnames = [
            "npb_player_id",
            "name_ja",
            "gurazeni_id",
            "cache",
            "title",
            "title_name_hint",
            "normalized_expected",
            "normalized_hint",
            "status",
        ]
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for row in report:
            w.writerow(row)

    print("=== salary_site_map gurazeni title check ===")
    print(f"checked: {checked}")
    print(f"cache_missing: {missing_cache}")
    print(f"mismatch: {mismatch}")
    print(f"report: {OUT_REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

