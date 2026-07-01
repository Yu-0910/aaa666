#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 10: テキスト速報の打席一覧 + 各打席の score?index= から一球ログを取得し、
derived JSON に保存する。続けて `merge_yahoo_phase10_canonical.ts` で canonical にマージ。

paId / bat_order の意味（打順と混同しない）:
  - canonical `paId` 末尾 = **半回内打席通し番号**（実況「N：」= score index の N）。
  - Phase10 行の `bat_order` も同じ番号（Yahoo 由来のフィールド名で、打順1〜9ではない）。
  - SSOT: lib/yahooGame/paIdFormat.ts / scripts/pa_id_format.py

計画: docs/yahoo_npb_game_data_integration_plan.md Phase 10
一球の取り込みルール: docs/yahoo_plate_appearance_batting_rules.md §6a・§6b（末尾がボール／ストライク進行のみなら
「次へ」確認。不完全時は missingOrPartial に score:…:trailing_intermediate_* を付与）
公式成績と一球が食い違うときは **再取得を優先**（§6c）。

例:
  python scripts/run_yahoo_phase10_restore.py --game-id 2021038624
  python scripts/run_yahoo_phase10_restore.py --game-id 2021038624 --text-from-raw --limit 5
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from pitch_by_pitch_runner_out_no_ab import (  # noqa: E402
    PHASE10_MISSING_RUNNER_OUT_NO_AB,
    is_runner_out_ends_half_no_ab,
)

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None  # type: ignore[misc, assignment]

if sys.platform == "win32":
    # npm 経由実行などで stdout が閉じている場合があるため、reconfigure を優先する
    try:
        if hasattr(sys.stdout, "reconfigure") and not sys.stdout.closed:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure") and not sys.stderr.closed:
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def safe_print(*args, **kwargs) -> None:
    """
    Windows + npm 経由で stdout が閉じていても落ちない print。
    """
    try:
        if getattr(sys.stdout, "closed", False):
            print(*args, file=sys.__stdout__, **{k: v for k, v in kwargs.items() if k != "file"})
            return
        print(*args, **kwargs)
    except Exception:
        try:
            print(*args, file=sys.__stdout__)
        except Exception:
            return

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from fetch_game_pitch_types import parse_plate_appearances_from_html  # noqa: E402
from fetch_sportsnavi_score_raw_snapshot import load_text_html  # noqa: E402
from scrape_yahoo_pitch_details import (  # noqa: E402
    build_index,
    fetch_html,
    fetch_pitch_detail_score_pages_for_pa,
    parse_pitch_details_merged_score_pages,
    _is_intermediate_trailing_result,
)
from yahoo_scrape_guard import ensure_yahoo_network_fetch_allowed  # noqa: E402

BASE_URL = "https://baseball.yahoo.co.jp"

PAID_PATTERN = re.compile(r"^\d+-(\d+)-(表|裏)-(\d+)$")


def plate_appearances_from_canonical_fallback(root: Path, game_id: str) -> list[dict]:
    """
    テキスト速報 HTML が JS 依存で打席一覧を抽出できない場合のフォールバック。
    canonical の plateAppearances から (inning, top_bottom, bat_order, batter_id, pitcher_id) を復元する。

    目的:
      - Phase10 の score?index= を叩くための index（inning/top_bottom/bat_order）を確保する
      - 可能なら batter_id / pitcher_id も埋める（無ければ空）
    """
    canon_path = root / "_data" / "scraped_games" / "canonical" / f"{game_id}.json"
    if not canon_path.is_file():
        return []
    try:
        doc = json.loads(canon_path.read_text(encoding="utf-8"))
    except Exception:
        return []

    pas = doc.get("domain", {}).get("plateAppearances", []) or []
    out: list[dict] = []
    seen: set[tuple[int, str, int]] = set()
    for pa in pas:
        pa_id = str(pa.get("paId") or "").strip()
        m = PAID_PATTERN.match(pa_id)
        if not m:
            continue
        inning = int(m.group(1))
        top_bottom = m.group(2)
        bat_order = int(m.group(3))
        key = (inning, top_bottom, bat_order)
        if key in seen:
            continue
        seen.add(key)
        pitcher_id = str(pa.get("yahooPitcherId") or "").strip()
        if not pitcher_id:
            pe = pa.get("pitchEvents") or []
            if isinstance(pe, list) and len(pe) > 0:
                pitcher_id = str((pe[0] or {}).get("yahooPitcherId") or "").strip()
        batter_id = str(pa.get("yahooBatterId") or "").strip()
        out.append({
            "game_id": game_id,
            "inning": inning,
            "top_bottom": top_bottom,
            "bat_order": bat_order,
            "batter_id": batter_id,
            "pitcher_id": pitcher_id,
        })
    out.sort(key=lambda r: (int(r["inning"]), 0 if r["top_bottom"] == "表" else 1, int(r["bat_order"])))
    return out


