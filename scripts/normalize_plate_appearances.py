#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
normalize_plate_appearances.py

個人ページ作成計画書 Phase 2 残作業: 打席データの正規化
- 打席結果の正規化 (result_raw → ab/h/bb等)
- 状況の正規化 (base_state → outs, risp)
- 球種・コースの抽出
- メタデータ付与 (games_metaと結合)
- lineup_slot: スタメン1〜9番（_data/yahoo_games_pilot/*_top.html の打順表 + canonical の startingLineup）
  ※ plate_appearances の bat_order は Yahoo テキストの「その回の何番目の打者」用。集計の打順別は lineup_slot を優先する。
"""

import csv
import json
import re
import sys
import io
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

_PLAYER_HREF_RE = re.compile(r"/npb/player/(\d+)/")


def parse_lineup_from_top_html(html: str) -> dict[str, str]:
    """Yahoo top ページのスタメン表（th が「打順」）から yahoo_player_id -> '1'..'9'。"""
    if BeautifulSoup is None:
        return {}
    soup = BeautifulSoup(html, "html.parser")
    out: dict[str, str] = {}
    for table in soup.find_all("table"):
        cls = table.get("class") or []
        if not any("bb-splitsTable" in str(x) for x in cls):
            continue
        thead = table.find("thead")
        if not thead:
            continue
        order_th = None
        for th in thead.find_all("th"):
            tcls = th.get("class") or []
            if not any("bb-splitsTable__head--order" in str(x) for x in tcls):
                continue
            if (th.get_text() or "").strip() == "打順":
                order_th = th
                break
        if not order_th:
            continue
        for tr in table.find_all("tr", class_="bb-splitsTable__row"):
            tds = tr.find_all("td")
            if len(tds) < 3:
                continue
            order_txt = (tds[0].get_text() or "").strip()
            if not order_txt.isdigit():
                continue
            n = int(order_txt)
            if not (1 <= n <= 9):
                continue
            a = tds[2].find("a", href=True)
            if not a:
                continue
            m = _PLAYER_HREF_RE.search(a.get("href", "") or "")
            if m:
                out[m.group(1)] = order_txt
    return out


def load_lineup_maps(root: Path) -> dict[str, dict[str, str]]:
    """game_id -> { yahoo_batter_id -> '1'..'9' }。canonical を読み、続けて *_top.html で上書き補完。"""
    merged: dict[str, dict[str, str]] = {}
    canon_dir = root / "_data" / "scraped_games" / "canonical"
    if canon_dir.is_dir():
        for path in sorted(canon_dir.glob("*.json")):
            try:
                doc = json.loads(path.read_text(encoding="utf-8"))
                gid = str(doc.get("gameId") or path.stem).strip()
                m: dict[str, str] = {}
                for t in doc.get("game", {}).get("teams", []) or []:
                    for p in t.get("startingLineup", []) or []:
                        yid = (p.get("yahooPlayerId") or "").strip()
                        bo = (p.get("battingOrder") or "").strip()
                        if yid and bo.isdigit() and 1 <= int(bo) <= 9:
                            m[yid] = bo
                if m:
                    merged[gid] = m
            except Exception:
                pass
    pilot_dir = root / "_data" / "yahoo_games_pilot"
    if pilot_dir.is_dir() and BeautifulSoup is not None:
        for path in sorted(pilot_dir.glob("*_top.html")):
            gid = path.stem.replace("_top", "")
            try:
                html = path.read_text(encoding="utf-8")
                m = parse_lineup_from_top_html(html)
                if not m:
                    continue
                prev = dict(merged.get(gid) or {})
                prev.update(m)
                merged[gid] = prev
            except Exception:
                pass
    return merged


# ---- 打席結果の正規化 ----
def _matches(txt: str, *patterns: str) -> bool:
    if not txt:
        return False
    return any(p in txt for p in patterns)

def normalize_result(result_raw: str) -> dict:
    """result_raw から打席結果指標を算出"""
    txt = (result_raw or "").strip()
    out = {
        "ab": 0, "h": 0, "h2": 0, "h3": 0, "hr": 0,
        "bb": 0, "hbp": 0, "so": 0, "sh": 0, "sf": 0, "gidp": 0,
        "rbi": 0, "r": 0, "ibb": 0, "sb": 0, "cs": 0,
        "is_pa": 0,
    }

    # 打席としてカウントしないイベント
    if _matches(txt, "投手交代", "守備交代", "守備変更", "けん制", "リクエスト",
               "マウンドへ集まる", "コーチマウンド", "内野手マウンド"):
        return out

    # 走者情報のみ（打者結果なし）
    if _matches(txt, "一塁走者", "二塁走者", "三塁走者") and not _matches(
        txt, "ヒット", "安打", "出塁", "ゴロ", "フライ", "三振", "フォアボール", "デッドボール", "四球", "敬遠", "故意四球", "死球"
    ):
        return out

    # 四球・フォアボール・敬遠・故意四球（四球扱いで統一。敬遠は ibb も立てる）
    if _matches(txt, "フォアボール", "四球", "敬遠", "故意四球"):
        out["bb"] = 1
        out["is_pa"] = 1
        if _matches(txt, "敬遠", "故意四球"):
            out["ibb"] = 1
        return out

    # 死球・デッドボール
    if _matches(txt, "デッドボール", "死球"):
        out["hbp"] = 1
        out["is_pa"] = 1
        return out

    # 犠打
    if _matches(txt, "犠打", "送りバント", "バントを", "セーフティバント"):
        out["sh"] = 1
        out["is_pa"] = 1
        return out

    # 犠飛（フライでアウトかつ得点）
    if _matches(txt, "犠飛") or (_matches(txt, "フライ") and _matches(txt, "犠")):
        out["sf"] = 1
        out["ab"] = 1
        out["rbi"] = 1
        out["is_pa"] = 1
        return out

    # 三振
    if _matches(txt, "三振", "見逃し三振", "空振り三振"):
        out["so"] = 1
        out["ab"] = 1
        out["is_pa"] = 1
        return out

    # 本塁打（打者得点=1）
    if _matches(txt, "ホームラン"):
        out["hr"] = 1
        out["h"] = 1
        out["ab"] = 1
        out["r"] = 1
        out["rbi"] = 1
        out["is_pa"] = 1
        return out

    # 三塁打
    if _matches(txt, "スリーベース", "三塁打"):
        out["h3"] = 1
        out["h"] = 1
        out["ab"] = 1
        out["is_pa"] = 1
        return out

    # 二塁打
    if _matches(txt, "ツーベース", "二塁打"):
        out["h2"] = 1
        out["h"] = 1
        out["ab"] = 1
        out["is_pa"] = 1
        return out

    # 併殺打（ゴロ等で併殺）
    if _matches(txt, "併殺打", "ダブルプレー") and _matches(txt, "ゴロ"):
        out["gidp"] = 1
        out["ab"] = 1
        out["is_pa"] = 1
        return out
    if _matches(txt, "ダブルプレー") and not _matches(txt, "ゴロ"):
        # 打者以外の併殺（例: 6-4-3 DPで打者はゴロ）
        # 「4-6-3のダブルプレー」等は打者がゴロの可能性が高い
        out["gidp"] = 1
        out["ab"] = 1
        out["is_pa"] = 1
        return out

    # 安打（ヒット・内野安打・ポテンヒット）
    if _matches(txt, "ヒット", "安打", "出塁", "内野安打", "ポテンヒット", "タイムリーヒット", "タイムリー"):
        if _matches(txt, "二塁打", "ツーベース"):  # 一二塁は走者状況なので除外
            out["h2"] = 1
        elif _matches(txt, "三塁打", "スリーベース"):
            out["h3"] = 1
        else:
            out["h"] = 1
        out["ab"] = 1
        if _matches(txt, "タイムリー", "先制", "同点", "勝ち越し"):
            out["rbi"] = 1
        out["is_pa"] = 1
        return out

    # ゴロ・フライ・ライナー・ファウルフライ（打数のみ）
    if _matches(txt, "ゴロ", "フライ", "ライナー", "ファウルフライ") or _matches(txt, "ピッチャーゴロ", "サードゴロ"):
        out["ab"] = 1
        out["is_pa"] = 1
        return out

    # ファウルフライ・ファウルは打数に含めない場合があるが、アウトなら打数
    if _matches(txt, "ファウルフライ") and _matches(txt, "アウト"):
        out["ab"] = 1
        out["is_pa"] = 1
        return out

    # 盗塁・盗塁死（走者イベント。打席でない行に記録される場合がある）
    if _matches(txt, "盗塁") and not _matches(txt, "盗塁アウト", "盗塁死"):
        out["sb"] = 1
        return out
    if _matches(txt, "盗塁アウト", "盗塁死"):
        out["cs"] = 1
        return out

    # その他（打席として不明瞭なもの）
    return out


# ---- 状況の正規化 ----
def normalize_base_state(base_state: str) -> dict:
    """base_state から outs, base_state_code, risp を算出"""
    txt = (base_state or "").strip()
    out = {"outs": 0, "base_state_code": "000", "risp": 0}

    # アウト数
    if "無死" in txt:
        out["outs"] = 0
    elif "一死" in txt:
        out["outs"] = 1
    elif "二死" in txt:
        out["outs"] = 2

    # 塁状況 (1塁,2塁,3塁)
    b1 = 1 if "一塁" in txt or "一二" in txt or "一三" in txt or "二三" in txt or "満塁" in txt else 0
    b2 = 1 if "二塁" in txt or "一二" in txt or "二三" in txt or "満塁" in txt else 0
    b3 = 1 if "三塁" in txt or "一三" in txt or "二三" in txt or "満塁" in txt else 0
    out["base_state_code"] = f"{b1}{b2}{b3}"

    # RISP（得点圏＝二塁 or 三塁に走者）
    out["risp"] = 1 if b2 or b3 else 0

    return out


# ---- 球種・コースの抽出 ----
PITCH_TYPES = [
    "ストレート", "スライダー", "カーブ", "チェンジアップ", "カットボール",
    "ツーシーム", "スプリット", "ナックルカーブ", "フォーク", "シンカー",
    "シュート", "パーム", "真っ直ぐ",
]
COURSES = ["外角高め", "内角高め", "外角低め", "内角低め", "外角", "内角", "高め", "低め", "ど真ん中"]

def extract_pitch_info(result_raw: str) -> dict:
    """result_raw から球種・コースを抽出"""
    txt = (result_raw or "").strip()
    pitch_type = ""
    course = ""

    for p in PITCH_TYPES:
        if p in txt:
            pitch_type = p
            break
    if not pitch_type and "変化球" in txt:
        pitch_type = "変化球"

    for c in COURSES:
        if c in txt:
            course = c
            break

    return {"pitch_type": pitch_type, "course": course}


def main():
    root = Path(__file__).resolve().parent.parent
    data_dir = root / "_data" / "yahoo_games_pilot"
    plate_path = data_dir / "plate_appearances.csv"
    meta_path = data_dir / "games_meta.csv"
    out_path = data_dir / "plate_appearances_normalized.csv"

    if not plate_path.exists():
        print(f"❌ {plate_path} が存在しません")
        sys.exit(1)
    if not meta_path.exists():
        print(f"❌ {meta_path} が存在しません")
        sys.exit(1)

    # games_meta 読み込み
    meta_by_game = {}
    with open(meta_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            meta_by_game[row["game_id"]] = row

    # plate_appearances 読み込み・正規化
    rows = []
    with open(plate_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        base_fields = reader.fieldnames

    with open(plate_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            row.setdefault("pitcher_id", "")
            game_id = row["game_id"]
            result_raw = row.get("result_raw", "")
            base_state = row.get("base_state", "")

            # 打席結果の正規化
            res = normalize_result(result_raw)
            row.update(res)

            # 状況の正規化
            bs = normalize_base_state(base_state)
            row["outs"] = bs["outs"]
            row["base_state_code"] = bs["base_state_code"]
            row["risp"] = bs["risp"]

            # 球種・コース
            pi = extract_pitch_info(result_raw)
            row["pitch_type"] = pi["pitch_type"]
            row["course"] = pi["course"]

            # メタデータ付与
            meta = meta_by_game.get(game_id, {})
            row["date"] = meta.get("date", "")
            row["stadium"] = meta.get("stadium", "")
            row["home_team"] = meta.get("home", "")
            row["away_team"] = meta.get("away", "")
            # デーゲーム/ナイター（試合開始時刻から判定）
            game_time = meta.get("game_time", "")
            if game_time:
                try:
                    h = int(game_time.split(":")[0])
                    row["day_night"] = "ナイター" if h >= 17 else "デーゲーム"
                except (ValueError, IndexError):
                    row["day_night"] = ""
            else:
                row["day_night"] = ""
            # 表=away攻撃, 裏=home攻撃
            if row.get("top_bottom") == "表":
                row["batting_team"] = meta.get("away", "")
                row["opponent_team"] = meta.get("home", "")
                row["is_home"] = 0
            else:
                row["batting_team"] = meta.get("home", "")
                row["opponent_team"] = meta.get("away", "")
                row["is_home"] = 1

            rows.append(row)

    lineup_maps = load_lineup_maps(root)
    for row in rows:
        gid = row.get("game_id", "")
        bid = (row.get("batter_id") or "").strip()
        row["lineup_slot"] = lineup_maps.get(gid, {}).get(bid, "") if bid else ""

    # 出力
    out_fields = [
        "game_id", "inning", "top_bottom", "bat_order", "lineup_slot", "batter_id", "pitcher_id", "base_state", "result_raw",
        "ab", "h", "h2", "h3", "hr", "bb", "hbp", "so", "sh", "sf", "gidp", "rbi", "r", "ibb", "sb", "cs", "is_pa",
        "outs", "base_state_code", "risp",
        "pitch_type", "course",
        "date", "stadium", "day_night", "home_team", "away_team", "batting_team", "opponent_team", "is_home",
    ]
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=out_fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    pa_count = sum(1 for r in rows if r.get("is_pa"))
    print(f"✅ plate_appearances_normalized.csv: {len(rows)}行 ({pa_count}打席) -> {out_path}")


if __name__ == "__main__":
    main()
