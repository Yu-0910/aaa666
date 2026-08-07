#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase4 前ゲート: 対象日の試合について score raw が already_complete か確認する。

Phase2a-b 直後に実行し、未完了のまま Phase4 に入ると打席ごとのネット取得で数時間かかる。
未完了時は exit 1（--fail）で止め、prefetch / 試合終了後の finalize を促す。

例:
  python scripts/gate_score_raw_complete_for_pipeline.py --year 2026 --from-date 2026-06-04 --to-date 2026-06-04 --fail
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure") and not sys.stdout.closed:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure") and not sys.stderr.closed:
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from fetch_game_pitch_types import parse_plate_appearances_from_html  # noqa: E402
from fetch_sportsnavi_score_raw_snapshot import (  # noqa: E402
    _score_raw_game_already_complete,
    filter_game_ids_by_date_range,
    load_text_html,
    read_json,
)


from yahoo_game_main_cancelled import main_html_cancelled as _main_html_cancelled  # noqa: E402
from sportsnavi_schedule_status import is_schedule_cancelled_game  # noqa: E402


def schedule_status_text_for_game(root: Path, game_id: str) -> str:
    snap_dir = root / "_data" / "sportsnavi_schedule_snapshots" / "by_date"
    if not snap_dir.is_dir():
        return ""
    for snap_path in sorted(snap_dir.glob("*.json")):
        try:
            snap = json.loads(snap_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        games = snap.get("games") if isinstance(snap, dict) else None
        if not isinstance(games, list):
            continue
        for game in games:
            if str(game.get("gameId", "")).strip() == game_id:
                return str(game.get("statusText", "") or "").strip()
    return ""


def parse_iso_ms(value: object) -> float:
    text = str(value or "").strip()
    if not text:
        return 0.0
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp() * 1000
    except ValueError:
        return 0.0


def first_finished_seen_at_ms_for_game(root: Path, game_id: str, from_date: str, to_date: str) -> float:
    finish_seen_path = root / "_data" / "scraped_games" / "_meta" / "schedule_finish_seen_v1.json"
    if not finish_seen_path.is_file():
        return 0.0
    try:
        payload = json.loads(finish_seen_path.read_text(encoding="utf-8"))
    except Exception:
        return 0.0
    games = payload.get("games") if isinstance(payload, dict) else None
    if not isinstance(games, dict):
        return 0.0
    candidate_dates = [d for d in [from_date, to_date] if d]
    for date_jst in candidate_dates:
        entry = games.get(f"{date_jst}:{game_id}")
        if isinstance(entry, dict):
            parsed = parse_iso_ms(entry.get("firstFinishedSeenAt"))
            if parsed > 0:
                return parsed
    for entry in games.values():
        if not isinstance(entry, dict):
            continue
        if str(entry.get("gameId", "")).strip() != game_id:
            continue
        parsed = parse_iso_ms(entry.get("firstFinishedSeenAt"))
        if parsed > 0:
            return parsed
    return 0.0


def schedule_fetched_at_ms_for_game(root: Path, game_id: str) -> float:
    snap_dir = root / "_data" / "sportsnavi_schedule_snapshots" / "by_date"
    if not snap_dir.is_dir():
        return 0.0
    for snap_path in sorted(snap_dir.glob("*.json")):
        try:
            snap = json.loads(snap_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        games = snap.get("games") if isinstance(snap, dict) else None
        if not isinstance(games, list):
            continue
        for game in games:
            if str(game.get("gameId", "")).strip() == game_id:
                return parse_iso_ms(snap.get("fetchedAt"))
    return 0.0


def collect_incomplete_game_ids(
    root: Path,
    year: str,
    from_date: str,
    to_date: str,
    game_ids_filter: set[str] | None = None,
) -> tuple[list[str], list[tuple[str, str]], int, list[str]]:
    """(game_ids, incomplete, skipped_cancelled, error_messages)"""
    index_path = root / "_data" / "sportsnavi_schedule_index" / f"season_{year}.json"
    if not index_path.is_file():
        return [], [], 0, [f"missing index: {index_path}"]

    idx = read_json(index_path)
    game_ids = [
        str(x).strip()
        for x in (idx.get("gameIds") or [])
        if str(x).strip()
    ]
    game_ids = filter_game_ids_by_date_range(idx, game_ids, from_date, to_date)
    if game_ids_filter is not None:
        game_ids = [gid for gid in game_ids if gid in game_ids_filter]
    if not game_ids:
        return [], [], 0, []

    out_root = root / "_data" / "scraped_games" / "raw_sportsnavi_score"
    meta_dir = out_root / "_meta"
    incomplete: list[tuple[str, str]] = []
    skipped_cancelled = 0

    for game_id in game_ids:
        schedule_cancelled = is_schedule_cancelled_game(root, year, game_id)
        if schedule_cancelled is True:
            skipped_cancelled += 1
            continue

        main_path = root / "_data" / "scraped_games" / "raw_sportsnavi" / f"{game_id}.html"
        main_html = None
        if main_path.is_file():
            try:
                main_html = main_path.read_text(encoding="utf-8")
            except OSError:
                main_html = None
        if schedule_cancelled is None and _main_html_cancelled(main_html, game_id):
            skipped_cancelled += 1
            continue

        html_text = load_text_html(root, game_id)
        if not html_text or html_text.strip().startswith("FETCH_FAILED"):
            incomplete.append((game_id, "missing_text_raw"))
            continue

        if schedule_cancelled is None and _main_html_cancelled(html_text, game_id):
            skipped_cancelled += 1
            continue

        pas = parse_plate_appearances_from_html(html_text, game_id)
        if not pas:
            if 'id="async-inning"' in html_text or 'id="async-text"' in html_text:
                incomplete.append((game_id, "async_shell_no_live_text"))
            else:
                incomplete.append((game_id, "no_plate_appearances"))
            continue

        gdir = out_root / game_id
        meta_path = meta_dir / f"{game_id}.json"
        if _score_raw_game_already_complete(gdir, meta_path, len(pas)):
            meta = read_json(meta_path) if meta_path.is_file() else {}
            status_text = schedule_status_text_for_game(root, game_id)
            finished_seen_at_ms = first_finished_seen_at_ms_for_game(root, game_id, from_date, to_date)
            schedule_fetched_at_ms = finished_seen_at_ms or schedule_fetched_at_ms_for_game(root, game_id)
            raw_fetched_at_ms = parse_iso_ms(meta.get("fetchedAt")) if isinstance(meta, dict) else 0.0
            if "試合終了" in status_text and schedule_fetched_at_ms > 0 and raw_fetched_at_ms < schedule_fetched_at_ms:
                incomplete.append((game_id, "score_raw_before_game_finished"))
            continue
        incomplete.append((game_id, "score_raw_incomplete"))

    return game_ids, incomplete, skipped_cancelled, []


def main() -> None:
    ap = argparse.ArgumentParser(description="Phase4 前: score raw 完了ゲート")
    ap.add_argument("--year", default="2026")
    ap.add_argument("--from-date", default="")
    ap.add_argument("--to-date", default="")
    ap.add_argument("--game-ids", default="", help="確認対象の試合ID（カンマ区切り）。日付範囲内からさらに絞り込む")
    ap.add_argument("--fail", action="store_true", help="未完了があれば exit 1")
    ap.add_argument(
        "--emit-incomplete-csv",
        action="store_true",
        help="未完了時に stdout へ SCORE_RAW_GATE_INCOMPLETE_CSV=gameId,... を1行出力（パイプライン自動再取得用）",
    )
    args = ap.parse_args()

    root = _SCRIPT_DIR.parent
    year = str(args.year).strip()
    from_date = str(args.from_date or "").strip()
    to_date = str(args.to_date or "").strip()
    game_ids_filter = {
        x.strip()
        for x in str(args.game_ids or "").split(",")
        if x.strip()
    } or None

    game_ids, incomplete, skipped_cancelled, errors = collect_incomplete_game_ids(
        root, year, from_date, to_date, game_ids_filter
    )
    if errors:
        for msg in errors:
            print(f"[score-raw-gate] {msg}", file=sys.stderr)
        sys.exit(1 if args.fail else 0)

    if not game_ids:
        print(
            f"[score-raw-gate] no games in range from={from_date or '(none)'} to={to_date or '(none)'} — skip"
        )
        sys.exit(0)

    if skipped_cancelled:
        print(f"[score-raw-gate] skipped cancelled: {skipped_cancelled} game(s)")

    if not incomplete:
        print(
            f"[score-raw-gate] OK: {len(game_ids)} game(s) "
            f"(from={from_date or '*'} to={to_date or '*'})"
        )
        sys.exit(0)

    print(
        f"[score-raw-gate] NG: {len(incomplete)} / {len(game_ids)} game(s) not ready for Phase4:",
        file=sys.stderr,
    )
    for gid, reason in incomplete:
        print(f"  - {gid}: {reason}", file=sys.stderr)
    stats_text_retryable = [
        gid for gid, reason in incomplete if reason in {"no_plate_appearances", "missing_text_raw"}
    ]
    score_raw_retryable = [
        gid
        for gid, reason in incomplete
        if reason in {"score_raw_incomplete", "score_raw_before_game_finished"}
    ]
    if args.emit_incomplete_csv:
        print(
            "SCORE_RAW_GATE_INCOMPLETE_CSV="
            + ",".join(gid for gid, _ in incomplete),
            flush=True,
        )
        print(
            "SCORE_RAW_GATE_INCOMPLETE_REASONS_JSON="
            + json.dumps({gid: reason for gid, reason in incomplete}, ensure_ascii=False, sort_keys=True),
            flush=True,
        )
    print("\n[score-raw-gate] 対処:", file=sys.stderr)
    print("  1. 全試合終了後に実行する（試合中は prefetch のみ）", file=sys.stderr)
    print("  2. npm run daily:npb-pipeline:prefetch のあと npm run daily:npb-pipeline:finalize", file=sys.stderr)
    if stats_text_retryable:
        print("  3. stats/text が空の試合を再取得する:", file=sys.stderr)
        print(
            f"     node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year {year}"
            f" --only-incomplete --game-ids {','.join(stats_text_retryable)}",
            file=sys.stderr,
        )
    if score_raw_retryable:
        print("  4. score raw が未完了の試合だけ再取得する:", file=sys.stderr)
        print(
            f"     python -u scripts/fetch_sportsnavi_score_raw_snapshot.py --year {year}"
            f" --from-date {from_date or to_date} --to-date {to_date or from_date}"
            f" --game-ids {','.join(score_raw_retryable)} --sleep 1.2",
            file=sys.stderr,
        )
    print("  ※ derive-only は Phase4 をスキップするため、ゲート通過後の復旧には使わない", file=sys.stderr)
    print(
        "  意図的に Phase4 からネット取得する場合は --skip-score-raw-gate または --yahoo-force",
        file=sys.stderr,
    )
    sys.exit(1 if args.fail else 0)


if __name__ == "__main__":
    main()
