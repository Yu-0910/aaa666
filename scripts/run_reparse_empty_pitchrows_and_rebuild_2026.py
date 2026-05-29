#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pitchRows が空（中止除く）の試合について:
  1. 空の derived/{gameId}_phase10_restored.json を削除
  2. run_yahoo_phase10_restore.py（キャッシュ HTML 利用・ネット再取得なし）
  3. canonical へマージ
  4. 球種別派生 + 打撃プロフィール／ランキング再生成

使い方:
  python scripts/run_reparse_empty_pitchrows_and_rebuild_2026.py
  python scripts/run_reparse_empty_pitchrows_and_rebuild_2026.py --dry-run
  python scripts/run_reparse_empty_pitchrows_and_rebuild_2026.py --sleep 0.8
  python scripts/run_reparse_empty_pitchrows_and_rebuild_2026.py --restore-only
  python scripts/run_reparse_empty_pitchrows_and_rebuild_2026.py --skip-derive

注意:
  - YAHOO_SCRAPE_DISABLED=1 だと復元は中止されます（外してください）。
  - 既定では --force を付けない（raw_sportsnavi_score の HTML を読む）。
  - 所要目安: 55試合・約1.5〜2.5時間 + 派生数分〜十数分

npm から:
  npm run reparse:empty-pitchrows-2026
  npm run reparse:empty-pitchrows-2026:restore-only
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def collect_empty_pitchrow_game_ids(root: Path, year: str) -> list[str]:
    idx_path = root / "_data" / "sportsnavi_schedule_index" / f"season_{year}.json"
    if not idx_path.is_file():
        raise SystemExit(f"missing index: {idx_path}")
    idx = json.loads(idx_path.read_text(encoding="utf-8"))
    game_ids = [str(x).strip() for x in (idx.get("gameIds") or []) if str(x).strip()]

    derived_dir = root / "_data" / "scraped_games" / "derived"
    canon_dir = root / "_data" / "scraped_games" / "canonical"
    out: list[str] = []

    for gid in game_ids:
        p = derived_dir / f"{gid}_phase10_restored.json"
        if not p.is_file():
            continue
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if (raw.get("pitchRows") or []):
            continue

        cancelled = False
        cp = canon_dir / f"{gid}.json"
        if cp.is_file():
            try:
                doc = json.loads(cp.read_text(encoding="utf-8"))
                miss = doc.get("game", {}).get("missingOrPartial") or []
                if any("cancelled" in str(s) for s in miss):
                    cancelled = True
            except Exception:
                pass
        if cancelled:
            continue
        out.append(gid)

    return out


def npm_run(root: Path, script: str) -> int:
    if sys.platform == "win32":
        cmd = ["cmd", "/c", "npm", "run", script]
    else:
        cmd = ["npm", "run", script]
    print(f"\n=== npm run {script} ===\n", flush=True)
    r = subprocess.run(cmd, cwd=str(root))
    return int(r.returncode)


def main() -> None:
    ap = argparse.ArgumentParser(description="空 pitchRows 試合の解析やり直し＋再生成")
    ap.add_argument("--year", default="2026")
    ap.add_argument("--sleep", type=float, default=1.2, help="打席間待機秒（キャッシュ利用時）")
    ap.add_argument("--dry-run", action="store_true", help="対象一覧のみ表示")
    ap.add_argument("--restore-only", action="store_true", help="復元＋マージまで（派生スキップ）")
    ap.add_argument("--skip-derive", action="store_true", help="復元＋マージ後に派生をスキップ")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    year = str(args.year).strip() or "2026"
    game_ids = collect_empty_pitchrow_game_ids(root, year)

    report_dir = root / "_data" / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / f"reparse_empty_pitchrows_{year}_game_ids.json"
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "year": year,
        "count": len(game_ids),
        "gameIds": game_ids,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[reparse] wrote {report_path} ({len(game_ids)} games)", flush=True)

    if not game_ids:
        print("[reparse] 対象試合がありません。", flush=True)
        return

    if args.dry_run:
        print("[reparse] dry-run gameIds:", ", ".join(game_ids), flush=True)
        return

    restore_py = root / "scripts" / "run_yahoo_phase10_restore.py"
    py = sys.executable

    for i, gid in enumerate(game_ids, 1):
        derived = root / "_data" / "scraped_games" / "derived" / f"{gid}_phase10_restored.json"
        if derived.is_file():
            derived.unlink()
            print(f"[{i}/{len(game_ids)}] removed empty {derived.name}", flush=True)

        print(f"\n[{i}/{len(game_ids)}] restore: {gid} (sleep={args.sleep})\n", flush=True)
        r = subprocess.run(
            [
                py,
                str(restore_py),
                "--game-id",
                gid,
                "--text-from-raw",
                "--sleep",
                str(args.sleep),
            ],
            cwd=str(root),
        )
        if r.returncode != 0:
            print(f"[reparse] FAILED restore at {gid} (exit {r.returncode})", file=sys.stderr)
            sys.exit(r.returncode)

        try:
            after = json.loads(derived.read_text(encoding="utf-8"))
            n = len(after.get("pitchRows") or [])
            miss = len(after.get("missingOrPartial") or [])
            print(f"[reparse] {gid} → pitchRows={n} missingFlags={miss}", flush=True)
        except Exception as e:
            print(f"[reparse] warn: could not read {derived}: {e}", flush=True)

    if npm_run(root, "phase4:merge:phase10:all") != 0:
        sys.exit(1)

    if args.restore_only or args.skip_derive:
        print("[reparse] done (restore + merge only)", flush=True)
        return

    if npm_run(root, "phase14:build:pitch") != 0:
        sys.exit(1)

    if npm_run(root, "rebuild:batting-profile-and-rankings-2026") != 0:
        sys.exit(1)

    print("\n[reparse] 完了: 解析やり直し → canonical マージ → phase14 → 打撃プロフィール/ランキング", flush=True)


if __name__ == "__main__":
    main()
