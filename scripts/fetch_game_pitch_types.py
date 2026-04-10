#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_game_pitch_types.py

指定試合・指定投手について、Yahoo 一球速報のスコアページから
打席ごとに「詳しい投球内容」を取得し、球種別に集計して JSON を出力する。

使い方:
  python scripts/fetch_game_pitch_types.py --game-id 2021040084 --pitcher-id 2103788
  python scripts/fetch_game_pitch_types.py --game-id 2021040084 --pitcher-id 2103788 --out-dir _data/yahoo_games_pilot
"""

import argparse
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

# 同じディレクトリの scrape_yahoo_pitch_details から取得・パースを流用
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from scrape_yahoo_pitch_details import fetch_html, build_index, parse_pitch_details
from yahoo_scrape_guard import ensure_yahoo_network_fetch_allowed

BASE_URL = "https://baseball.yahoo.co.jp"
PLAYER_ID_PATTERN = re.compile(r"/npb/player/(\d+)/top")
INNING_PATTERN = re.compile(r"^(\d+)回(表|裏)$")


def parse_plate_appearances_from_html(html: str, game_id: str) -> list[dict]:
    """テキスト速報HTMLから打席一覧を抽出（pitcher_id 付き）"""
    soup = BeautifulSoup(html, "lxml")

    def find_home_away(s):
        title = s.find("title")
        if not title:
            return "", ""
        t = title.get_text()
        vs = re.search(r"\d{4}年\d{1,2}月\d{1,2}日\s*(.+?)vs\.?(.+?)(?:\s+[一試]|\s+-|$)", t)
        if vs:
            return vs.group(1).strip(), vs.group(2).strip()
        return "", ""

    def find_starting_pitchers(s):
        home_sp, away_sp = "", ""
        for section in s.find_all("section", class_="bb-liveText"):
            head = section.find("h1", class_="bb-liveText__inning")
            if not head or "試合前" not in (head.get_text() or ""):
                continue
            for p in section.find_all("p", class_="bb-liveText__summary"):
                if "先発" not in (p.get_text() or "") and "ピッチャー" not in (p.get_text() or ""):
                    continue
                links = p.find_all("a", href=PLAYER_ID_PATTERN)
                if len(links) >= 2:
                    m1 = PLAYER_ID_PATTERN.search(links[0].get("href", ""))
                    m2 = PLAYER_ID_PATTERN.search(links[1].get("href", ""))
                    if m1:
                        home_sp = m1.group(1)
                    if m2:
                        away_sp = m2.group(1)
                elif len(links) == 1:
                    m = PLAYER_ID_PATTERN.search(links[0].get("href", ""))
                    if m:
                        home_sp = m.group(1)
                break
            break
        return home_sp, away_sp

    home_team, away_team = find_home_away(soup)
    home_pitcher, away_pitcher = find_starting_pitchers(soup)

    rows = []
    current_inning = 0
    current_top_bottom = ""
    current_home_pitcher = home_pitcher
    current_away_pitcher = away_pitcher
    first_inning_done = False

    for section in soup.find_all("section", class_="bb-liveText"):
        head = section.find("h1", class_="bb-liveText__inning")
        if head:
            inn_text = head.get_text().strip()
            mm = INNING_PATTERN.match(inn_text)
            if mm:
                current_inning = int(mm.group(1))
                current_top_bottom = mm.group(2)
                if not first_inning_done:
                    current_home_pitcher = home_pitcher
                    current_away_pitcher = away_pitcher
                    first_inning_done = True

        for li in section.find_all("li", class_="bb-liveText__item"):
            content = li.find("div", class_="bb-liveText__content")
            if not content:
                continue

            for summ in content.find_all("p", class_="bb-liveText__summary"):
                cls = summ.get("class") or []
                if "bb-liveText__summary--change" in cls and "投手交代" in (summ.get_text() or ""):
                    links = summ.find_all("a", href=PLAYER_ID_PATTERN)
                    if len(links) >= 2:
                        pm = PLAYER_ID_PATTERN.search(links[-1].get("href", ""))
                        if pm:
                            new_pid = pm.group(1)
                            if current_top_bottom == "表":
                                current_home_pitcher = new_pid
                            else:
                                current_away_pitcher = new_pid
                    elif len(links) == 1:
                        pm = PLAYER_ID_PATTERN.search(links[0].get("href", ""))
                        if pm:
                            new_pid = pm.group(1)
                            if current_top_bottom == "表":
                                current_home_pitcher = new_pid
                            else:
                                current_away_pitcher = new_pid
                    break

            pitcher_id = current_home_pitcher if current_top_bottom == "表" else current_away_pitcher

            num_el = content.find("p", class_="bb-liveText__number")
            # 打席番号ブロックが存在しない行は打席として扱わない（実況テキストなど）
            if num_el is None:
                continue
            bat_num = (num_el.get_text() or "").strip().rstrip("：").strip()
            try:
                bat_order_int = int(bat_num) if bat_num.isdigit() else 1
            except ValueError:
                bat_order_int = 1

            batter_el = content.find("p", class_="bb-liveText__batter")
            batter_id = ""
            if batter_el:
                a = batter_el.find("a", href=PLAYER_ID_PATTERN)
                if a:
                    m = PLAYER_ID_PATTERN.search(a.get("href", ""))
                    if m:
                        batter_id = m.group(1)

            if current_inning == 0:
                continue
            if not batter_id:
                continue
            if "先発" in (content.get_text() or "") or "スタメン" in (content.get_text() or ""):
                continue

            rows.append({
                "game_id": game_id,
                "inning": current_inning,
                "top_bottom": current_top_bottom,
                "bat_order": bat_order_int,
                "batter_id": batter_id,
                "pitcher_id": pitcher_id,
            })

    return rows


def is_settlement_result(r: str) -> bool:
    s = (r or "").strip()
    if re.match(r"^(左飛|中飛|右飛|レフトフライ|センターフライ|ライトフライ|フライ)$", s):
        return True
    if re.search(r"ゴロ|ライナー|併殺", s):
        return True
    if re.match(r"^(空振り|見逃し)", s):
        return True
    if re.search(r"三振|空三振|見三振", s):
        return True
    if re.search(r"安打|ヒット|二塁打|三塁打|本塁打", s):
        return True
    return False


def is_hit(r: str) -> bool:
    s = (r or "").strip()
    return bool(re.match(r"^(左安|右安|中安|二塁|三塁|本塁|ソロ|満塁)", s) or re.search(r"安打|ヒット", s))


def get_total_bases(r: str) -> int:
    s = (r or "").strip()
    if re.search(r"本塁打|ホームラン|HR", s, re.I):
        return 4
    if "三塁打" in s:
        return 3
    if "二塁打" in s:
        return 2
    if is_hit(s):
        return 1
    return 0


def is_strikeout(r: str) -> bool:
    s = (r or "").strip()
    return bool(re.match(r"^空振り|^見逃し", s) or re.search(r"三振|空三振|見三振", s))


def is_walk(r: str) -> bool:
    return bool(re.search(r"四球|敬遠|故意四球", (r or "").strip()))


def is_hbp(r: str) -> bool:
    return "死球" in (r or "").strip()


def is_sf(r: str) -> bool:
    return "犠飛" in (r or "").strip()


def format_ops(ab: int, h: int, tb: int, bb: int, hbp: int, sf: int) -> str:
    obp_denom = ab + bb + hbp + sf
    if obp_denom <= 0 and ab <= 0:
        return "—"
    obp = (h + bb + hbp) / obp_denom if obp_denom > 0 else 0.0
    slg = (tb / ab) if ab > 0 else 0.0
    return f"{(obp + slg):.3f}"


def aggregate_by_pitch_type(all_pitch_rows: list[dict]) -> tuple[list[dict], dict]:
    """打席ごとの投球リストを球種別に集計（1 PA = 1 list of pitches）。戻り値は (行, settlement_by_type)。"""
    if not all_pitch_rows:
        return [], {}

    by_type = {}
    for p in all_pitch_rows:
        pt = (p.get("pitch_type") or "").strip() or "不明"
        if pt not in by_type:
            by_type[pt] = []
        by_type[pt].append(p)

    # 打席単位で「最終球」を決着球としてその球種に AB/H/HR/SO/BB/HBP を付与
    # all_pitch_rows は打席ごとの blocks に分かれていないので、同じ (inning, top_bottom, bat_order) でまとめる
    pa_blocks = {}
    for p in all_pitch_rows:
        key = (p.get("inning"), p.get("top_bottom"), p.get("bat_order"))
        if key not in pa_blocks:
            pa_blocks[key] = []
        pa_blocks[key].append(p)

    settlement_by_type = {}
    for key, pitches in pa_blocks.items():
        if not pitches:
            continue
        last = sorted(pitches, key=lambda x: int(x.get("pitch_no") or 0))[-1]
        pt = (last.get("pitch_type") or "").strip() or "不明"
        if pt not in settlement_by_type:
            settlement_by_type[pt] = {"ab": 0, "h": 0, "hr": 0, "tb": 0, "so": 0, "bb": 0, "hbp": 0, "sf": 0}
        rec = settlement_by_type[pt]
        result = (last.get("result") or "").strip()
        if is_settlement_result(result):
            rec["ab"] += 1
            if is_hit(result):
                rec["h"] += 1
                rec["tb"] += get_total_bases(result)
                if get_total_bases(result) == 4:
                    rec["hr"] += 1
        if is_strikeout(result):
            rec["so"] += 1
        if is_walk(result):
            rec["bb"] += 1
        if is_hbp(result):
            rec["hbp"] += 1
        if is_sf(result):
            rec["sf"] += 1

    total_pitches = len(all_pitch_rows)
    result_rows = []

    for pitch_type, pitches in by_type.items():
        n = len(pitches)
        set_rec = settlement_by_type.get(pitch_type, {"ab": 0, "h": 0, "hr": 0, "tb": 0, "so": 0, "bb": 0, "hbp": 0, "sf": 0})
        balls = sum(1 for p in pitches if re.match(r"^ボール", (p.get("result") or "").strip()))
        swing_miss = sum(1 for p in pitches if re.match(r"^空振り", (p.get("result") or "").strip()))
        taken = sum(1 for p in pitches if re.match(r"^見逃し", (p.get("result") or "").strip()))
        foul = sum(1 for p in pitches if re.match(r"^ファウル", (p.get("result") or "").strip()))
        in_play = set_rec["ab"] - set_rec["so"]
        strikes = swing_miss + taken + foul + in_play
        strike_pct = f"{(strikes / n * 100):.1f}%" if n else "—"
        swing_total = swing_miss + foul + set_rec["ab"]
        whiff_pct = f"{(swing_miss / swing_total * 100):.1f}%" if swing_total else "—"
        ab = set_rec["ab"]
        avg = f"{(set_rec['h'] / ab):.3f}" if ab else "—"
        ops = format_ops(ab, set_rec["h"], set_rec["tb"], set_rec["bb"], set_rec["hbp"], set_rec["sf"])
        speeds = [int(p["speed_kmh"]) for p in pitches if p.get("speed_kmh") and str(p["speed_kmh"]).isdigit()]
        avg_speed = round(sum(speeds) / len(speeds), 1) if speeds else None

        result_rows.append({
            "pitch_type": pitch_type,
            "pitches": n,
            "pct": round(n / total_pitches * 100, 1) if total_pitches else 0,
            "avg_speed_kmh": avg_speed,
            "swing_miss": swing_miss,
            "taken": taken,
            "foul": foul,
            "balls": balls,
            "strike_pct": strike_pct,
            "whiff_pct": whiff_pct,
            "avg": avg,
            "ops": ops,
            "ab": ab,
            "h": set_rec["h"],
            "hr": set_rec["hr"],
            "so": set_rec["so"],
            "bb": set_rec["bb"],
            "hbp": set_rec["hbp"],
        })

    result_rows.sort(key=lambda x: -x["pitches"])
    return result_rows, settlement_by_type


def main():
    parser = argparse.ArgumentParser(description="試合・投手指定で球種別成績を取得しJSON出力")
    parser.add_argument("--game-id", required=True, help="試合ID (例: 2021040084)")
    parser.add_argument("--pitcher-id", required=True, help="投手のYahoo ID (例: 2103788)")
    parser.add_argument("--out-dir", default="_data/yahoo_games_pilot", help="JSON出力ディレクトリ")
    parser.add_argument("--sleep", type=float, default=1.2, help="リクエスト間隔(秒)")
    args = parser.parse_args()

    ensure_yahoo_network_fetch_allowed()

    root = Path(__file__).resolve().parent.parent
    out_dir = root / args.out_dir.strip()
    out_dir.mkdir(parents=True, exist_ok=True)

    game_id = args.game_id.strip()
    pitcher_id = args.pitcher_id.strip()

    # 1) 試合テキストページで打席一覧取得
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

    # 2) 各打席のスコアページを取得し、投球詳細をパース
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
            print(f"✅ {len(rows)}球")
        else:
            print("⚠️ 投球なし")
        time.sleep(args.sleep)

    if not all_pitches:
        print("❌ 取得した投球が1球もありません")
        sys.exit(1)

    # 3) 球種別に集計
    aggregated, settlement_by_type = aggregate_by_pitch_type(all_pitches)
    total_pitches = len(all_pitches)
    total_ab = sum(r["ab"] for r in aggregated)
    total_h = sum(r["h"] for r in aggregated)
    total_hr = sum(r["hr"] for r in aggregated)
    total_so = sum(r["so"] for r in aggregated)
    total_bb = sum(r["bb"] for r in aggregated)
    total_hbp = sum(r["hbp"] for r in aggregated)
    total_tb = sum(rec["tb"] for rec in settlement_by_type.values())
    total_sf = sum(rec["sf"] for rec in settlement_by_type.values())
    total_avg = f"{(total_h / total_ab):.3f}" if total_ab else "—"
    total_ops = format_ops(total_ab, total_h, total_tb, total_bb, total_hbp, total_sf)
    total_strikes = sum(r["swing_miss"] + r["taken"] + r["foul"] + (r["ab"] - r["so"]) for r in aggregated)
    total_swing_miss = sum(r["swing_miss"] for r in aggregated)
    total_swing_denom = sum(r["swing_miss"] + r["foul"] + r["ab"] for r in aggregated)
    total_whiff = f"{(total_swing_miss / total_swing_denom * 100):.1f}%" if total_swing_denom else "—"

    out_data = {
        "game_id": game_id,
        "pitcher_id": pitcher_id,
        "pitches_total": total_pitches,
        "rows": aggregated,
        "total_row": {
            "pitch_type": "合計",
            "pitches": total_pitches,
            "pct": 100.0,
            "avg_speed_kmh": None,
            "swing_miss": total_swing_miss,
            "taken": sum(r["taken"] for r in aggregated),
            "foul": sum(r["foul"] for r in aggregated),
            "balls": sum(r["balls"] for r in aggregated),
            "strike_pct": f"{(total_strikes / total_pitches * 100):.1f}%" if total_pitches else "—",
            "whiff_pct": total_whiff,
            "avg": total_avg,
            "ops": total_ops,
            "ab": total_ab,
            "h": total_h,
            "hr": total_hr,
            "so": total_so,
            "bb": total_bb,
            "hbp": total_hbp,
        },
    }

    out_path = out_dir / f"pitch_by_type_{game_id}_{pitcher_id}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out_data, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 完了: 球種別 {len(aggregated)} 行 + 合計")
    print(f"   出力: {out_path.absolute()}")


if __name__ == "__main__":
    main()
