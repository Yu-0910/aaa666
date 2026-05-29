#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 2: プロフィール（NPB・未取得のみ）

- 生年月日・ドラフト（プロ入り）・経歴を NPB 個人ページから取得
- 通算成績は Phase 1 のマスタを正とし、HTML の成績表は使わない
- 既に profile_npb/{id}.json がある選手はスキップ（--force で再取得）

Usage:
  python scripts/fetch_npb_player_profile.py
  python scripts/fetch_npb_player_profile.py --limit 20 --delay 1.0
  python scripts/fetch_npb_player_profile.py --force
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import time
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
DEFAULT_TARGETS = ROOT / "_data" / "player_profile" / "_targets_2026.json"
DEFAULT_ROSTER = ROOT / "_data" / "npb_roster_2026.csv"
OUT_DIR = ROOT / "_data" / "derived" / "player_profile" / "profile_npb"
CACHE_DIR = ROOT / "_data" / "cache" / "npb_player_page"
OUT_REPORT = ROOT / "_reports" / "player_profile_phase2_fetch.csv"
OVERRIDE_CSV = ROOT / "_data" / "player_profile" / "npb_bis_id_override.csv"

NPB_PLAYER_URL = "https://npb.jp/bis/players/{player_id}.html"


def npb_id_candidates(raw_id: str) -> List[str]:
    """名簿 ID の表記ゆれ（先頭ゼロ等）に対応する URL 用候補（重複除去・順序固定）"""
    s = (raw_id or "").strip()
    if not s:
        return []
    out: List[str] = []
    for cand in (s, s.lstrip("0") or "0", s.zfill(8), s.zfill(9)):
        if cand and cand not in out:
            out.append(cand)
    return out


def load_override_map(path: Path) -> Dict[str, str]:
    """
    名簿の npb_player_id と、BIS の実ページIDがずれる場合の上書き。
    CSV: npb_player_id,bis_player_id
    """
    if not path.is_file():
        return {}
    import csv

    out: Dict[str, str] = {}
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            a = (row.get("npb_player_id") or "").strip()
            b = (row.get("bis_player_id") or "").strip()
            if a and b:
                out[a] = b
    return out


def fetch_player_html(player_id: str, cache_dir: Path, force: bool) -> Tuple[Optional[str], str, bool]:
    """
    Returns (html, url_used, fetched_via_network).
    キャッシュ → 複数 ID 候補の GET を試す。
    """
    for cand in npb_id_candidates(player_id):
        cache_path = cache_dir / f"{cand}.html"
        if cache_path.is_file() and not force:
            return cache_path.read_text(encoding="utf-8", errors="replace"), (
                NPB_PLAYER_URL.format(player_id=cand)
            ), False

    for cand in npb_id_candidates(player_id):
        url = NPB_PLAYER_URL.format(player_id=cand)
        html = fetch_html(url)
        if html:
            (cache_dir / f"{cand}.html").write_text(html, encoding="utf-8")
            return html, url, True
    return None, NPB_PLAYER_URL.format(player_id=player_id), False

PROFILE_KEYS = ("birth_date_raw", "pro_debut_raw", "career_raw")
LABEL_MAP = {
    "birth_date_raw": ("生年月日",),
    "pro_debut_raw": ("ドラフト", "入団"),
    "career_raw": ("経歴",),
}


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


def parse_profile_from_html(html: str) -> Dict[str, str]:
    soup = BeautifulSoup(html, "lxml")
    profile = {k: "" for k in PROFILE_KEYS}

    for tr in soup.find_all("tr"):
        th = tr.find("th")
        td = tr.find("td")
        if not th or not td:
            continue
        label = re.sub(r"\s+", "", (th.get_text() or ""))
        value = (td.get_text() or "").strip()
        if not value:
            continue
        for key, aliases in LABEL_MAP.items():
            if profile[key]:
                continue
            if any(alias in label for alias in aliases):
                profile[key] = value

    for dl in soup.find_all("dl"):
        dts = dl.find_all("dt")
        dds = dl.find_all("dd")
        for dt, dd in zip(dts, dds):
            label = re.sub(r"\s+", "", (dt.get_text() or ""))
            value = (dd.get_text() or "").strip()
            if not value:
                continue
            for key, aliases in LABEL_MAP.items():
                if profile[key]:
                    continue
                if any(alias in label for alias in aliases):
                    profile[key] = value

    return profile


def profile_complete(data: Dict[str, Any]) -> bool:
    p = data.get("profile") or data
    return all((p.get(k) or "").strip() for k in PROFILE_KEYS)


def load_targets(path: Path) -> List[Dict[str, str]]:
    if path.suffix == ".json" and path.is_file():
        raw = json.loads(path.read_text(encoding="utf-8"))
        return [
            {
                "npb_player_id": (t.get("npb_player_id") or "").strip(),
                "name_ja": (t.get("name_ja") or "").strip(),
                "npb_url": (t.get("npb_url") or "").strip(),
            }
            for t in raw
            if (t.get("npb_player_id") or "").strip()
        ]
    import csv

    rows = []
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            pid = (row.get("npb_player_id") or "").strip()
            if pid:
                rows.append(
                    {
                        "npb_player_id": pid,
                        "name_ja": (row.get("name_ja") or "").strip(),
                        "npb_url": f"https://npb.jp/bis/players/{pid}.html",
                    }
                )
    return rows


