#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 3: 年俸取得・生涯合算（推定）

- ① グラゼニ https://www.gurazeni.com/player/{id}（年度別年俸表）
- ② ベースボールinfo（① 失敗時・マップあり時）
- 推奨: 先に build_gurazeni_team_map.py でチーム別ページから ID 取得
- 既に player_salary/{npb_id}.json がある選手はスキップ（--force 除く）

Usage:
  python scripts/build_gurazeni_team_map.py --write-salary-map
  python scripts/fetch_player_salary.py --team-map _data/player_profile/gurazeni_team_2026_map.json
  python scripts/fetch_player_salary.py --only-failed --team-map ... --write-map
  python scripts/fetch_player_salary.py --only-npb-id 01705138
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("pip install requests beautifulsoup4 lxml")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from gurazeni_team import (  # noqa: E402
    build_team_lookup,
    resolve_gurazeni_from_team,
)

DEFAULT_TARGETS = ROOT / "_data" / "player_profile" / "_targets_2026.json"
DEFAULT_TEAM_MAP = ROOT / "_data" / "player_profile" / "gurazeni_team_2026_map.json"
PROFILE_DIR = ROOT / "_data" / "derived" / "player_profile" / "profile_npb"
OUT_DIR = ROOT / "_data" / "derived" / "player_salary"
MAP_CSV = ROOT / "_data" / "player_profile" / "salary_site_map.csv"
OUT_REPORT = ROOT / "_reports" / "player_profile_phase3_salary.csv"
CACHE_GZ = ROOT / "_data" / "cache" / "gurazeni_player_page"
CACHE_BI = ROOT / "_data" / "cache" / "baseballinfo_player_page"

GURAZENI_PLAYER = "https://www.gurazeni.com/player/{id}"
GURAZENI_SEARCH = "https://www.gurazeni.com/search?search={q}"
BASEBALLINFO_PLAYER = "https://baseballinfo.net/player/{slug}"


def log(msg: str) -> None:
    print(msg, flush=True)


def fetch_html(url: str, retry: int = 3) -> Optional[str]:
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    for attempt in range(retry):
        try:
            if attempt > 0:
                time.sleep(2**attempt)
            r = requests.get(url, headers=headers, timeout=30)
            r.raise_for_status()
            r.encoding = r.apparent_encoding or "utf-8"
            return r.text
        except Exception as e:
            log(f"  WARN GET ({attempt + 1}/{retry}): {url} - {e}")
    return None


def normalize_name_key(name: str) -> str:
    from gurazeni_team import normalize_name_key as gz_norm

    return gz_norm(name)


def parse_yen_ja(text: str) -> Optional[int]:
    """例: 1億5000万円 -> 150000000, 800万円 -> 8000000"""
    if not text:
        return None
    s = text.strip().replace(",", "").replace("，", "")
    if "円" not in s and not re.search(r"[億万]", s):
        return None
    oku = 0
    rest = s
    if "億" in rest:
        a, rest = rest.split("億", 1)
        m = re.search(r"(\d+)", a)
        if m:
            oku = int(m.group(1))
    if "万" in rest:
        b = rest.split("万", 1)[0]
        m = re.search(r"(\d+)", b)
        if m:
            return oku * 100_000_000 + int(m.group(1)) * 10_000
    if oku:
        return oku * 100_000_000
    m = re.search(r"(\d+)", rest)
    return int(m.group(1)) if m else None


def format_yen_display(yen: int) -> str:
    if yen <= 0:
        return "0円"
    oku = yen // 100_000_000
    man = (yen % 100_000_000) // 10_000
    if oku and man:
        return f"{oku}億{man}万円"
    if oku:
        return f"{oku}億円"
    return f"{man}万円"


def parse_year_cell(cell: str) -> Optional[int]:
    m = re.search(r"(20\d{2})", cell or "")
    return int(m.group(1)) if m else None


def parse_salary_table_rows(soup: BeautifulSoup) -> Dict[int, int]:
    """年 -> 円。年俸表らしい table を走査。"""
    out: Dict[int, int] = {}
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        header_text = rows[0].get_text()
        if "年" not in header_text or ("年俸" not in header_text and "金額" not in header_text):
            continue
        for tr in rows[1:]:
            cells = [c.get_text(strip=True) for c in tr.find_all(["td", "th"])]
            if len(cells) < 2:
                continue
            year = parse_year_cell(cells[0])
            if not year:
                continue
            yen = None
            for cell in cells[1:]:
                yen = parse_yen_ja(cell)
                if yen is not None:
                    break
            if yen is not None:
                out[year] = yen
    return out


