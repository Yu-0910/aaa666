#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 1/2: NPB 統合スクレイパ — 1 GET で投手・プロフィール・ローマ字

Usage:
  python scripts/scrape_npb_player_unified.py --samples _data/npb_rescrape/phase0_samples.json --years 1950,1984 --staging --validate
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

try:
    import requests
except ImportError:
    print("pip install requests beautifulsoup4 lxml")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from lib.npb_player_unified import (  # noqa: E402
    NPB_PLAYER_URL,
    PROFILE_KEYS,
    RomanSkipIndex,
    append_staging_csv,
    load_samples,
    npb_id_candidates,
    parse_unified,
    utc_now_iso,
)

OVERRIDE_CSV = ROOT / "_data" / "player_profile" / "npb_bis_id_override.csv"
DEFAULT_SAMPLES = ROOT / "_data" / "npb_rescrape" / "phase0_samples.json"
DEFAULT_CACHE = ROOT / "_data" / "cache" / "npb_player_page"
DEFAULT_META = ROOT / "_data" / "derived" / "npb_player_meta"
DEFAULT_STAGING = ROOT / "_data" / "master_csv__rescrape_staging"
DEFAULT_REPORT = ROOT / "_reports" / "npb_rescrape_phase2_pilot.csv"


def log(msg: str) -> None:
    print(msg, flush=True)


def load_override_map(path: Path) -> Dict[str, str]:
    if not path.is_file():
        return {}
    out: Dict[str, str] = {}
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            a = (row.get("npb_player_id") or "").strip()
            b = (row.get("bis_player_id") or "").strip()
            if a and b:
                out[a] = b
    return out


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


def fetch_player_html(
    player_id: str, cache_dir: Path, force: bool
) -> Tuple[Optional[str], str, bool]:
    for cand in npb_id_candidates(player_id):
        cache_path = cache_dir / f"{cand}.html"
        if cache_path.is_file() and not force:
            return cache_path.read_text(encoding="utf-8", errors="replace"), NPB_PLAYER_URL.format(
                player_id=cand
            ), False

    for cand in npb_id_candidates(player_id):
        url = NPB_PLAYER_URL.format(player_id=cand)
        html = fetch_html(url)
        if html:
            cache_dir.mkdir(parents=True, exist_ok=True)
            (cache_dir / f"{cand}.html").write_text(html, encoding="utf-8")
            return html, url, True
    return None, NPB_PLAYER_URL.format(player_id=player_id), False


def parse_years_arg(s: str) -> Set[int]:
    out: Set[int] = set()
    for part in (s or "").split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            out.update(range(int(a), int(b) + 1))
        else:
            out.add(int(part))
    return out


def build_player_jobs(samples: List[Dict[str, Any]], years_global: Set[int]) -> Dict[str, Dict[str, Any]]:
    jobs: Dict[str, Dict[str, Any]] = {}
    for p in samples:
        pid = (p.get("player_id") or "").strip()
        if not pid:
            continue
        pyears = set(p.get("pitching_years") or [])
        years = set(pyears) if pyears else set(years_global)
        if pid not in jobs:
            jobs[pid] = {
                "player_id": pid,
                "name_ja": p.get("name_ja") or "",
                "years": years,
                "league": p.get("league") or "",
                "expect": p.get("expect") or {},
                "tests": p.get("tests") or [],
                "baseline": p.get("baseline") or {},
            }
        else:
            jobs[pid]["years"] |= years
            jobs[pid]["expect"].update(p.get("expect") or {})
            jobs[pid]["tests"] = list(set(jobs[pid]["tests"]) | set(p.get("tests") or []))
    return jobs


