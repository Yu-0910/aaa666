#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_pitcher_zone_stats.py

指定試合・指定投手について、Yahoo 一球速報のスコアページから
打席ごとに「詳しい投球内容」を取得し、打者利き腕別（対右/対左）の
コース別（25マス）投球成績を集計して JSON を出力する。

使い方:
  python scripts/fetch_pitcher_zone_stats.py --game-id 2021040084 --pitcher-id 2103788
  python scripts/fetch_pitcher_zone_stats.py --game-id 2021040084 --pitcher-id 2103788 --out-dir _data/yahoo_games_pilot
"""

import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("❌ pip install requests beautifulsoup4 lxml")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from scrape_yahoo_pitch_details import fetch_html, build_index, parse_pitch_details
from fetch_game_pitch_types import parse_plate_appearances_from_html
from yahoo_scrape_guard import ensure_yahoo_network_fetch_allowed

BASE_URL = "https://baseball.yahoo.co.jp"


def _normalize_name(s: str) -> str:
    """名前の正規化: 全角→半角、髙→高、空白除去"""
    s = (s or "").strip()
    s = s.replace("　", " ").replace("髙", "高")
    return s


def _name_variants(name: str) -> list[str]:
    """照合用の名前バリエーション（スペースあり・なし等）"""
    n = _normalize_name(name)
    if not n:
        return []
    variants = [n]
    no_space = re.sub(r"\s+", "", n)
    if no_space != n:
        variants.append(no_space)
    return variants


def _roster_name_variants(name: str) -> list[str]:
    """
    名簿側の名前バリエーション。外国人選手は「Ｃ．ディベイニー」「ディベイニー」の両方で拾えるようにする。
    """
    variants = list(_name_variants(name))
    n = _normalize_name(name)
    if not n:
        return variants
    # 外国人選手: 「Ａ．姓」「Ｃ．ディベイニー」形式 → 「姓」「ディベイニー」も追加（．は全角・半角両対応）
    m = re.match(r"^[Ａ-Ｚa-zA-Z][．.]\s*(.+)$", n)
    if m:
        suffix = m.group(1).strip()
        if suffix and suffix not in variants:
            variants.append(suffix)
    return variants


def load_roster_bat_hand(root: Path) -> dict[str, str]:
    """npb_roster_2026.csv から name_ja -> bat_hand の辞書を構築。L/R/B -> 左/右/両 に変換"""
    roster_path = root / "_data" / "npb_roster_2026.csv"
    if not roster_path.exists():
        return {}
    lookup: dict[str, str] = {}
    with open(roster_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = (row.get("name_ja") or "").strip()
            bat = (row.get("bat_hand") or "").strip().upper()
            if not name or not bat:
                continue
            val = "左" if bat == "L" else ("右" if bat == "R" else ("両" if bat == "B" else ""))
            if not val:
                continue
            for v in _roster_name_variants(name):
                lookup[v] = val
    return lookup


def resolve_batter_hand(
    batter_hand: str, batter_name: str, roster: dict[str, str]
) -> tuple[str, bool]:
    """
    打者利き腕を解決。名簿で補完。
    Returns: (hand, was_resolved_from_roster)
    """
    hand = (batter_hand or "").strip()
    if hand in ("左", "右", "両"):
        return hand, False
    if not roster or not (batter_name or "").strip():
        return "", True  # 不明
    for v in _name_variants(batter_name):
        h = roster.get(v)
        if h:
            return h, True
    return "", True  # 名簿に未登録


def is_settlement_result(r: str) -> bool:
    s = (r or "").strip()
    # 飛球: 左飛・中飛・右飛・二飛(二塁飛)・邪飛(捕邪飛・三邪飛等)
    if re.match(r"^(左飛|中飛|右飛|二飛|一飛|レフトフライ|センターフライ|ライトフライ|フライ)$", s):
        return True
    if re.search(r"邪飛|ゴロ|ライナー|併殺", s):
        return True
    if re.match(r"^(空振り|見逃し)", s):
        return True
    if re.search(r"三振|空三振|見三振", s):
        return True
    if re.search(r"安打|ヒット|二塁打|三塁打|本塁打", s):
        return True
    if re.match(r"^(左安|右安|中安)", s):
        return True
    if re.match(r"^(左２|右２|中２|左３|右３|中３)", s):
        return True
    return False


def is_hit(r: str) -> bool:
    s = (r or "").strip()
    # 左安・右安・中安・左２(二塁打)・右２・中２・二塁打・三塁打・本塁打・安打・ヒット 等
    return bool(
        re.match(r"^(左安|右安|中安|左２|右２|中２|二塁|三塁|本塁|ソロ|満塁)", s)
        or re.search(r"安打|ヒット|二塁打|三塁打|本塁打", s)
    )


def get_total_bases(r: str) -> int:
    s = (r or "").strip()
    if re.search(r"本塁打|ホームラン|HR", s, re.I):
        return 4
    if "三塁打" in s or re.match(r"^(左３|右３|中３)", s):
        return 3
    if "二塁打" in s or re.match(r"^(左２|右２|中２)", s):
        return 2
    if is_hit(s):
        return 1
    return 0


def is_walk(r: str) -> bool:
    return bool(re.search(r"四球|敬遠|故意四球", (r or "").strip()))


def is_hbp(r: str) -> bool:
    return "死球" in (r or "").strip()


def is_sf(r: str) -> bool:
    return "犠飛" in (r or "").strip()


def is_home_run(r: str) -> bool:
    return bool(re.search(r"本塁打|ホームラン|HR", (r or "").strip(), re.I))


def aggregate_zone_by_hand(
    all_pitches: list[dict],
    pitcher_id: str,
    roster_bat_hand: dict[str, str] | None = None,
    debug_unmatched: list[tuple[str, str]] | None = None,
) -> dict:
    """
    投球リストを打者利き腕別・ゾーン別に集計。
    両打者は対右・対左の両方に加算。
    batter_hand が空の場合は roster_bat_hand（名簿）で補完。
    debug_unmatched: 名簿に未照合の打者を (打席key, batter_name) で追加
    """
    roster_bat_hand = roster_bat_hand or {}
    pitch_count: dict[str, dict[int, int]] = {"vsRight": {}, "vsLeft": {}}
    by_zone: dict[str, dict[int, dict]] = {"vsRight": {}, "vsLeft": {}}

    # 打席ごとにグループ化 (inning, top_bottom, bat_order)
    pa_blocks: dict[tuple, list[dict]] = {}
    for p in all_pitches:
        if p.get("pitcher_id") != pitcher_id:
            continue
        key = (p.get("inning"), p.get("top_bottom"), p.get("bat_order"))
        if key not in pa_blocks:
            pa_blocks[key] = []
        pa_blocks[key].append(p)

    for key, pitches in pa_blocks.items():
        if not pitches:
            continue
        batter_hand_raw = (pitches[0].get("batter_hand") or "").strip()
        batter_name = (pitches[0].get("batter_name") or "").strip()
        hand, from_roster = resolve_batter_hand(batter_hand_raw, batter_name, roster_bat_hand)
        if not hand and debug_unmatched is not None:
            pa_key = f"{key[0]}{key[1]} {key[2]}番"
            debug_unmatched.append((pa_key, batter_name or "(名前なし)"))
        if hand == "両":
            hands = ["vsRight", "vsLeft"]
        elif hand == "右":
            hands = ["vsRight"]
        elif hand == "左":
            hands = ["vsLeft"]
        else:
            hands = ["vsRight"]  # 不明時は対右に

        for p in pitches:
            zid = 0
            try:
                zid = int(p.get("zone_id") or 0)
            except (ValueError, TypeError):
                pass
            if 1 <= zid <= 25:
                for h in hands:
                    pitch_count[h][zid] = pitch_count[h].get(zid, 0) + 1

        sorted_pitches = sorted(pitches, key=lambda x: int(x.get("pitch_no") or 0))
        last = sorted_pitches[-1]
        result = (last.get("result") or "").strip()

        # 決着球の zone_id を使用。無い場合は打席内で有効な zone を持つ最後の投球を使用
        zid = 0
        try:
            zid = int(last.get("zone_id") or 0)
        except (ValueError, TypeError):
            pass
        if zid < 1 or zid > 25:
            for p in reversed(sorted_pitches[:-1]):
                try:
                    z = int(p.get("zone_id") or 0)
                    if 1 <= z <= 25:
                        zid = z
                        break
                except (ValueError, TypeError):
                    pass
        if zid < 1 or zid > 25:
            continue

        is_settle = is_settlement_result(result) or is_walk(result) or is_hbp(result) or is_sf(result)
        if not is_settle:
            continue

        for h in hands:
            if zid not in by_zone[h]:
                by_zone[h][zid] = {"ab": 0, "h": 0, "hr": 0, "tb": 0, "bb": 0, "hbp": 0, "sf": 0}

            rec = by_zone[h][zid]
            if is_walk(result):
                rec["bb"] += 1
            elif is_hbp(result):
                rec["hbp"] += 1
            elif is_sf(result):
                rec["sf"] += 1
            elif is_settlement_result(result):
                rec["ab"] += 1
                if is_hit(result):
                    rec["h"] += 1
                    rec["tb"] += get_total_bases(result)
                    if is_home_run(result):
                        rec["hr"] += 1

    result: dict[str, list[dict]] = {"vsRight": [], "vsLeft": []}
    for hand in ["vsRight", "vsLeft"]:
        for z in range(1, 26):
            pitches = pitch_count[hand].get(z, 0)
            rec = by_zone[hand].get(z, {"ab": 0, "h": 0, "hr": 0, "tb": 0, "bb": 0, "hbp": 0, "sf": 0})
            ab, h, hr, tb, bb, hbp, sf = rec["ab"], rec["h"], rec["hr"], rec["tb"], rec["bb"], rec["hbp"], rec["sf"]

            avg = f"{(h / ab):.3f}" if ab > 0 else "—"
            pa = ab + bb + hbp + sf
            obp = (h + bb + hbp) / pa if pa > 0 else 0
            slg = tb / ab if ab > 0 else 0
            ops_val = obp + slg
            ops = f"{ops_val:.3f}" if pa > 0 else "—"

            result[hand].append({
                "zoneId": z,
                "pitches": pitches,
                "ab": ab,
                "h": h,
                "hr": hr,
                "ops": ops,
                "avg": avg,
            })
    return result


def main():
    parser = argparse.ArgumentParser(
        description="指定試合・投手のコース別投球成績（対右/対左）を取得しJSON出力"
    )
    parser.add_argument("--game-id", required=True, help="試合ID (例: 2021040084)")
    parser.add_argument("--pitcher-id", required=True, help="投手のYahoo ID (例: 2103788)")
    parser.add_argument("--out-dir", default="_data/yahoo_games_pilot", help="JSON出力ディレクトリ")
    parser.add_argument("--sleep", type=float, default=1.2, help="リクエスト間隔(秒)")
    parser.add_argument("--debug", action="store_true", help="決着球の結果を表示（デバッグ用）")
    parser.add_argument("--save-debug", action="store_true", help="全投球の生データをJSONに保存（デバッグ用）")
    parser.add_argument("--from-debug", action="store_true", help="debug_pitches JSON から再集計（再取得なし）")

    args = parser.parse_args()

    ensure_yahoo_network_fetch_allowed(skip_network=args.from_debug)

    root = Path(__file__).resolve().parent.parent
    out_dir = root / args.out_dir.strip()
    out_dir.mkdir(parents=True, exist_ok=True)

    game_id = args.game_id.strip()
    pitcher_id = args.pitcher_id.strip()

    if args.from_debug:
        debug_path = out_dir / f"debug_pitches_{game_id}_{pitcher_id}.json"
        if not debug_path.exists():
            print(f"❌ debug_pitches が見つかりません: {debug_path}")
            print("   先に --save-debug 付きで実行してください")
            sys.exit(1)
        with open(debug_path, encoding="utf-8") as f:
            all_pitches = json.load(f)
        print(f"📂 debug_pitches 読み込み: {len(all_pitches)} 投球")
    else:
        text_url = f"{BASE_URL}/npb/game/{game_id}/text"
        print(f"📥 打席一覧取得: {text_url}")
        html_text = fetch_html(text_url)
        if not html_text:
            print("❌ テキストページの取得に失敗しました")
            sys.exit(1)

        pas = parse_plate_appearances_from_html(html_text, game_id)
        pas_for_pitcher = [pa for pa in pas if pa.get("pitcher_id") == pitcher_id]
        print(f"   打席数（該当投手）: {len(pas_for_pitcher)}")

        if not pas_for_pitcher:
            print("❌ 該当投手の打席がありません")
            sys.exit(1)

        all_pitches = []
        for i, pa in enumerate(pas_for_pitcher):
            inning = int(pa["inning"])
            top_bottom = pa["top_bottom"]
            bat_order = int(pa["bat_order"])
            index = build_index(inning, top_bottom, bat_order)
            url = f"{BASE_URL}/npb/game/{game_id}/score?index={index}"
            print(f"  [{i+1}/{len(pas_for_pitcher)}] {inning}{top_bottom} {bat_order}番 ... ", end="", flush=True)
            html = fetch_html(url)
            if not html:
                print("❌")
                time.sleep(args.sleep)
                continue
            rows = parse_pitch_details(html, game_id, inning, top_bottom, bat_order)
            if rows:
                all_pitches.extend(rows)
                hands = rows[0].get("batter_hand", "?")
                print(f"✅ {len(rows)}球 (打者:{hands})")
            else:
                print("⚠️ 投球なし")
            time.sleep(args.sleep)

        if not all_pitches:
            print("❌ 取得した投球が1球もありません")
            sys.exit(1)

    roster_bat_hand = load_roster_bat_hand(root)
    if roster_bat_hand:
        print(f"   名簿: {len(roster_bat_hand)} 件の打者利き腕を読み込み（batter_hand 補完用）")

    if args.debug or args.save_debug or args.from_debug:
        pa_blocks_debug: dict[tuple, list[dict]] = {}
        for p in all_pitches:
            if p.get("pitcher_id") != pitcher_id:
                continue
            key = (p.get("inning"), p.get("top_bottom"), p.get("bat_order"))
            if key not in pa_blocks_debug:
                pa_blocks_debug[key] = []
            pa_blocks_debug[key].append(p)
        if args.debug or args.from_debug:
            print("\n[DEBUG] 決着球の結果一覧:")
            for key, pitches in sorted(pa_blocks_debug.items()):
                last = sorted(pitches, key=lambda x: int(x.get("pitch_no") or 0))[-1]
                result = (last.get("result") or "").strip()
                zid = last.get("zone_id") or ""
                is_h = is_hit(result)
                is_settle = is_settlement_result(result)
                print(f"  {key[0]}{key[1]} {key[2]}番: result={result!r} zone={zid} is_hit={is_h} is_settle={is_settle}")
        if args.save_debug:
            debug_path = out_dir / f"debug_pitches_{game_id}_{pitcher_id}.json"
            with open(debug_path, "w", encoding="utf-8") as f:
                json.dump(all_pitches, f, ensure_ascii=False, indent=2)
            print(f"\n[DEBUG] 全投球データ保存: {debug_path}")

    debug_unmatched: list[tuple[str, str]] | None = [] if (args.debug or args.from_debug) else None
    aggregated = aggregate_zone_by_hand(
        all_pitches, pitcher_id, roster_bat_hand, debug_unmatched=debug_unmatched
    )
    if debug_unmatched:
        print("\n[DEBUG] 名簿に未照合の打者（対右に分類）:")
        for pa_key, name in debug_unmatched:
            print(f"  {pa_key}: {name}")

    out_data = {
        "game_id": game_id,
        "pitcher_id": pitcher_id,
        "vsRight": aggregated["vsRight"],
        "vsLeft": aggregated["vsLeft"],
    }

    out_path = out_dir / f"zone_stats_{game_id}_{pitcher_id}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out_data, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 完了: コース別成績（対右 {len(aggregated['vsRight'])} ゾーン、対左 {len(aggregated['vsLeft'])} ゾーン）")
    print(f"   出力: {out_path.absolute()}")


if __name__ == "__main__":
    main()