def parse_gurazeni_salary(html: str) -> Dict[int, int]:
    soup = BeautifulSoup(html, "lxml")
    # 見出し「年俸」付近の table を優先
    for h in soup.find_all(["h1", "h2", "h3", "h4"]):
        if "年俸" in (h.get_text() or ""):
            nxt = h.find_next("table")
            if nxt:
                partial = parse_salary_table_rows(
                    BeautifulSoup(str(nxt), "lxml")
                )
                if partial:
                    return partial
    return parse_salary_table_rows(soup)


def parse_baseballinfo_salary(html: str) -> Dict[int, int]:
    soup = BeautifulSoup(html, "lxml")
    for h in soup.find_all(["h2", "h3"]):
        if "年俸" in (h.get_text() or ""):
            nxt = h.find_next("table")
            if nxt:
                partial = parse_salary_table_rows(
                    BeautifulSoup(str(nxt), "lxml")
                )
                if partial:
                    return partial
    return parse_salary_table_rows(soup)


def debut_year_from_profile(npb_id: str) -> Optional[int]:
    p = PROFILE_DIR / f"{npb_id}.json"
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        raw = (data.get("profile") or {}).get("pro_debut_raw") or data.get("pro_debut_raw") or ""
        m = re.search(r"(20\d{2}|19\d{2})", raw)
        return int(m.group(1)) if m else None
    except json.JSONDecodeError:
        return None