def validate_pilot(
    jobs: Dict[str, Dict[str, Any]],
    meta_by_id: Dict[str, Dict[str, Any]],
    network_gets: int,
) -> Tuple[bool, List[str]]:
    errors: List[str] = []
    unique_ids = len(jobs)
    if network_gets > unique_ids:
        errors.append(f"GET 回数超過: {network_gets} > {unique_ids}")

    for pid, job in jobs.items():
        meta = meta_by_id.get(pid)
        if not meta:
            errors.append(f"{pid}: メタ JSON なし")
            continue
        exp = job.get("expect") or {}
        roman = meta.get("roman") or {}
        profile = meta.get("profile") or {}

        if exp.get("roman_skipped") is True:
            if not roman.get("skipped"):
                errors.append(f"{pid}: roman.skipped が true ではない")
        elif exp.get("roman_skipped") is False:
            if roman.get("skipped"):
                errors.append(f"{pid}: roman がスキップされた")
            elif not (roman.get("name_en_full") and roman.get("name_en_short")):
                errors.append(f"{pid}: ローマ字フル/略式が空")

        if exp.get("profile_complete"):
            for k in PROFILE_KEYS:
                if not (profile.get(k) or "").strip():
                    errors.append(f"{pid}: profile.{k} が空")
            birth = profile.get("birth_date_raw") or ""
            if exp.get("birth_date_no_age_suffix") and ("歳" in birth):
                errors.append(f"{pid}: birth_date_raw に年齢が残っている: {birth}")

        baseline = job.get("baseline") or {}
        pitching = meta.get("pitching_rows_by_year") or {}
        for y in job.get("years") or []:
            row = pitching.get(str(y))
            if not row and any(t.startswith("pitching") for t in job.get("tests") or []):
                errors.append(f"{pid}: {y} 年投手行なし")
                continue
            if not row:
                continue
            tol = float(exp.get("era_tolerance") or 0.01)
            if baseline.get("expected_era") is not None:
                era = row.get("ERA")
                if era is None or abs(float(era) - float(baseline["expected_era"])) > tol:
                    errors.append(f"{pid}: ERA 期待 {baseline['expected_era']} 実際 {era}")
            if baseline.get("expected_er") is not None:
                er = row.get("ER")
                if er is None or int(er) != int(baseline["expected_er"]):
                    errors.append(f"{pid}: ER 期待 {baseline['expected_er']} 実際 {er}")
            if baseline.get("wrong_era") is not None and baseline.get("expected_era") is None:
                era = row.get("ERA")
                if era is not None and abs(float(era) - float(baseline["wrong_era"])) < 0.5:
                    errors.append(f"{pid}: ERA が旧異常値のまま: {era}")

    return len(errors) == 0, errors


