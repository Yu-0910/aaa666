#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
テキスト速報から打席一覧を得て、各打席の Yahoo 一球速報 score?index= ページを
すべて取得し raw HTML として保存する（Phase10 と同じ辿り方）。

出力:
  _data/scraped_games/raw_sportsnavi_score/{gameId}/{index}.html
  _data/scraped_games/raw_sportsnavi_score/_meta/{gameId}.json

トリガー: `npm run phase2:sportsnavi:stats-text` と同じ season インデックス。
日次パイプラインでは Phase2a の直後に実行（`run_daily_npb_pipeline.mjs`）。

Phase10（run_yahoo_phase10_restore.py）は同じディレクトリを cache_dir として読み、
先に本スクリプトで埋まっていれば再フェッチを省略できる。

例:
  python scripts/fetch_sportsnavi_score_raw_snapshot.py --year 2026
  python scripts/fetch_sportsnavi_score_raw_snapshot.py --year 2026 --game-ids 2021038679 --force
  python scripts/fetch_sportsnavi_score_raw_snapshot.py --year 2026 --to-date 2026-04-19 --sleep 1.2
  python -u scripts/fetch_sportsnavi_score_raw_snapshot.py --year 2026 --progress-pa-interval 10 --log-append _data/reports/score_raw_progress.log
  # 取得済み試合は試合単位でスキップ（再取得しない）。打席ループまで回したいときは --rescan-complete-games、上書き再取得は --force
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
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
from scrape_yahoo_pitch_details import fetch_pitch_detail_score_pages_for_pa  # noqa: E402
from yahoo_scrape_guard import ensure_yahoo_network_fetch_allowed  # noqa: E402
from sportsnavi_schedule_status import is_schedule_cancelled_game  # noqa: E402

