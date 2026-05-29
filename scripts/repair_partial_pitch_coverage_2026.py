#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
部分欠損している一球速報（canonical の plateAppearances に pitchEvents が無い打席）を修復する。

手順:
  1. カバレッジ診断で「一部のみ pitchEvents」の試合を列挙
  2. Phase4 マージのみ（derived 行はあるが trim で落ちたケースを先に直す）
  3. 欠損打席の score キャッシュを削除し Phase10 を --force --text-from-raw で再取得
  4. 再度 Phase4 マージ
  5. 診断レポート出力

使い方:
  python scripts/repair_partial_pitch_coverage_2026.py --dry-run
  python scripts/repair_partial_pitch_coverage_2026.py --merge-only
  python scripts/repair_partial_pitch_coverage_2026.py
  python scripts/repair_partial_pitch_coverage_2026.py --sleep 0.8

注意: Yahoo ネットワーク取得が必要（YAHOO_SCRAPE_DISABLED=1 だと restore は中止）。
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from pa_id_format import parse_pa_id, pa_seq_in_half_to_score_index_prefix  # noqa: E402
from pitch_by_pitch_runner_out_no_ab import is_expected_no_pitch_events_pa  # noqa: E402


def legacy_pa_key_from_pa_id(pa_id: str) -> tuple[str, str, str] | None:
    """(inning, 表裏, pa_seq_in_half) — 打順ではない。"""
    p = parse_pa_id(pa_id)
    if not p:
        return None
    return str(p.inning), p.half, str(p.pa_seq_in_half)


def count_missing_pas(canon_path: Path) -> tuple[int, int, list[tuple[str, str, str]]]:
    """(打席総数, 修復対象欠損数, 修復対象の (inning, 表裏, 打順))。走者アウト終了・打者結果なしは欠損に数えない。"""
    doc = json.loads(canon_path.read_text(encoding="utf-8"))
    if any("cancelled" in str(s) for s in doc.get("game", {}).get("missingOrPartial") or []):
        return 0, 0, []
    pas = doc.get("domain", {}).get("plateAppearances") or []
    total = len(pas)
    missing_keys: list[tuple[str, str, str]] = []
    missing_n = 0
    for pa in pas:
        if pa.get("pitchEvents"):
            continue
        if is_expected_no_pitch_events_pa(doc, pa):
            continue
        missing_n += 1
        p = legacy_pa_key_from_pa_id(str(pa.get("paId") or ""))
        if p:
            missing_keys.append(p)
    return total, missing_n, missing_keys


def collect_partial_game_ids(root: Path, year: str) -> list[str]:
    idx_path = root / "_data" / "sportsnavi_schedule_index" / f"season_{year}.json"
    idx = json.loads(idx_path.read_text(encoding="utf-8"))
    canon_dir = root / "_data" / "scraped_games" / "canonical"
    out: list[str] = []
    for gid in idx.get("gameIds") or []:
        gid = str(gid).strip()
        cp = canon_dir / f"{gid}.json"
        if not cp.is_file():
            continue
        total, missing_n, _ = count_missing_pas(cp)
        if total > 0 and missing_n > 0:
            out.append(gid)
    return out


def run_merge(root: Path, game_id: str) -> int:
    args = ["npx", "tsx", "scripts/phase4_merge_phase10_into_sportsnavi_canonical.ts", "--game-id", game_id]
    if sys.platform == "win32":
        cmd = ["cmd", "/c", *args]
    else:
        cmd = args
    print(f"  [merge] {game_id}", flush=True)
    return subprocess.run(cmd, cwd=str(root)).returncode


def clear_score_cache_for_pa(cache_dir: Path, inning: str, top_bottom: str, pa_seq_in_half: str) -> int:
    if not cache_dir.is_dir():
        return 0
    prefix = pa_seq_in_half_to_score_index_prefix(inning, top_bottom, pa_seq_in_half)
    n = 0
    for f in cache_dir.glob(f"{prefix}*.html"):
        try:
            f.unlink()
            n += 1
        except OSError:
            pass
    return n