def load_targets_json(path: Path) -> List[Dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, Any]] = []
    for t in raw:
        pid = (t.get("player_id") or t.get("npb_player_id") or "").strip()
        if pid:
            out.append(
                {
                    "player_id": pid,
                    "name_ja": (t.get("name_ja") or "").strip(),
                    "pitching_years": [],
                    "league": "",
                    "expect": {},
                    "tests": [],
                    "baseline": {},
                }
            )
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="NPB 統合スクレイパ")
    parser.add_argument("--samples", type=Path, default=None, help="phase0_samples.json")
    parser.add_argument("--targets", type=Path, default=None, help="player_id リスト JSON（Phase 3-2）")
    parser.add_argument("--player-ids", type=str, default="", help="カンマ区切り ID")
    parser.add_argument("--years", type=str, default="", help="投手対象年度 例: 1950,1984")
    parser.add_argument("--staging", action="store_true", help="ステージングのみ")
    parser.add_argument("--meta-dir", type=Path, default=DEFAULT_META)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--staging-dir", type=Path, default=DEFAULT_STAGING)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--force-roman", action="store_true")
    parser.add_argument("--skip-pitching", action="store_true")
    parser.add_argument("--validate", action="store_true", help="パイロット合格基準を検証")
    args = parser.parse_args()

    override = load_override_map(OVERRIDE_CSV)
    years_global = parse_years_arg(args.years)

    if args.samples:
        samples = load_samples(args.samples)
    elif args.targets:
        if not args.targets.is_file():
            log(f"ERROR: targets がありません: {args.targets}")
            return 1
        samples = load_targets_json(args.targets)
    elif args.player_ids:
        samples = [{"player_id": x.strip(), "name_ja": "", "pitching_years": list(years_global)} for x in args.player_ids.split(",") if x.strip()]
    else:
        log("ERROR: --samples / --targets / --player-ids のいずれかを指定してください")
        return 1

    jobs = build_player_jobs(samples, years_global)
    skip_index = RomanSkipIndex(ROOT)

    args.meta_dir.mkdir(parents=True, exist_ok=True)
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    if args.staging:
        args.staging_dir.mkdir(parents=True, exist_ok=True)
        for old in args.staging_dir.glob("pitching_*_from_master.csv"):
            old.unlink()

    log(f"=== NPB 統合スクレイパ ===")
    log(f"対象: {len(jobs)} 選手 / delay={args.delay}s / staging={args.staging}")

    report_rows: List[Dict[str, str]] = []
    meta_by_id: Dict[str, Dict[str, Any]] = {}
    network_gets = 0
    ids = list(jobs.keys())
    n = len(ids)

    for i, pid in enumerate(ids, 1):
        job = jobs[pid]
        name = job["name_ja"]
        bis_id = override.get(pid, pid)
        meta_path = args.meta_dir / f"{pid}.json"

        html, url, via_net = fetch_player_html(bis_id, args.cache_dir, args.force)
        if via_net:
            network_gets += 1

        if not html:
            log(f"  [{i}/{n}] {name} ({pid}) FAIL: HTML 取得不可")
            report_rows.append({"player_id": pid, "name_ja": name, "status": "fail", "network": "1" if via_net else "0"})
            continue

        years: Set[int] = set(job.get("years") or [])
        parsed = parse_unified(
            html,
            pid,
            name,
            years,
            default_league=job.get("league") or "",
            skip_index=skip_index,
            meta_path=meta_path,
            skip_pitching=args.skip_pitching,
            force_roman=args.force_roman,
        )
        payload = {
            **parsed,
            "fetched_at": utc_now_iso(),
            "source_url": url,
            "fetched_via_network": via_net,
        }
        meta_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        meta_by_id[pid] = payload

        roman_short = (parsed.get("roman") or {}).get("name_en_short") or ""
        if args.staging and not args.skip_pitching:
            for ystr, row in (parsed.get("pitching_rows_by_year") or {}).items():
                append_staging_csv(args.staging_dir, row, roman_short)

        roman = parsed.get("roman") or {}
        prof = parsed.get("profile") or {}
        status = "ok"
        log(
            f"  [{i}/{n}] {name} ({pid}) {status} "
            f"roman_skip={roman.get('skipped')} "
            f"pitching_years={list((parsed.get('pitching_rows_by_year') or {}).keys())} "
            f"net={via_net}"
        )
        report_rows.append(
            {
                "player_id": pid,
                "name_ja": name,
                "status": status,
                "roman_skipped": str(roman.get("skipped")),
                "roman_short": roman.get("name_en_short") or "",
                "birth_date_raw": prof.get("birth_date_raw") or "",
                "pro_debut_raw": prof.get("pro_debut_raw") or "",
                "career_raw": prof.get("career_raw") or "",
                "network": "1" if via_net else "0",
            }
        )

        if via_net and i < n:
            time.sleep(args.delay)

    args.report.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "player_id", "name_ja", "status", "roman_skipped", "roman_short",
        "birth_date_raw", "pro_debut_raw", "career_raw", "network",
    ]
    with args.report.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(report_rows)

    log(f"レポート: {args.report}")
    log(f"ネットワーク GET: {network_gets} / 選手数 {n}")

    exit_code = 0
    if args.validate:
        ok, errs = validate_pilot(jobs, meta_by_id, network_gets)
        if ok:
            log("=== パイロット検証: 合格 ===")
        else:
            log("=== パイロット検証: 不合格 ===")
            for e in errs:
                log(f"  - {e}")
            exit_code = 1

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