def load_existing_profile(path: Path) -> Optional[Dict[str, Any]]:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 2: NPB プロフィール（差分取得）")
    parser.add_argument("--targets", type=Path, default=DEFAULT_TARGETS)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    parser.add_argument("--cache-dir", type=Path, default=CACHE_DIR)
    parser.add_argument("--report", type=Path, default=OUT_REPORT)
    parser.add_argument("--delay", type=float, default=1.0, help="NPB リクエスト間隔（秒）")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--only-npb-id", type=str, default="", help="指定 ID のみ取得（デバッグ）")
    parser.add_argument("--force", action="store_true", help="既存 profile も再取得")
    args = parser.parse_args()
    override = load_override_map(OVERRIDE_CSV)

    if not args.targets.is_file():
        log(f"ERROR: targets がありません: {args.targets}")
        log("  先に npm run player-profile:phase1 を実行してください")
        return 1

    targets = load_targets(args.targets)
    if args.only_npb_id.strip():
        oid = args.only_npb_id.strip()
        targets = [t for t in targets if t["npb_player_id"] == oid]
    if args.limit > 0:
        targets = targets[: args.limit]

    args.out_dir.mkdir(parents=True, exist_ok=True)
    args.cache_dir.mkdir(parents=True, exist_ok=True)

    log("=== Phase 2: プロフィール（NPB・未取得のみ）===")
    log(f"対象: {len(targets)} 人 / delay={args.delay}s / force={args.force}")

    to_fetch: List[Dict[str, str]] = []
    skipped = 0
    for t in targets:
        pid = t["npb_player_id"]
        out_path = args.out_dir / f"{pid}.json"
        existing = None if args.force else load_existing_profile(out_path)
        if existing and profile_complete(existing):
            skipped += 1
            continue
        to_fetch.append(t)

    log(f"スキップ（取得済）: {skipped} / 取得予定: {len(to_fetch)}")
    if not to_fetch:
        log("取得対象なし。終了。")
        return 0

    est_sec = len(to_fetch) * args.delay
    log(f"目安時間: 約 {est_sec / 60:.1f} 分（{est_sec:.0f} 秒 + 通信）")
    log("")

    report_rows: List[Dict[str, str]] = []
    ok = 0
    fail = 0
    t0 = time.time()
    n = len(to_fetch)

    for i, t in enumerate(to_fetch, 1):
        pid = t["npb_player_id"]
        name = t["name_ja"]

        bis_id = override.get(pid, pid)
        html, url, fetched_network = fetch_player_html(bis_id, args.cache_dir, args.force)

        status = "fail"
        profile: Dict[str, str] = {k: "" for k in PROFILE_KEYS}
        if html:
            profile = parse_profile_from_html(html)
            missing = [k for k in PROFILE_KEYS if not profile.get(k)]
            if not missing:
                status = "ok"
                ok += 1
            elif any(profile.values()):
                status = "partial"
                ok += 1
            else:
                fail += 1
        else:
            fail += 1

        payload = {
            "npb_player_id": pid,
            "name_ja": name,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "source": "NPB_OFFICIAL",
            "npb_url": url,
            "profile": profile,
            "fetch_status": status,
            "fetched_via_network": fetched_network,
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
                "birth_date_raw": profile.get("birth_date_raw", ""),
                "pro_debut_raw": profile.get("pro_debut_raw", ""),
                "career_raw": profile.get("career_raw", ""),
                "network": "1" if fetched_network else "0",
            }
        )

        if i == 1 or i == n or i % 10 == 0:
            elapsed = time.time() - t0
            rate = i / elapsed if elapsed > 0 else 0
            remain = (n - i) / rate if rate > 0 else 0
            log(
                f"  [{i}/{n}] ({100 * i / n:5.1f}%) {name} "
                f"{status} | ok={ok} fail={fail} | 残り約 {remain:.0f}s"
            )

        if fetched_network and i < n:
            time.sleep(args.delay)

    args.report.parent.mkdir(parents=True, exist_ok=True)
    import csv

    with args.report.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "npb_player_id",
                "name_ja",
                "status",
                "birth_date_raw",
                "pro_debut_raw",
                "career_raw",
                "network",
            ],
        )
        w.writeheader()
        w.writerows(report_rows)

    elapsed = time.time() - t0
    log("")
    log("=== Phase 2 完了 ===")
    log(f"  出力: {args.out_dir}")
    log(f"  レポート: {args.report}")
    log(f"  取得: ok/partial={ok} fail={fail} skip={skipped}")
    log(f"  経過: {elapsed:.1f}s")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