def merge_plate_appearance_lists(text_pas: list[dict], canon_pas: list[dict]) -> list[dict]:
    """
    テキスト速報の打席一覧と canonical の打席一覧を和集合にする。
    テキストだけだと打席が欠けることがあり、canonical 側の paId に対応する score を取りこぼす。
    """
    merged: dict[tuple[int, str, int], dict] = {}
    for pa in list(text_pas) + list(canon_pas):
        inn = int(pa["inning"])
        tb = pa["top_bottom"]
        bo = int(pa["bat_order"])
        key = (inn, tb, bo)
        if key not in merged:
            merged[key] = dict(pa)
            continue
        cur = merged[key]
        for fld in ("batter_id", "pitcher_id"):
            if not str(cur.get(fld) or "").strip() and str(pa.get(fld) or "").strip():
                cur[fld] = pa[fld]
    out = list(merged.values())
    out.sort(key=lambda r: (int(r["inning"]), 0 if r["top_bottom"] == "表" else 1, int(r["bat_order"])))
    return out


def pa_summary_from_text_html(html_text: str, inning: int, top_bottom: str, bat_order: int) -> str | None:
    """
    テキスト速報HTMLから、指定イニング・表裏・打席順（その回の何打席目）の要約テキストを返す。
    """
    if not html_text or BeautifulSoup is None:
        return None
    soup = BeautifulSoup(html_text, "lxml")
    target_heading = f"{inning}回{top_bottom}"
    for sec in soup.select("section.bb-liveText"):
        h = sec.select_one("h1.bb-liveText__inning")
        if not h or h.get_text(strip=True) != target_heading:
            continue
        for li in sec.select("ol.bb-liveText__orderedList > li.bb-liveText__item"):
            num_el = li.select_one("p.bb-liveText__number")
            if not num_el:
                continue
            raw = (num_el.get_text() or "").strip().rstrip("：").strip()
            m = re.match(r"^(\d+)", raw)
            if not m:
                continue
            if int(m.group(1)) != bat_order:
                continue
            parts: list[str] = []
            for p in li.select("p.bb-liveText__summary"):
                t = p.get_text(" ", strip=True)
                if t:
                    parts.append(t)
            return " ".join(parts) if parts else None
    return None


def is_intentional_walk_like(summary: str) -> bool:
    """敬遠・故意四球（テキスト上）。"""
    if not summary:
        return False
    return "敬遠" in summary or "故意四球" in summary


def synthetic_intentional_walk_pitch_row(
    game_id: str,
    inning: int,
    top_bottom: str,
    bat_order: int,
    pa: dict,
    summary_text: str,
) -> dict:
    """一球ページに詳細テーブルが無いが、テキストで敬遠と分かる場合の1行（記録上の合成）。"""
    label = "敬遠（故意四球）" if "敬遠" in summary_text else "故意四球"
    return {
        "game_id": game_id,
        "inning": str(inning),
        "top_bottom": top_bottom,
        "bat_order": str(bat_order),
        "pitcher_id": pa.get("pitcher_id") or "",
        "batter_id": pa.get("batter_id") or "",
        "batter_name": "",
        "batter_hand": "",
        "pitch_no": "1",
        "pitch_type": "",
        "speed_kmh": "",
        "result": label,
        "zone_top_px": "",
        "zone_left_px": "",
        "zone_row": "",
        "zone_col": "",
        "zone_id": "",
        "record_kind": "intentional_walk",
        "text_summary": summary_text,
        "source": "text_summary_synthetic",
    }


from yahoo_game_main_cancelled import main_html_cancelled  # noqa: E402
from sportsnavi_schedule_status import is_schedule_cancelled_game  # noqa: E402


