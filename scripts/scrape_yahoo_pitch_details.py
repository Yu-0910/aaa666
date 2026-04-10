#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scrape_yahoo_pitch_details.py

Yahoo!一球速報の「詳しい投球内容」から、球種・コース(25マス)・球速・結果を取得する。

- 打席ごとに /game/{id}/score?index={index} を取得
- index形式: IIBT00  (II=イニング01-09, B=1表/2裏, T=打者番号01-09, 00=固定)
- 出力: pitch_details.csv (game_id, inning, top_bottom, bat_order, pitcher_id, batter_id, pitch_no, pitch_type, speed_kmh, result, zone_top_px, zone_left_px, zone_row, zone_col, zone_id)
"""

import argparse
import csv
import re
import sys
import time
import io
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("❌ エラー: pip install requests beautifulsoup4 lxml")
    sys.exit(1)

BASE_URL = "https://baseball.yahoo.co.jp"
PLAYER_ID_PATTERN = re.compile(r"/npb/player/(\d+)/top")


def build_index(inning: int, top_bottom: str, bat_order: int) -> str:
    """
    打席を指定して index パラメータを生成。
    形式: IIBT00 (II=イニング01-09, B=1表/2裏, T=打者番号01-09, 00=固定)
    例: 1回表1番 → 0110100, 1回裏2番 → 0120200
    """
    tb = "1" if top_bottom == "表" else "2"
    return f"{inning:02d}{tb}{bat_order:02d}00"


def fetch_html(url: str) -> str | None:
    """HTMLを取得（UTF-8）"""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        r = requests.get(url, headers=headers, timeout=30)
        r.raise_for_status()
        r.encoding = "utf-8"
        return r.text
    except Exception as e:
        print(f"  ❌ 取得失敗: {url} - {e}")
        return None


def px_to_zone_25(top_px: float, left_px: float) -> tuple[int, int, int]:
    """
    ピクセル座標を25マスゾーンに変換。
    ゾーンチャートは投手目線（投手がマウンドから見る視点）。打者左右で寸法が異なる場合あり。5x5グリッド。
    row 0=高め, 4=低め / col 0=内角側, 4=外角側（内角・外角は打者基準。右打者なら図左=内角、左打者なら図右=内角）
    zone_id: 1-25 (row*5 + col + 1)
    """
    # 座標範囲（Yahooのゾーンチャート: 右打者幅狭め、左打者幅広め）
    top_min, top_max = 0, 170
    left_min, left_max = -10, 160
    top_px = max(top_min, min(top_max, top_px))
    left_px = max(left_min, min(left_max, left_px))

    row = int(5 * (top_px - top_min) / (top_max - top_min))
    row = min(4, max(0, row))
    col = int(5 * (left_px - left_min) / (left_max - left_min))
    col = min(4, max(0, col))
    zone_id = row * 5 + col + 1
    return row, col, zone_id


def parse_pitch_details(html: str, game_id: str, inning: int, top_bottom: str, bat_order: int) -> list[dict]:
    """
    詳しい投球内容のHTMLをパースし、投球リストを返す。
    """
    soup = BeautifulSoup(html, "lxml")
    rows: list[dict] = []

    # 投手・打者ID・打者名・打者利き腕を取得（#gm_rslt の選手リンクから）
    # 注意: #gm_rslt は回/表示状態により見出し順が「投手 | 打者」または「打者 | 投手」になり得る。
    # リンクの出現順に依存すると投手/打者が入れ替わるため、可能なら見出し順を読んで割り当てる。
    pitcher_id = ""
    batter_id = ""
    batter_name = ""  # 名簿照合用
    batter_hand = ""  # 左打/右打/両打 → 対左/対右の分類用
    pitcher_batter_table = soup.find("table", id="gm_rslt")
    if pitcher_batter_table:
        def _extract_two_players_in_row(tr) -> list[tuple[str, str]]:
            links: list[tuple[str, str]] = []
            for a in tr.find_all("a", href=PLAYER_ID_PATTERN):
                mid = PLAYER_ID_PATTERN.search(a.get("href", ""))
                if mid:
                    links.append((mid.group(1), (a.get_text() or "").strip()))
            return links

        # 見出し行（th）から列順を推定
        header_labels: list[str] = []
        for tr in pitcher_batter_table.find_all("tr"):
            ths = tr.find_all("th")
            if not ths:
                continue
            texts = [th.get_text(strip=True) for th in ths]
            if any(t in ("投手", "打者") for t in texts):
                header_labels = [t for t in texts if t in ("投手", "打者")]
                break

        # 選手リンク行（2人）を探す（余計なリンクが混ざりやすいので tr 単位で見る）
        pair: list[tuple[str, str]] = []
        for tr in pitcher_batter_table.find_all("tr"):
            cand = _extract_two_players_in_row(tr)
            if len(cand) >= 2:
                pair = cand[:2]
                break

        if len(pair) == 2:
            first_id, first_name = pair[0]
            second_id, second_name = pair[1]
            if header_labels == ["投手", "打者"]:
                pitcher_id = first_id
                batter_id, batter_name = second_id, second_name
            elif header_labels == ["打者", "投手"]:
                batter_id, batter_name = first_id, first_name
                pitcher_id = second_id
            else:
                # 見出しが取れない場合は、ページにより順序が揺れるため safest fallback として
                # 「投手と思しき方」に投手IDが入るよう、セル内の投/打表記を使う（取れなければ従来順）
                table_text = pitcher_batter_table.get_text()
                if "投手" in table_text and "打者" in table_text and table_text.find("投手") < table_text.find("打者"):
                    pitcher_id = first_id
                    batter_id, batter_name = second_id, second_name
                else:
                    batter_id, batter_name = first_id, first_name
                    pitcher_id = second_id
        else:
            # 最低限のフォールバック（1人しか取れない場合）
            player_links: list[tuple[str, str]] = []
            for a in pitcher_batter_table.find_all("a", href=PLAYER_ID_PATTERN):
                mid = PLAYER_ID_PATTERN.search(a.get("href", ""))
                if mid:
                    player_links.append((mid.group(1), (a.get_text() or "").strip()))
            if len(player_links) >= 2:
                batter_id, batter_name = player_links[0][0], player_links[0][1]
                pitcher_id = player_links[1][0]
            elif len(player_links) == 1:
                batter_id, batter_name = player_links[0][0], player_links[0][1]
        # 打者利き腕: 左打/右打/両打 をテーブル内から検索（左投/右投と区別するため「打」を含む形で検索）
        table_text = pitcher_batter_table.get_text()
        if "左打" in table_text:
            batter_hand = "左"
        elif "右打" in table_text:
            batter_hand = "右"
        elif "両打" in table_text:
            batter_hand = "両"

    # 25マスゾーンの座標（詳しい投球内容内のbb-allocationChart）
    # 注意: ページにコース図が2つある場合がある（#nxt_battの簡易図と、詳しい投球内容の図）。
    # 投球テーブルと同じbb-splits__item内のチャート（下側＝投球リスト直上）を使用する。
    zone_by_pitch: dict[int, tuple[float, float]] = {}
    pitch_table = None
    for table in soup.find_all("table", class_="bb-splitsTable"):
        thead = table.find("thead")
        if not thead:
            continue
        headers = [th.get_text(strip=True) for th in thead.find_all("th")]
        if "球種" in headers and "球速" in headers and "結果" in headers:
            pitch_table = table
            break
    # 投球テーブルと同じ親セクション内の allocationChart を優先
    chart_td = None
    if pitch_table:
        parent = pitch_table.find_parent("section", class_="bb-splits__item") or pitch_table.find_parent()
        if parent:
            chart_td = parent.find("td", class_=re.compile(r"allocationChartBg"))
    if not chart_td:
        for table in soup.find_all("table", class_="bb-splitsTable"):
            thead = table.find("thead")
            if not thead or "詳しい投球内容" not in thead.get_text():
                continue
            chart_td = table.find("td", class_=re.compile(r"allocationChartBg"))
            if chart_td:
                break
    if chart_td:
        chart = chart_td.find("div", class_="bb-allocationChart")
        if chart:
            for span in chart.find_all("span", class_="bb-icon__ballCircle"):
                num_span = span.find("span", class_="bb-icon__number")
                style = span.get("style", "")
                top_m = re.search(r"top:([\d.-]+)px", style)
                left_m = re.search(r"left:([\d.-]+)px", style)
                if num_span and top_m and left_m:
                    try:
                        n = int(num_span.get_text().strip())
                        top_px = float(top_m.group(1))
                        left_px = float(left_m.group(1))
                        zone_by_pitch[n] = (top_px, left_px)
                    except (ValueError, TypeError):
                        pass

    # 投球テーブル（投球数・球種・球速・結果）
    for table in soup.find_all("table", class_="bb-splitsTable"):
        thead = table.find("thead")
        if not thead:
            continue
        headers = [th.get_text(strip=True) for th in thead.find_all("th")]
        if "球種" not in headers or "球速" not in headers or "結果" not in headers:
            continue

        tbody = table.find("tbody")
        for row_idx, tr in enumerate(tbody.find_all("tr") if tbody else []):
            tds = tr.find_all("td")
            if len(tds) < 5:
                continue
            # 1列目: 投球番号アイコン, 2: 投球数, 3: 球種, 4: 球速, 5: 結果
            pitch_no_el = tds[0].find("span", class_="bb-icon__ballCircle") or tds[0]
            pitch_no_text = pitch_no_el.get_text(strip=True) if pitch_no_el else ""
            pitch_no = 0
            try:
                pitch_no = int(pitch_no_text) if pitch_no_text.isdigit() else int(tds[1].get_text(strip=True))
            except (ValueError, TypeError):
                continue

            pitch_type = tds[2].get_text(strip=True) if len(tds) > 2 else ""
            speed_cell = tds[3].get_text(strip=True) if len(tds) > 3 else ""
            result = tds[4].get_text(strip=True) if len(tds) > 4 else ""

            # 球速から数値抽出 (154km/h -> 154)
            speed_kmh = ""
            speed_m = re.search(r"(\d+)\s*km/h", speed_cell)
            if speed_m:
                speed_kmh = speed_m.group(1)

            zone_top, zone_left = "", ""
            zone_row, zone_col, zone_id = "", "", ""
            # チャートの番号は打席内(1,2,3...)か試合通算(10,11,12...)の両方あり得る。両方試す
            zone_coords = None
            for key in [pitch_no, row_idx + 1]:
                if key in zone_by_pitch:
                    zone_coords = zone_by_pitch[key]
                    break
            if zone_coords is not None:
                top_px, left_px = zone_coords
                zone_top = f"{top_px:.1f}"
                zone_left = f"{left_px:.1f}"
                r, c, z = px_to_zone_25(top_px, left_px)
                zone_row, zone_col, zone_id = str(r), str(c), str(z)

            rows.append({
                "game_id": game_id,
                "inning": str(inning),
                "top_bottom": top_bottom,
                "bat_order": str(bat_order),
                "pitcher_id": pitcher_id,
                "batter_id": batter_id,
                "batter_name": batter_name,
                "batter_hand": batter_hand,
                "pitch_no": str(pitch_no),
                "pitch_type": pitch_type,
                "speed_kmh": speed_kmh,
                "result": result,
                "zone_top_px": zone_top,
                "zone_left_px": zone_left,
                "zone_row": zone_row,
                "zone_col": zone_col,
                "zone_id": zone_id,
            })
        if rows:
            break

    return rows


def main():
    parser = argparse.ArgumentParser(description="Yahoo一球速報 投球詳細スクレイピング")
    parser.add_argument("--date", default="2026-03-04", help="対象日付 (YYYY-MM-DD)")
    parser.add_argument("--pa-csv", default="_data/yahoo_games_pilot/plate_appearances_normalized.csv",
                        help="打席CSVパス")
    parser.add_argument("--out", default="_data/yahoo_games_pilot/pitch_details.csv", help="出力CSVパス")
    parser.add_argument("--sleep", type=float, default=1.5, help="リクエスト間の秒数")
    parser.add_argument("--limit", type=int, default=0, help="取得打席数上限（0=全件）")
    parser.add_argument("--game-ids", help="試合IDをカンマ区切りで指定（省略時は対象日の全試合）")
    parser.add_argument("--batter-id", default="1100082", help="打者IDで絞り込み（省略時=菊池のみ、全員取得は --batter-id ''）")
    parser.add_argument("--save-html", action="store_true", help="取得HTMLを保存する（デバッグ用）")
    args = parser.parse_args()

    pa_path = Path(args.pa_csv)
    if not pa_path.exists():
        print(f"❌ 打席CSVが見つかりません: {pa_path}")
        sys.exit(1)

    # 打席CSVを読み込み、対象日の打席を取得
    target_date = args.date.replace("-", "")  # 20260304
    date_col = None
    plate_appearances: list[dict] = []

    with open(pa_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        for i, name in enumerate(fieldnames):
            if "date" in name.lower():
                date_col = name
                break
        if not date_col:
            date_col = "date" if "date" in fieldnames else fieldnames[14] if len(fieldnames) > 14 else None

        for row in reader:
            row_date = row.get("date", row.get("Date", ""))
            if not row_date or str(row_date).replace("-", "") != target_date.replace("-", ""):
                continue
            if args.game_ids:
                gids = [x.strip() for x in args.game_ids.split(",") if x.strip()]
                if row.get("game_id", "") not in gids:
                    continue
            if args.batter_id:
                if row.get("batter_id", "") != str(args.batter_id):
                    continue
            plate_appearances.append(row)

    if not plate_appearances:
        print(f"❌ 対象日 {args.date} の打席データがありません")
        sys.exit(1)

    print(f"📋 対象打席数: {len(plate_appearances)} (日付={args.date})")
    if args.limit > 0:
        plate_appearances = plate_appearances[: args.limit]
        print(f"   上限により {args.limit} 件に制限")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if args.save_html:
        html_dir = Path(args.out).parent / "pitch_detail_html"
        html_dir.mkdir(parents=True, exist_ok=True)

    all_rows: list[dict] = []
    seen: set[tuple[str, int, str, int]] = set()  # (game_id, inning, top_bottom, bat_order)
    failed = 0

    for i, pa in enumerate(plate_appearances):
        game_id = pa.get("game_id", "")
        inning = int(pa.get("inning", 1))
        top_bottom = pa.get("top_bottom", "表")
        bat_order = int(pa.get("bat_order", 1))

        key = (game_id, inning, top_bottom, bat_order)
        if key in seen:
            continue
        seen.add(key)

        index = build_index(inning, top_bottom, bat_order)
        url = f"{BASE_URL}/npb/game/{game_id}/score?index={index}"
        print(f"  [{i+1}/{len(plate_appearances)}] {game_id} {inning}{top_bottom} {bat_order}番 ... ", end="", flush=True)

        html = fetch_html(url)
        if not html:
            failed += 1
            print("❌")
            time.sleep(args.sleep)
            continue

        if args.save_html:
            (html_dir / f"{game_id}_{index}.html").write_text(html, encoding="utf-8")

        rows = parse_pitch_details(html, game_id, inning, top_bottom, bat_order)
        if rows:
            all_rows.extend(rows)
            print(f"✅ {len(rows)}球")
        else:
            print("⚠️ 投球データなし")

        time.sleep(args.sleep)

    # CSV出力
    fieldnames_out = [
        "game_id", "inning", "top_bottom", "bat_order", "pitcher_id", "batter_id", "batter_hand",
        "pitch_no", "pitch_type", "speed_kmh", "result",
        "zone_top_px", "zone_left_px", "zone_row", "zone_col", "zone_id",
    ]
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames_out, extrasaction="ignore")
        w.writeheader()
        w.writerows(all_rows)

    print(f"\n✅ 完了: {len(all_rows)} 投球を保存")
    print(f"   出力: {out_path.absolute()}")
    if failed:
        print(f"   ⚠️ 取得失敗: {failed} 打席")


if __name__ == "__main__":
    main()