def read_json(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def filter_game_ids_by_to_date(idx: dict, game_ids_all: list[str], to_date: str) -> list[str]:
    by_date = idx.get("byDate")
    if not to_date or not by_date or not isinstance(by_date, dict):
        return game_ids_all
    allowed: set[str] = set()
    for day, ids in by_date.items():
        if not day or day > to_date:
            continue
        if not isinstance(ids, list):
            continue
        for x in ids:
            s = str(x or "").strip()
            if s:
                allowed.add(s)
    if not allowed:
        return game_ids_all
    return [g for g in game_ids_all if str(g).strip() in allowed]

def filter_game_ids_by_date_range(idx: dict, game_ids_all: list[str], from_date: str, to_date: str) -> list[str]:
    by_date = idx.get("byDate")
    f = (from_date or "").strip()
    t = (to_date or "").strip()
    if (not f and not t) or not by_date or not isinstance(by_date, dict):
        return game_ids_all
    allowed: set[str] = set()
    for day, ids in by_date.items():
        if not day:
            continue
        if f and day < f:
            continue
        if t and day > t:
            continue
        if not isinstance(ids, list):
            continue
        for x in ids:
            s = str(x or "").strip()
            if s:
                allowed.add(s)
    if not allowed:
        return game_ids_all
    return [g for g in game_ids_all if str(g).strip() in allowed]


def load_text_html(root: Path, game_id: str) -> str | None:
    p1 = root / "_data" / "scraped_games" / "raw_sportsnavi_text" / f"{game_id}.html"
    if p1.is_file():
        return p1.read_text(encoding="utf-8")
    p2 = root / "_data" / "scraped_games" / "raw" / game_id / "text.html"
    if p2.is_file():
        return p2.read_text(encoding="utf-8")
    return None

def _fmt_hms(seconds: float) -> str:
    s = max(0, int(seconds))
    hh = s // 3600
    mm = (s % 3600) // 60
    ss = s % 60
    if hh > 0:
        return f"{hh}:{mm:02d}:{ss:02d}"
    return f"{mm}:{ss:02d}"


def _emit(line: str, log_fp) -> None:
    print(line, flush=True)
    if log_fp is not None:
        log_fp.write(line + "\n")
        log_fp.flush()


def _score_raw_game_already_complete(gdir: Path, meta_path: Path, n_pa: int) -> bool:
    """メタとディスク上の HTML が揃い、失敗打席ゼロなら再取得不要。"""
    if n_pa <= 0 or not meta_path.is_file():
        return False
    try:
        meta = read_json(meta_path)
    except Exception:
        return False
    if meta.get("schemaVersion") != "sportsnavi-score-raw-meta-v1":
        return False
    try:
        if int(meta.get("failedPlateAppearances", -1)) != 0:
            return False
        if int(meta.get("plateAppearances", -1)) != n_pa:
            return False
    except (TypeError, ValueError):
        return False
    indexes = meta.get("scoreIndexes")
    if not isinstance(indexes, list) or not indexes:
        return False
    try:
        spc = int(meta.get("scorePageCount", -1))
    except (TypeError, ValueError):
        return False
    if spc != len(indexes):
        return False
    gdir.mkdir(parents=True, exist_ok=True)
    for ix in indexes:
        s = str(ix).strip()
        if not s or not (gdir / f"{s}.html").is_file():
            return False
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description="一球速報 score?index= raw を試合単位で保存")
    ap.add_argument("--year", default="2026")
    ap.add_argument("--sleep", type=float, default=1.2, help="打席と打席の間の待機秒")
    ap.add_argument("--limit", type=int, default=0, help="処理する試合数上限（0=全件）")
    ap.add_argument("--game-ids", default="", help="カンマ区切り（指定時はインデックスの gameIds を上書き）")
    ap.add_argument("--from-date", default="", help="season index の byDate でこの日付以上の試合のみ（YYYY-MM-DD）")
    ap.add_argument("--to-date", default="", help="season index の byDate でこの日付以下の試合のみ")
    ap.add_argument("--force", action="store_true", help="キャッシュを無視して再取得し、試合単位スキップもしない")
    ap.add_argument(
        "--rescan-complete-games",
        action="store_true",
        help="取得済みと判定できる試合も打席ループを回す（メタ再書き込み・再確認用。通常は不要）",
    )
    ap.add_argument(
        "--progress-pa-interval",
        type=int,
        default=15,
        help="試合内の進捗を N 打席ごとに表示（0=試合内ログなし・試合完了時のみ）",
    )
    ap.add_argument(
        "--log-append",
        default="",
        help="進捗行を追記するパス（別ターミナルで tail -f 可能。空なら書かない）",
    )
    args = ap.parse_args()

    ensure_yahoo_network_fetch_allowed()

    root = _SCRIPT_DIR.parent
    index_path = root / "_data" / "sportsnavi_schedule_index" / f"season_{args.year}.json"
    if not index_path.is_file():
        print(f"[score-raw] missing index: {index_path}", file=sys.stderr)
        sys.exit(1)
    idx = read_json(index_path)
    if idx.get("schemaVersion") != "sportsnavi-schedule-season-index-v1":
        print(f"[score-raw] invalid index schema: {index_path}", file=sys.stderr)
        sys.exit(1)

    if args.game_ids.strip():
        game_ids = [x.strip() for x in args.game_ids.split(",") if x.strip()]
    else:
        game_ids = [str(x).strip() for x in (idx.get("gameIds") or []) if str(x).strip()]
    if args.from_date.strip() or args.to_date.strip():
        before = len(game_ids)
        game_ids = filter_game_ids_by_date_range(idx, game_ids, args.from_date.strip(), args.to_date.strip())
        print(f"[score-raw] date-range from={args.from_date or '(none)'} to={args.to_date or '(none)'}: {before} → {len(game_ids)} game(s)")
    if args.limit > 0:
        game_ids = game_ids[: args.limit]

    out_root = root / "_data" / "scraped_games" / "raw_sportsnavi_score"
    meta_dir = out_root / "_meta"
    meta_dir.mkdir(parents=True, exist_ok=True)

    log_append = (args.log_append or "").strip()
    log_fp = None
    if log_append:
        lp = Path(log_append)
        if not lp.is_absolute():
            lp = root / lp
        lp.parent.mkdir(parents=True, exist_ok=True)
        log_fp = open(lp, "a", encoding="utf-8")
        _emit(
            f"[score-raw] --- log append {lp} started {datetime.now(timezone.utc).isoformat()} ---",
            log_fp,
        )

    failures_path = out_root / "_failures.json"
    failures: dict = {"schemaVersion": "sportsnavi-score-raw-failures-v1", "year": args.year, "rows": []}
    if failures_path.is_file():
        try:
            failures = read_json(failures_path)
            if "rows" not in failures:
                failures["rows"] = []
        except Exception:
            pass

    try:
        _run_games(game_ids, args, root, out_root, meta_dir, failures_path, failures, log_fp)
    finally:
        if log_fp is not None:
            log_fp.close()