def _load_main_html_cancelled(root: Path, game_id: str, year: str = "2026") -> bool:
    schedule_cancelled = is_schedule_cancelled_game(root, year, game_id)
    if schedule_cancelled is True:
        return True
    if schedule_cancelled is False:
        return False

    for rel in (
        ("_data", "scraped_games", "raw_sportsnavi", f"{game_id}.html"),
        ("_data", "scraped_games", "raw_sportsnavi_text", f"{game_id}.html"),
    ):
        p = root.joinpath(*rel)
        if not p.is_file():
            continue
        try:
            if main_html_cancelled(p.read_text(encoding="utf-8"), game_id):
                return True
        except OSError:
            continue
    return False


def main() -> None:
    ap = argparse.ArgumentParser(description="Phase10: 一球ログを取得して derived JSON に保存")
    ap.add_argument("--game-id", default="2021038624", help="試合ID")
    ap.add_argument("--year", default="2026", help="season index の年")
    ap.add_argument("--sleep", type=float, default=1.2, help="打席間の待機秒")
    ap.add_argument(
        "--text-from-raw",
        action="store_true",
        help="ローカル text を優先（raw_sportsnavi_text → raw/{game_id}/text.html、無ければ取得）",
    )
    ap.add_argument("--limit", type=int, default=0, help="打席数上限（0=全件）")
    ap.add_argument(
        "--force",
        action="store_true",
        help="一球 score ページをキャッシュせず再取得（raw_sportsnavi_score の既存 HTML を無視）",
    )
    args = ap.parse_args()

    ensure_yahoo_network_fetch_allowed()

    game_id = args.game_id.strip()
    year = str(args.year).strip() or "2026"
    root = Path(__file__).resolve().parent.parent
    if _load_main_html_cancelled(root, game_id, year):
        safe_print(f"[phase10] skip {game_id}: game cancelled — no pitch-by-pitch to restore")
        sys.exit(0)
    score_cache_dir = root / "_data" / "scraped_games" / "raw_sportsnavi_score" / game_id
    text_url = f"{BASE_URL}/npb/game/{game_id}/text"

    html_text: str | None = None
    if args.text_from_raw:
        html_text = load_text_html(root, game_id)
        if html_text and html_text.strip().startswith("FETCH_FAILED"):
            html_text = None
        elif html_text:
            safe_print("テキスト: ローカル (raw_sportsnavi_text → raw/text)")

    if not html_text:
        safe_print(f"テキスト取得: {text_url}")
        html_text = fetch_html(text_url)
        if not html_text:
            safe_print("❌ テキストページの取得に失敗しました", file=sys.stderr)
            sys.exit(1)

    text_pas = parse_plate_appearances_from_html(html_text, game_id)
    canon_pas = plate_appearances_from_canonical_fallback(root, game_id)
    if canon_pas:
        pas = merge_plate_appearance_lists(text_pas, canon_pas)
        if len(text_pas) == 0:
            safe_print(
                f"⚠️ テキストHTMLから打席一覧を抽出できないため、canonical のみで続行します（{len(pas)} 打席）"
            )
        elif len(pas) > len(text_pas):
            safe_print(
                f"打席一覧: テキスト {len(text_pas)} + canonical 和集合 → {len(pas)} 打席"
            )
        else:
            pas = pas if pas else text_pas
    else:
        pas = text_pas
        if len(pas) == 0:
            safe_print("⚠️ 打席一覧 0 件（テキスト・canonical ともに取得不可）", file=sys.stderr)
    if args.limit > 0:
        pas = pas[: args.limit]
        safe_print(f"打席数（limit）: {len(pas)}")
    else:
        safe_print(f"打席数: {len(pas)}")

    all_rows: list[dict] = []
    missing: list[str] = []
    # 敬遠合成行で pitcher_id が空のとき、同一表・裏で直前打席に確定した投手を引き継ぐ（merge と同じ運用ルール）
    last_pitcher_by_half: dict[str, str] = {}

    for i, pa in enumerate(pas):
        inning = int(pa["inning"])
        top_bottom = pa["top_bottom"]
        bat_order = int(pa["bat_order"])
        half_key = f"{inning}|{top_bottom}"
        index0 = build_index(inning, top_bottom, bat_order)
        safe_print(f"  [{i + 1}/{len(pas)}] {index0} ... ", end="", flush=True)
        pa_stats: dict[str, int] = {}
        chain = fetch_pitch_detail_score_pages_for_pa(
            game_id,
            inning,
            top_bottom,
            bat_order,
            sleep_sec=0.0,
            cache_dir=score_cache_dir,
            force=bool(args.force),
            statistics=pa_stats,
        )
        if not chain:
            missing.append(f"score:{index0}:fetch_failed")
            safe_print("❌ fetch")
            if args.sleep > 0 and pa_stats.get("network_fetches", 0) > 0:
                time.sleep(args.sleep)
            continue
        pages_html = [h for _ix, h in chain]
        rows = parse_pitch_details_merged_score_pages(
            pages_html, game_id, inning, top_bottom, bat_order
        )
        if rows:
            all_rows.extend(rows)
            pid0 = (rows[0].get("pitcher_id") or "").strip()
            if pid0:
                last_pitcher_by_half[half_key] = pid0
            extra = f" ({len(chain)}p)" if len(chain) > 1 else ""
            last_res = (rows[-1].get("result") or "").strip()
            # §6b 取得規定: 末尾がボール／ストライク進行のみ →「次へ」不足の疑い（1ページ）または欠行疑い（複数ページ）
            if _is_intermediate_trailing_result(last_res):
                if len(chain) < 2:
                    missing.append(f"score:{index0}:trailing_intermediate_single_page_next_required")
                else:
                    missing.append(f"score:{index0}:trailing_intermediate_after_multi_page")
                safe_print(f"✅ {len(rows)}球{extra} ⚠️末尾中間→再取得/確認")
            else:
                safe_print(f"✅ {len(rows)}球{extra}")
        else:
            summary = pa_summary_from_text_html(html_text, inning, top_bottom, bat_order)
            if summary and is_intentional_walk_like(summary):
                carry = (pa.get("pitcher_id") or "").strip() or last_pitcher_by_half.get(half_key, "")
                row = synthetic_intentional_walk_pitch_row(
                    game_id, inning, top_bottom, bat_order, pa, summary
                )
                if carry and not (row.get("pitcher_id") or "").strip():
                    row["pitcher_id"] = carry
                all_rows.append(row)
                pcar = (row.get("pitcher_id") or "").strip()
                if pcar:
                    last_pitcher_by_half[half_key] = pcar
                safe_print(f"✅ 敬遠(テキスト) 「{summary[:28]}…」" if len(summary) > 28 else f"✅ 敬遠(テキスト) 「{summary}」")
            elif summary and is_runner_out_ends_half_no_ab(summary):
                missing.append(f"score:{index0}:{PHASE10_MISSING_RUNNER_OUT_NO_AB}")
                safe_print("ℹ️ 走者アウト終了・打者結果なし（投球表なし）")
            else:
                missing.append(f"score:{index0}:no_pitch_rows")
                safe_print("⚠️ 投球なし")
        # score-raw と同様: キャッシュのみの打席では待機しない（日次一括の所要時間短縮）
        if args.sleep > 0 and i < len(pas) - 1 and pa_stats.get("network_fetches", 0) > 0:
            time.sleep(args.sleep)

    out = {
        "schemaVersion": "yahoo-phase10-restored-v1",
        "gameId": game_id,
        "restoredAt": datetime.now(timezone.utc).isoformat(),
        "pitchRows": all_rows,
        "missingOrPartial": missing,
    }
    derived = root / "_data" / "scraped_games" / "derived"
    derived.mkdir(parents=True, exist_ok=True)
    out_path = derived / f"{game_id}_phase10_restored.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    safe_print(f"\nWrote {out_path} (pitch rows={len(all_rows)}, missing={len(missing)})")

    if len(pas) == 0:
        if _load_main_html_cancelled(root, game_id, year):
            safe_print(f"[phase10] skip {game_id}: game cancelled (0 PA expected)")
            sys.exit(0)
        safe_print(
            "[phase10] ERROR: 打席一覧 0 件のまま空 pitchRows を書きました。"
            " Phase2b canonical を先に用意するか --text-from-raw を確認してください。",
            file=sys.stderr,
        )
        sys.exit(2)


if __name__ == "__main__":
    main()