def run_restore(root: Path, game_id: str, sleep: float, force: bool) -> int:
    cmd = [
        sys.executable,
        "scripts/run_yahoo_phase10_restore.py",
        "--game-id",
        game_id,
        "--text-from-raw",
        "--sleep",
        str(sleep),
    ]
    if force:
        cmd.append("--force")
    print(f"  [restore] {game_id} force={force}", flush=True)
    return subprocess.run(cmd, cwd=str(root)).returncode


def main() -> None:
    ap = argparse.ArgumentParser(description="部分欠損の一球速報を修復")
    ap.add_argument("--year", default="2026")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--merge-only", action="store_true", help="Phase4 マージのみ（再取得しない）")
    ap.add_argument("--sleep", type=float, default=1.0)
    ap.add_argument("--no-force", action="store_true", help="restore 時に --force を付けない（キャッシュのみ）")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    year = str(args.year).strip() or "2026"
    game_ids = collect_partial_game_ids(root, year)

    print(f"[repair-partial-pitch] 対象試合: {len(game_ids)}", flush=True)
    if args.dry_run:
        for gid in game_ids:
            cp = root / "_data" / "scraped_games" / "canonical" / f"{gid}.json"
            total, missing_n, keys = count_missing_pas(cp)
            print(f"  {gid}  missing={missing_n}/{total}  keys={keys[:5]}{'…' if len(keys) > 5 else ''}")
        return

    report_dir = root / "_data" / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    log_path = report_dir / f"repair_partial_pitch_{year}_{stamp}.jsonl"

    def log(obj: dict) -> None:
        line = json.dumps(obj, ensure_ascii=False)
        with log_path.open("a", encoding="utf-8") as f:
            f.write(line + "\n")

    # Step 1: merge only
    for gid in game_ids:
        rc = run_merge(root, gid)
        log({"step": "merge", "gameId": gid, "exit": rc})

    if args.merge_only:
        print(f"[repair-partial-pitch] merge-only 完了 → {log_path}", flush=True)
        diag_args = ["node", "scripts/diag_pitch_by_pitch_coverage_all_games.mjs", "--year", year]
        if sys.platform == "win32":
            subprocess.run(["cmd", "/c", *diag_args], cwd=str(root))
        else:
            subprocess.run(diag_args, cwd=str(root))
        return

    # Step 2: restore with cache clear for missing PAs
    still_partial = collect_partial_game_ids(root, year)
    print(f"[repair-partial-pitch] merge 後も欠損あり: {len(still_partial)} 試合", flush=True)

    for gid in still_partial:
        cp = root / "_data" / "scraped_games" / "canonical" / f"{gid}.json"
        _, missing_n, keys = count_missing_pas(cp)
        if missing_n == 0:
            continue
        cache_dir = root / "_data" / "scraped_games" / "raw_sportsnavi_score" / gid
        cleared = 0
        for inn, tb, bo in keys:
            cleared += clear_score_cache_for_pa(cache_dir, inn, tb, bo)
        log({"step": "cache_clear", "gameId": gid, "pas": len(keys), "files": cleared})
        rc = run_restore(root, gid, args.sleep, force=not args.no_force)
        log({"step": "restore", "gameId": gid, "exit": rc})
        if rc != 0:
            print(f"  ⚠ restore failed exit={rc} {gid}", file=sys.stderr, flush=True)
            continue
        rc2 = run_merge(root, gid)
        log({"step": "merge_after_restore", "gameId": gid, "exit": rc2})

    print(f"[repair-partial-pitch] 完了 → log: {log_path}", flush=True)
    diag_args = ["node", "scripts/diag_pitch_by_pitch_coverage_all_games.mjs", "--year", year]
    if sys.platform == "win32":
        subprocess.run(["cmd", "/c", *diag_args], cwd=str(root))
    else:
        subprocess.run(diag_args, cwd=str(root))


if __name__ == "__main__":
    main()
