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
import sys
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


def _main_html_cancelled(html: str | None) -> bool:
    if not html:
        return False
    return any(
        x in html
        for x in (
            "試合中止",
            "ノーゲーム",
            "コールドゲーム",
            "コールド",
            "試合は中止",
        )
    )


def collect_incomplete_game_ids(
    root: Path,
    year: str,
    from_date: str,
    to_date: str,
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
    if not game_ids:
        return [], [], 0, []

    out_root = root / "_data" / "scraped_games" / "raw_sportsnavi_score"
    meta_dir = out_root / "_meta"
    incomplete: list[tuple[str, str]] = []
    skipped_cancelled = 0

    for game_id in game_ids:
        main_path = root / "_data" / "scraped_games" / "raw_sportsnavi" / f"{game_id}.html"
        main_html = None
        if main_path.is_file():
            try:
                main_html = main_path.read_text(encoding="utf-8")
            except OSError:
                main_html = None
        if _main_html_cancelled(main_html):
            skipped_cancelled += 1
            continue

        html_text = load_text_html(root, game_id)
        if not html_text or html_text.strip().startswith("FETCH_FAILED"):
            incomplete.append((game_id, "missing_text_raw"))
            continue

        pas = parse_plate_appearances_from_html(html_text, game_id)
        if not pas:
            incomplete.append((game_id, "no_plate_appearances"))
            continue

        gdir = out_root / game_id
        meta_path = meta_dir / f"{game_id}.json"
        if _score_raw_game_already_complete(gdir, meta_path, len(pas)):
            continue
        incomplete.append((game_id, "score_raw_incomplete"))

    return game_ids, incomplete, skipped_cancelled, []


def main() -> None:
    ap = argparse.ArgumentParser(description="Phase4 前: score raw 完了ゲート")
    ap.add_argument("--year", default="2026")
    ap.add_argument("--from-date", default="")
    ap.add_argument("--to-date", default="")
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

    game_ids, incomplete, skipped_cancelled, errors = collect_incomplete_game_ids(
        root, year, from_date, to_date
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
    if args.emit_incomplete_csv:
        print(
            "SCORE_RAW_GATE_INCOMPLETE_CSV="
            + ",".join(gid for gid, _ in incomplete),
            flush=True,
        )
    print(
        "\n[score-raw-gate] 対処:\n"
        "  1. 全試合終了後に実行する（試合中は prefetch のみ）\n"
        "  2. npm run daily:npb-pipeline:prefetch のあと npm run daily:npb-pipeline:finalize\n"
        "  3. 未完了試合だけ再取得（日次パイプラインは自動で1回試行）:\n"
        f"     python -u scripts/fetch_sportsnavi_score_raw_snapshot.py --year {year}"
        f" --from-date {from_date or to_date} --to-date {to_date or from_date}"
        f" --game-ids {','.join(gid for gid, _ in incomplete)} --sleep 1.2\n"
        "  ※ derive-only は Phase4 をスキップするため、ゲート通過後の復旧には使わない\n"
        "  意図的に Phase4 からネット取得する場合は --skip-score-raw-gate または --yahoo-force",
        file=sys.stderr,
    )
    sys.exit(1 if args.fail else 0)


if __name__ == "__main__":
    main()