def _run_games(
    game_ids: list[str],
    args: argparse.Namespace,
    root: Path,
    out_root: Path,
    meta_dir: Path,
    failures_path: Path,
    failures: dict,
    log_fp,
) -> None:
    """ループ本体（ログファイルを finally で閉じるため分離）。"""
    total_pages = 0
    started_all = time.time()
    done_games = 0
    for gi, game_id in enumerate(game_ids):
        started_game = time.time()
        if is_schedule_cancelled_game(root, str(args.year), game_id) is True:
            _emit(
                f"[score-raw] skip {gi + 1}/{len(game_ids)} {game_id}: schedule 試合中止/ノーゲーム",
                log_fp,
            )
            continue
        gdir = out_root / game_id
        html_text = load_text_html(root, game_id)
        if not html_text or html_text.strip().startswith("FETCH_FAILED"):
            msg = "missing_text_raw"
            _emit(f"[score-raw] skip {game_id}: {msg}", log_fp)
            failures["rows"].append({"gameId": game_id, "error": msg, "at": datetime.now(timezone.utc).isoformat()})
            continue

        pas = parse_plate_appearances_from_html(html_text, game_id)
        if not pas:
            _emit(f"[score-raw] skip {game_id}: no plate appearances parsed", log_fp)
            failures["rows"].append(
                {"gameId": game_id, "error": "no_plate_appearances", "at": datetime.now(timezone.utc).isoformat()}
            )
            continue

        n_pa = len(pas)
        meta_path = meta_dir / f"{game_id}.json"
        if (
            not args.force
            and not args.rescan_complete_games
            and _score_raw_game_already_complete(gdir, meta_path, n_pa)
        ):
            _emit(
                f"[score-raw] skip {gi + 1}/{len(game_ids)} {game_id}: already_complete",
                log_fp,
            )
            continue

        iv = args.progress_pa_interval
        elapsed_all_prev = time.time() - started_all
        _emit(
            f"[score-raw] start {gi + 1}/{len(game_ids)} {game_id} PAs={n_pa} "
            f"elapsedSoFar≈{_fmt_hms(elapsed_all_prev)} gamesCompleted={done_games}",
            log_fp,
        )

        indexes: list[str] = []
        failed_pa = 0
        for i, pa in enumerate(pas):
            inning = int(pa["inning"])
            top_bottom = pa["top_bottom"]
            bat_order = int(pa["bat_order"])
            pa_stats: dict[str, int] = {}
            chain = fetch_pitch_detail_score_pages_for_pa(
                game_id,
                inning,
                top_bottom,
                bat_order,
                # 打席間の待機はこの for ループ側で行う。
                # 同一打席内の btn_next 追従は基本速いので、ここでは待機しない（所要時間短縮）。
                sleep_sec=0.0,
                cache_dir=gdir,
                force=args.force,
                statistics=pa_stats,
            )
            if not chain:
                failed_pa += 1
            indexes.extend(ix for ix, _ in chain)
            if iv > 0 and (i == 0 or (i + 1) % iv == 0):
                _emit(
                    f"[score-raw]   {game_id} pa {i + 1}/{n_pa} pagesSoFar={len(indexes)} "
                    f"failedPA={failed_pa} gameElapsed≈{_fmt_hms(time.time() - started_game)}",
                    log_fp,
                )
            # 未取得が無い打席だけならネットへの負荷が無いので待機しない（再実行の短縮）。
            if args.sleep > 0 and i < len(pas) - 1 and pa_stats.get("network_fetches", 0) > 0:
                time.sleep(args.sleep)

        indexes.sort()
        fetched_at = datetime.now(timezone.utc).isoformat()
        meta = {
            "schemaVersion": "sportsnavi-score-raw-meta-v1",
            "year": args.year,
            "gameId": game_id,
            "fetchedAt": fetched_at,
            "plateAppearances": len(pas),
            "scoreIndexes": indexes,
            "scorePageCount": len(indexes),
            "failedPlateAppearances": failed_pa,
        }
        (meta_dir / f"{game_id}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        total_pages += len(indexes)
        done_games += 1
        elapsed_game = time.time() - started_game
        elapsed_all = time.time() - started_all
        avg_per_done = (elapsed_all / done_games) if done_games > 0 else 0.0
        remaining = max(0, len(game_ids) - (gi + 1))
        eta = avg_per_done * remaining
        _emit(
            f"[score-raw] {gi + 1}/{len(game_ids)} {game_id} "
            f"PAs={len(pas)} pages={len(indexes)} failedPA={failed_pa} "
            f"elapsed={_fmt_hms(elapsed_game)} eta≈{_fmt_hms(eta)}",
            log_fp,
        )

    failures_path.write_text(json.dumps(failures, ensure_ascii=False, indent=2), encoding="utf-8")
    _emit(
        f"[score-raw] done games={len(game_ids)} totalScorePages≈{total_pages} out={out_root}",
        log_fp,
    )


if __name__ == "__main__":
    main()