def load_targets(path: Path) -> List[Dict[str, str]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [
        {
            "npb_player_id": (t.get("npb_player_id") or "").strip(),
            "name_ja": (t.get("name_ja") or "").strip(),
            "team": (t.get("team") or "").strip(),
        }
        for t in raw
        if (t.get("npb_player_id") or "").strip()
    ]


def load_map(path: Path) -> Dict[str, Dict[str, str]]:
    if not path.is_file():
        return {}
    out: Dict[str, Dict[str, str]] = {}
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            pid = (row.get("npb_player_id") or "").strip()
            if pid:
                out[pid] = row
    return out


def save_map_row(path: Path, row: Dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "npb_player_id",
        "name_ja",
        "gurazeni_id",
        "baseballinfo_slug",
        "match_method",
        "confidence",
    ]
    existing = load_map(path)
    existing[row["npb_player_id"]] = row
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for pid in sorted(existing.keys()):
            w.writerow(existing[pid])


def search_gurazeni_id(name_ja: str, loose: bool = False) -> Optional[str]:
    q = urllib.parse.quote(name_ja.replace(" ", ""))
    html = fetch_html(GURAZENI_SEARCH.format(q=q))
    if not html:
        return None
    soup = BeautifulSoup(html, "lxml")
    key = normalize_name_key(name_ja)
    # 日本人名（漢字/ひらがな中心）は誤マッチが致命的なので「部分一致」を禁止する。
    # 外国人名（カタカナ/英字/記号を含む）だけ部分一致・ゆるい一致を許可する。
    allow_loose = bool(re.search(r"[ァ-ヶA-Za-z．\.]", key))
    for a in soup.find_all("a", href=re.compile(r"/player/\d+")):
        href = a.get("href") or ""
        m = re.search(r"/player/(\d+)", href)
        if not m:
            continue
        link_text = normalize_name_key(a.get_text())
        if key == link_text:
            return m.group(1)
        if allow_loose:
            if key and (key in link_text or link_text in key):
                return m.group(1)
            if loose and len(key) >= 2 and key[:2] in link_text:
                return m.group(1)
    return None


def load_team_lookup(path: Path) -> Dict[str, Dict[str, Any]]:
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    rosters = data.get("rosters_by_team") or {}
    return build_team_lookup(rosters)


def fetch_gurazeni_salary(
    gurazeni_id: str, cache_dir: Path, force: bool
) -> Tuple[Dict[int, int], str]:
    cache = cache_dir / f"{gurazeni_id}.html"
    url = GURAZENI_PLAYER.format(id=gurazeni_id)
    html = None
    if cache.is_file() and not force:
        html = cache.read_text(encoding="utf-8", errors="replace")
    else:
        html = fetch_html(url)
        if html:
            cache_dir.mkdir(parents=True, exist_ok=True)
            cache.write_text(html, encoding="utf-8")
    if not html:
        return {}, url
    return parse_gurazeni_salary(html), url


def fetch_baseballinfo_salary(
    slug: str, cache_dir: Path, force: bool
) -> Tuple[Dict[int, int], str]:
    cache = cache_dir / f"{slug}.html"
    url = BASEBALLINFO_PLAYER.format(slug=slug)
    html = None
    if cache.is_file() and not force:
        html = cache.read_text(encoding="utf-8", errors="replace")
    else:
        html = fetch_html(url)
        if html:
            cache_dir.mkdir(parents=True, exist_ok=True)
            cache.write_text(html, encoding="utf-8")
    if not html:
        return {}, url
    return parse_baseballinfo_salary(html), url


def salary_complete(data: Dict[str, Any]) -> bool:
    return bool(data.get("salary_by_year")) and data.get("career_total_salary_est_yen") is not None


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 3: 年俸（グラゼニ / ベースボールinfo）")
    parser.add_argument("--targets", type=Path, default=DEFAULT_TARGETS)
    parser.add_argument("--map", type=Path, default=MAP_CSV)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    parser.add_argument("--report", type=Path, default=OUT_REPORT)
    parser.add_argument("--delay", type=float, default=1.5)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--only-npb-id", type=str, default="")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--no-search", action="store_true", help="グラゼニ検索を使わない（マップのみ）")
    parser.add_argument("--loose-search", action="store_true", help="検索で姓2文字一致を許可（誤マッチ注意）")
    parser.add_argument(
        "--team-map",
        type=Path,
        default=None,
        help=f"build_gurazeni_team_map.py の JSON（既定: {DEFAULT_TEAM_MAP.name} があれば使用）",
    )
    parser.add_argument(
        "--only-failed",
        action="store_true",
        help="salary_by_year が空の選手だけ再取得",
    )
    parser.add_argument("--write-map", action="store_true", help="解決した ID を map CSV に追記")
    parser.add_argument("--max-year", type=int, default=2026)
    args = parser.parse_args()

    team_map_path = args.team_map
    if team_map_path is None and DEFAULT_TEAM_MAP.is_file():
        team_map_path = DEFAULT_TEAM_MAP
    team_lookup = load_team_lookup(team_map_path) if team_map_path else {}

    if not args.targets.is_file():
        log(f"ERROR: {args.targets} がありません。先に Phase 1 を実行してください。")
        return 1

    targets = load_targets(args.targets)
    if args.only_npb_id.strip():
        oid = args.only_npb_id.strip()
        targets = [t for t in targets if t["npb_player_id"] == oid]
    if args.limit > 0:
        targets = targets[: args.limit]

    site_map = load_map(args.map)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    log("=== Phase 3: 年俸（推定）===")
    log(f"対象: {len(targets)} 人 / delay={args.delay}s")
    if team_lookup:
        log(f"チームマップ: {team_map_path} ({len(team_lookup)} keys)")
    if args.only_failed:
        log("モード: --only-failed（未取得のみ）")

    to_fetch: List[Dict[str, str]] = []
    skipped = 0
    for t in targets:
        pid = t["npb_player_id"]
        out_path = args.out_dir / f"{pid}.json"
        if out_path.is_file() and not args.force:
            try:
                existing = json.loads(out_path.read_text(encoding="utf-8"))
                if args.only_failed:
                    if salary_complete(existing):
                        skipped += 1
                        continue
                elif salary_complete(existing):
                    skipped += 1
                    continue
            except json.JSONDecodeError:
                pass
        to_fetch.append(t)

    log(f"スキップ（取得済）: {skipped} / 取得予定: {len(to_fetch)}")
    if not to_fetch:
        log("取得対象なし。終了。")
        return 0

    est = len(to_fetch) * args.delay * 1.5  # 検索+本取得で最大2回程度
    log(f"目安時間: 約 {est / 60:.1f} 分")
    log("")

    report_rows: List[Dict[str, str]] = []
    ok = 0
    fail = 0
    t0 = time.time()
    n = len(to_fetch)

    for i, t in enumerate(to_fetch, 1):
        pid = t["npb_player_id"]
        name = t["name_ja"]
        debut = debut_year_from_profile(pid)

        salary_by_year: Dict[int, int] = {}
        source = ""
        source_url = ""
        gurazeni_id = (site_map.get(pid) or {}).get("gurazeni_id", "").strip()
        bi_slug = (site_map.get(pid) or {}).get("baseballinfo_slug", "").strip()
        match_method = (site_map.get(pid) or {}).get("match_method", "")

        network_calls = 0

        if not gurazeni_id and team_lookup:
            hit = resolve_gurazeni_from_team(name, t.get("team") or "", team_lookup)
            if hit:
                gurazeni_id = hit["gurazeni_id"]
                match_method = "gurazeni_team_2026"
                if args.write_map:
                    save_map_row(
                        args.map,
                        {
                            "npb_player_id": pid,
                            "name_ja": name,
                            "gurazeni_id": gurazeni_id,
                            "baseballinfo_slug": bi_slug,
                            "match_method": match_method,
                            "confidence": "high",
                        },
                    )

        if not gurazeni_id and not args.no_search:
            found = search_gurazeni_id(name, loose=args.loose_search)
            if found:
                gurazeni_id = found
                match_method = "gurazeni_search"
                network_calls += 1
                if args.write_map:
                    save_map_row(
                        args.map,
                        {
                            "npb_player_id": pid,
                            "name_ja": name,
                            "gurazeni_id": gurazeni_id,
                            "baseballinfo_slug": bi_slug,
                            "match_method": match_method,
                            "confidence": "medium" if args.loose_search else "high",
                        },
                    )

        if gurazeni_id:
            salary_by_year, source_url = fetch_gurazeni_salary(
                gurazeni_id, CACHE_GZ, args.force
            )
            if salary_by_year:
                source = "gurazeni"
            if not (CACHE_GZ / f"{gurazeni_id}.html").exists() or args.force:
                network_calls += 1

        if not salary_by_year and bi_slug:
            salary_by_year, source_url = fetch_baseballinfo_salary(
                bi_slug, CACHE_BI, args.force
            )
            if salary_by_year:
                source = "baseballinfo"
            network_calls += 1

        # プロ入り以前を除外
        if debut:
            salary_by_year = {y: v for y, v in salary_by_year.items() if y >= debut}
        salary_by_year = {y: v for y, v in salary_by_year.items() if y <= args.max_year}

        years_missing = []
        total = 0
        if salary_by_year:
            total = sum(salary_by_year.values())

        status = "ok" if salary_by_year else "fail"
        if status == "ok":
            ok += 1
        else:
            fail += 1

        payload = {
            "npb_player_id": pid,
            "name_ja": name,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "source_primary": source or None,
            "source_url": source_url,
            "salary_by_year": {str(y): v for y, v in sorted(salary_by_year.items())},
            "career_total_salary_est_yen": total if total else None,
            "career_total_salary_display": (
                f"{format_yen_display(total)}（推定・出典: {source}）" if total and source else None
            ),
            "years_missing": years_missing,
            "debut_year_filter": debut,
            "fetch_status": status,
        }
        (args.out_dir / f"{pid}.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        report_rows.append(
            {
                "npb_player_id": pid,
                "name_ja": name,
                "status": status,
                "source": source,
                "gurazeni_id": gurazeni_id,
                "match_method": match_method,
                "years_count": str(len(salary_by_year)),
                "career_total": str(total) if total else "",
            }
        )

        if i == 1 or i == n or i % 10 == 0:
            elapsed = time.time() - t0
            rate = i / elapsed if elapsed > 0 else 0
            remain = (n - i) / rate if rate > 0 else 0
            log(
                f"  [{i}/{n}] ({100 * i / n:5.1f}%) {name} {status} "
                f"years={len(salary_by_year)} src={source or '-'} | ok={ok} fail={fail} | 残り約 {remain:.0f}s"
            )

        if network_calls > 0 and i < n:
            time.sleep(args.delay)

    args.report.parent.mkdir(parents=True, exist_ok=True)
    report_mode = "a" if args.only_failed and args.report.is_file() else "w"
    with args.report.open(report_mode, encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "npb_player_id",
                "name_ja",
                "status",
                "source",
                "gurazeni_id",
                "match_method",
                "years_count",
                "career_total",
            ],
        )
        if report_mode == "w":
            w.writeheader()
        w.writerows(report_rows)

    elapsed = time.time() - t0
    log("")
    log("=== Phase 3 完了 ===")
    log(f"  出力: {args.out_dir}")
    log(f"  レポート: {args.report}")
    log(f"  マップ: {args.map}")
    log(f"  取得: ok={ok} fail={fail} skip={skipped}")
    log(f"  経過: {elapsed:.1f}s ({elapsed / 60:.1f} 分)")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
