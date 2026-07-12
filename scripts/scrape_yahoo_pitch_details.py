#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scrape_yahoo_pitch_details.py

Yahoo!一球速報の「詳しい投球内容」から、球種・コース(25マス)・球速・結果を取得する。

- 打席ごとに /game/{id}/score?index={index} を取得
- index形式: IIBTSS  (II=イニング01-09, B=1表/2裏, T=打者番号01-09, SS=00 固定が多いが、
  同一打席が複数「速報スナップショット」に分かれると 01,02… と進む。`a#btn_next` の index が
  同一打席かつ SS 昇順のときだけ追従し、HTML を連結パースして行をマージする（次打者へ進む index は追わない）。
- 出力: pitch_details.csv (game_id, inning, top_bottom, bat_order, pitcher_id, batter_id, pitch_no, pitch_type, speed_kmh, result, zone_top_px, zone_left_px, zone_row, zone_col, zone_id)

同一打席内で表示が複数ブロックに分かれる場合（走者イベント例: ランエンドヒット・エンドラン・暴投・パスボール・
牽制・盗塁成功/失敗 等、または投手交代・タイム等）は、同一ヘッダの投球表をすべて結合する。
末尾が「ボール」系、または §6b のストライク進行のみ（見逃し・空振り・素のファウル）のときは、同一 tbody の続き tr と 2 列要約表から欠番の球行を追補する（HTML に無ければ不可）。
同一打席は score の btn_next を辿って複数ページ結合すること（§6a・§6b）。取得ルールの詳細は docs/yahoo_plate_appearance_batting_rules.md を参照。
"""

from __future__ import annotations

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
_HTTP_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
_HTTP_SESSION: requests.Session | None = None


def _get_http_session() -> requests.Session:
    global _HTTP_SESSION
    if _HTTP_SESSION is None:
        _HTTP_SESSION = requests.Session()
        _HTTP_SESSION.headers.update(_HTTP_HEADERS)
    return _HTTP_SESSION


def _is_transient_fetch_error(exc: BaseException) -> bool:
    if isinstance(
        exc,
        (
            requests.exceptions.ConnectionError,
            requests.exceptions.Timeout,
            requests.exceptions.ChunkedEncodingError,
        ),
    ):
        return True
    if isinstance(exc, requests.exceptions.HTTPError) and exc.response is not None:
        return exc.response.status_code in (429, 502, 503, 504)
    return False


def build_index(inning: int, top_bottom: str, bat_order: int) -> str:
    """
    打席を指定して index パラメータを生成。
    形式: IIBTSS (II=イニング01-09, B=1表/2裏, T=打者番号01-09, SS=サフィックス。入口は 00)
    例: 1回表1番 → 0110100, 1回裏2番 → 0120200
    """
    tb = "1" if top_bottom == "表" else "2"
    return f"{inning:02d}{tb}{bat_order:02d}00"


def parse_score_query_index(index_raw: str) -> tuple[int, str, int, int] | None:
    """
    Yahoo 速報 score の ?index= 値を分解する。
    戻り: (イニング, 表裏, 打順, 末尾2桁サフィックス)。7桁以外・非数字は None。
    """
    s = (index_raw or "").strip()
    if len(s) != 7 or not s.isdigit():
        return None
    inning = int(s[0:2])
    b = s[2]
    if b not in ("1", "2"):
        return None
    top_bottom = "表" if b == "1" else "裏"
    bat_order = int(s[3:5])
    suffix = int(s[5:7])
    return inning, top_bottom, bat_order, suffix


def score_index_matches_plate_appearance(
    index_raw: str, inning: int, top_bottom: str, bat_order: int
) -> bool:
    p = parse_score_query_index(index_raw)
    if not p:
        return False
    inn, tb, bo, _suf = p
    return inn == inning and tb == top_bottom and bo == bat_order


def extract_btn_next_index(html: str) -> str | None:
    """速報フッタの「次へ」が有効なとき、`a#btn_next` の index（または href）を返す。"""
    soup = BeautifulSoup(html, "lxml")
    a = soup.select_one("a#btn_next")
    if not a:
        return None
    idx = (a.get("index") or "").strip()
    if not idx:
        href = (a.get("href") or "").strip()
        if "index=" in href:
            try:
                q = href.split("index=", 1)[1]
                idx = q.split("&", 1)[0].strip()
            except IndexError:
                return None
    if not idx or not idx.isdigit() or len(idx) != 7:
        return None
    return idx


def should_follow_btn_next_for_same_pa(
    from_index: str,
    to_index: str,
    inning: int,
    top_bottom: str,
    bat_order: int,
) -> bool:
    """
    btn_next が「同一打席の続きページ」（サフィックスのみ進む）か判定する。
    次打者（打順が変わる index）へ進むリンクは False。
    """
    if not score_index_matches_plate_appearance(from_index, inning, top_bottom, bat_order):
        return False
    if not score_index_matches_plate_appearance(to_index, inning, top_bottom, bat_order):
        return False
    p_from = parse_score_query_index(from_index)
    p_to = parse_score_query_index(to_index)
    if not p_from or not p_to:
        return False
    return p_to[3] > p_from[3]


# 同一打席の score?index=… を btn_next から辿る上限（無限ループ防止）
MAX_SCORE_INDEX_PAGES_PER_PA = 48


def fetch_pitch_detail_score_pages_for_pa(
    game_id: str,
    inning: int,
    top_bottom: str,
    bat_order: int,
    *,
    sleep_sec: float = 0.0,
    cache_dir: Path | None = None,
    force: bool = False,
    statistics: dict[str, int] | None = None,
) -> list[tuple[str, str]]:
    """
    先頭は build_index の URL、続きは同一打席かつサフィックス昇順の btn_next のみ追従。
    戻り: [(index, html), ...]

    cache_dir を指定すると `cache_dir/{index}.html` を優先読み（force で無視）、
    未取得分のみネット取得して同パスへ書き込む（raw スナップショット・再実行の短縮用）。

    statistics に dict を渡すと、ネットから取得できたページ数を `network_fetches` に加算する
    （再実行時など、キャッシュのみの打席では待機しない用途）。
    """
    out: list[tuple[str, str]] = []
    current = build_index(inning, top_bottom, bat_order)
    seen: set[str] = set()
    while current and current not in seen and len(seen) < MAX_SCORE_INDEX_PAGES_PER_PA:
        seen.add(current)
        url = f"{BASE_URL}/npb/game/{game_id}/score?index={current}"
        html: str | None = None
        if cache_dir is not None and not force:
            cp = cache_dir / f"{current}.html"
            if cp.is_file():
                try:
                    html = cp.read_text(encoding="utf-8")
                except OSError:
                    html = None
        if html is None:
            html = fetch_html(url)
            if statistics is not None:
                statistics["network_fetches"] = statistics.get("network_fetches", 0) + 1
            if html and cache_dir is not None:
                try:
                    cache_dir.mkdir(parents=True, exist_ok=True)
                    (cache_dir / f"{current}.html").write_text(html, encoding="utf-8")
                except OSError:
                    pass
        if not html:
            break
        out.append((current, html))
        nxt = extract_btn_next_index(html)
        if not nxt or not should_follow_btn_next_for_same_pa(
            current, nxt, inning, top_bottom, bat_order
        ):
            break
        current = nxt
        if sleep_sec > 0:
            time.sleep(sleep_sec)
    return out


def _row_text(v: object) -> str:
    return str(v or "").strip()


def _same_pitch_row_for_overlap(a: dict, b: dict) -> bool:
    """
    2つの投球行が同じ球かを判定する。
    """
    if _row_text(a.get("result")) != _row_text(b.get("result")):
        return False
    if _row_text(a.get("pitch_type")) != _row_text(b.get("pitch_type")):
        return False
    if _row_text(a.get("speed_kmh")) != _row_text(b.get("speed_kmh")):
        return False

    a_pid = _row_text(a.get("pitcher_id"))
    b_pid = _row_text(b.get("pitcher_id"))
    if a_pid and b_pid and a_pid != b_pid:
        return False

    a_bid = _row_text(a.get("batter_id"))
    b_bid = _row_text(b.get("batter_id"))
    if a_bid and b_bid and a_bid != b_bid:
        return False

    return True


def _leading_overlap_len(prev_rows: list[dict], next_rows: list[dict]) -> int:
    """
    次ページ先頭が前ページ内容を何球ぶん再掲しているか返す。
    例:
      prev = [1,2,3]
      next = [1,2,3,4,5]
      -> 3
    """
    max_k = min(len(prev_rows), len(next_rows))
    best = 0
    for k in range(1, max_k + 1):
        ok = True
        for i in range(k):
            if not _same_pitch_row_for_overlap(prev_rows[i], next_rows[i]):
                ok = False
                break
        if ok:
            best = k
        else:
            break
    return best


def parse_pitch_details_merged_score_pages(
    pages: list[str],
    game_id: str,
    inning: int,
    top_bottom: str,
    bat_order: int,
) -> list[dict]:
    """同一打席の複数 score HTML を結合し、再掲された先頭部分を除く。"""
    if not pages:
        return []

    merged: list[dict] = []
    zone_start = 1

    for html in pages:
        next_zone: list[int] = []
        rows = parse_pitch_details(
            html,
            game_id,
            inning,
            top_bottom,
            bat_order,
            global_row_start=1,
            zone_seq_start=zone_start,
            next_zone_seq_out=next_zone,
        )
        if not rows:
            continue

        if merged:
            overlap = _leading_overlap_len(merged, rows)
            rows = rows[overlap:]

        for i, row in enumerate(rows, start=len(merged) + 1):
            row["pitch_no"] = str(i)

        merged.extend(rows)
        zone_start = next_zone[0] if next_zone else zone_start

    return merged


def fetch_html(url: str, *, max_attempts: int = 3) -> str | None:
    """HTMLを取得（UTF-8）。成功時は待機なし。接続リセット等の一時障害のみ短いバックオフで再試行。"""
    session = _get_http_session()
    last_err: Exception | None = None
    for attempt in range(max_attempts):
        if attempt > 0:
            # 再試行時だけ短い待機（成功パスにはコストゼロ）
            time.sleep(1.0 * attempt)
        try:
            r = session.get(url, timeout=30)
            r.raise_for_status()
            r.encoding = "utf-8"
            return r.text
        except Exception as e:
            last_err = e
            if not _is_transient_fetch_error(e) or attempt >= max_attempts - 1:
                break
            print(f"  ⚠️ 再試行 {attempt + 2}/{max_attempts}: {url} - {e}")
    print(f"  ❌ 取得失敗: {url} - {last_err}")
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


def _is_ball_like_trailing_result(result: str) -> bool:
    """詳細表の末尾が「打席未確定の中間球」に見えるとき（続き行・要約表を探すトリガ）。"""
    r = (result or "").strip()
    if not r:
        return False
    if r == "ボール":
        return True
    return r.startswith("ボール[")


def _is_strike_count_only_trailing_result(result: str) -> bool:
    """ストライクのカウント進行のみ（括弧で状況が付くものは含めない）。docs §6b。"""
    r = (result or "").strip()
    return r in ("見逃し", "空振り", "ファウル")


def _is_intermediate_trailing_result(result: str) -> bool:
    """
    詳細表の末尾が「まだ打席が続く見込みの中間表記」か。
    ボール系に加え、見逃し／空振り／素のファウル（§6b）。マージ側 isIntermediateTrailingResultJa と同期すること。
    """
    return _is_ball_like_trailing_result(result) or _is_strike_count_only_trailing_result(result)


def _table_in_pitch_detail_context(table) -> bool:
    """誤った2列表（サイドの統計等）を避けるため、ライブ／投球ブロック付近に限定。"""
    for p in table.parents:
        if not getattr(p, "name", None):
            break
        cls = " ".join(p.get("class") or ())
        pid = (p.get("id") or "") or ""
        if "bb-splits" in cls or "bb-splitsTable" in cls:
            return True
        if pid in ("live", "liveBody", "liveWrapper", "gm_score", "gm_score2"):
            return True
    classes = table.get("class") or []
    return "bb-splitsTable" in classes


def _parse_two_column_pitch_index_pairs(table) -> list[tuple[int, str]]:
    """
    | 投球数 | 結果 | のような2列のみの簡易一覧から (球番, 結果) を取る。
    1列目が数字、2列目が空でない行だけ採用。
    """
    out: list[tuple[int, str]] = []
    tbody = table.find("tbody")
    if not tbody:
        return out
    for tr in tbody.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) != 2:
            continue
        a = (tds[0].get_text() or "").strip()
        b = (tds[1].get_text() or "").strip()
        if not a.isdigit() or not b:
            continue
        try:
            out.append((int(a), b))
        except ValueError:
            continue
    return out


def _parse_pitch_tr_row(
    tr,
    game_id: str,
    inning: int,
    top_bottom: str,
    bat_order: int,
    pitcher_id: str,
    batter_id: str,
    batter_name: str,
    batter_hand: str,
    zone_by_seq: dict[int, tuple[float, float]],
    global_row: int,
    row_idx: int,
) -> dict | None:
    """bb-splitsTable の1行を投球行 dict に変換。パース不能なら None。"""
    tds = tr.find_all("td")
    if len(tds) < 5:
        return None
    pitch_no_el = tds[0].find("span", class_="bb-icon__ballCircle") or tds[0]
    pitch_no_text = pitch_no_el.get_text(strip=True) if pitch_no_el else ""
    pitch_no = 0
    try:
        pitch_no = int(pitch_no_text) if pitch_no_text.isdigit() else int(tds[1].get_text(strip=True))
    except (ValueError, TypeError):
        return None

    pitch_type = tds[2].get_text(strip=True) if len(tds) > 2 else ""
    speed_cell = tds[3].get_text(strip=True) if len(tds) > 3 else ""
    result = tds[4].get_text(strip=True) if len(tds) > 4 else ""

    speed_kmh = ""
    speed_m = re.search(r"(\d+)\s*km/h", speed_cell)
    if speed_m:
        speed_kmh = speed_m.group(1)

    zone_top, zone_left = "", ""
    zone_row, zone_col, zone_id = "", "", ""
    zone_coords = None
    for key in [global_row, pitch_no, row_idx + 1]:
        if key in zone_by_seq:
            zone_coords = zone_by_seq[key]
            break
    if zone_coords is not None:
        top_px, left_px = zone_coords
        zone_top = f"{top_px:.1f}"
        zone_left = f"{left_px:.1f}"
        r, c, z = px_to_zone_25(top_px, left_px)
        zone_row, zone_col, zone_id = str(r), str(c), str(z)

    return {
        "game_id": game_id,
        "inning": str(inning),
        "top_bottom": top_bottom,
        "bat_order": str(bat_order),
        "pitcher_id": pitcher_id,
        "batter_id": batter_id,
        "batter_name": batter_name,
        "batter_hand": batter_hand,
        "pitch_no": str(global_row),
        "pitch_type": pitch_type,
        "speed_kmh": speed_kmh,
        "result": result,
        "zone_top_px": zone_top,
        "zone_left_px": zone_left,
        "zone_row": zone_row,
        "zone_col": zone_col,
        "zone_id": zone_id,
    }


def _extend_pitch_rows_after_ball_trailing(
    soup: BeautifulSoup,
    rows: list[dict],
    last_pitch_tr,
    game_id: str,
    inning: int,
    top_bottom: str,
    bat_order: int,
    pitcher_id: str,
    batter_id: str,
    batter_name: str,
    batter_hand: str,
    zone_by_seq: dict[int, tuple[float, float]],
) -> None:
    """
    本表の最終行がボール系またはストライク進行のみ（§6b）のとき、(1) 同一 tbody 内で続く tr を再パースし、
    (2) それでも末尾が中間表記なら、ページ内の2列「球番・結果」要約表から連番で欠けた球だけ追補する。
    （HTML に行が無い限り増えない。docs §6a・§6b・merge 側ルールと整合）
    """
    if not rows or not _is_intermediate_trailing_result(rows[-1].get("result", "")):
        return

    if last_pitch_tr is not None:
        tbody = last_pitch_tr.find_parent("tbody")
        if tbody is not None:
            trs = tbody.find_all("tr")
            try:
                start_after = trs.index(last_pitch_tr)
            except ValueError:
                start_after = -1
            if start_after >= 0:
                for row_idx, tr in enumerate(trs):
                    if row_idx <= start_after:
                        continue
                    pr = _parse_pitch_tr_row(
                        tr,
                        game_id,
                        inning,
                        top_bottom,
                        bat_order,
                        pitcher_id,
                        batter_id,
                        batter_name,
                        batter_hand,
                        zone_by_seq,
                        len(rows) + 1,
                        row_idx,
                    )
                    if pr is None:
                        continue
                    rows.append(pr)

    if not _is_intermediate_trailing_result(rows[-1].get("result", "")):
        return

    # 要約表は「本表が複数球ある」のに欠けた続きがあるときだけ使う（1行だけのページでの誤追補を防ぐ）
    if len(rows) < 2:
        return

    covered: set[int] = set()
    for r in rows:
        pn = r.get("pitch_no", "")
        if str(pn).isdigit():
            covered.add(int(pn))

    next_need = max(covered) + 1 if covered else 1
    best_pairs: list[tuple[int, str]] | None = None

    for table in soup.find_all("table"):
        if not _table_in_pitch_detail_context(table):
            continue
        pairs = _parse_two_column_pitch_index_pairs(table)
        if len(pairs) < 2:
            continue
        if pairs[0][0] != 1:
            continue
        max_ix = max(i for i, _ in pairs)
        if max_ix < next_need:
            continue
        if best_pairs is None or max_ix > max(i for i, _ in best_pairs):
            best_pairs = pairs

    if not best_pairs:
        return

    for ix, res in sorted(best_pairs, key=lambda x: x[0]):
        if ix in covered:
            continue
        if ix < next_need:
            continue
        if ix > next_need:
            break
        rows.append(
            {
                "game_id": game_id,
                "inning": str(inning),
                "top_bottom": top_bottom,
                "bat_order": str(bat_order),
                "pitcher_id": pitcher_id,
                "batter_id": batter_id,
                "batter_name": batter_name,
                "batter_hand": batter_hand,
                "pitch_no": str(next_need),
                "pitch_type": "",
                "speed_kmh": "",
                "result": res,
                "zone_top_px": "",
                "zone_left_px": "",
                "zone_row": "",
                "zone_col": "",
                "zone_id": "",
            }
        )
        covered.add(next_need)
        next_need += 1
        if not _is_intermediate_trailing_result(res):
            break


def parse_pitch_details(
    html: str,
    game_id: str,
    inning: int,
    top_bottom: str,
    bat_order: int,
    *,
    global_row_start: int = 1,
    zone_seq_start: int = 1,
    next_zone_seq_out: list[int] | None = None,
) -> list[dict]:
    """
    詳しい投球内容のHTMLをパースし、投球リストを返す。
    global_row_start / zone_seq_start: 同一打席の続き score ページを結合するときの通し番号の開始値。
    next_zone_seq_out: 1要素のリストを渡すと、次ページ用のゾーン連番開始値を書き戻す。
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
    # 同一打席で「ランエンドヒット」等の区切りのあと2枚目の投球表が続く場合、チャートも複数になる。
    # 投球テーブルは同一ヘッダの bb-splitsTable をすべて結合し、ゾーンは打席通しの連番で対応付ける。

    pitch_tables: list = []
    for table in soup.find_all("table", class_="bb-splitsTable"):
        thead = table.find("thead")
        if not thead:
            continue
        headers = [th.get_text(strip=True) for th in thead.find_all("th")]
        if "球種" in headers and "球速" in headers and "結果" in headers:
            pitch_tables.append(table)

    # 打席通しの連番（1,2,3,…）でゾーン座標を保持（複数チャートで球番が 1 からやり直す場合に対応）
    zone_by_seq: dict[int, tuple[float, float]] = {}
    seq = zone_seq_start
    for table in pitch_tables:
        parent = table.find_parent("section", class_="bb-splits__item") or table.find_parent()
        chart_td = None
        if parent:
            chart_td = parent.find("td", class_=re.compile(r"allocationChartBg"))
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
                            top_px = float(top_m.group(1))
                            left_px = float(left_m.group(1))
                            zone_by_seq[seq] = (top_px, left_px)
                            seq += 1
                        except (ValueError, TypeError):
                            pass

    # 旧HTML向け: 投球表はあるが上記でゾーンが取れないとき、最初の「詳しい投球内容」付近のチャートを試す
    # 続きページ（zone_seq_start>1）では番号キーが衝突しやすいためスキップ
    if not zone_by_seq and pitch_tables and zone_seq_start == 1:
        for table in soup.find_all("table", class_="bb-splitsTable"):
            thead = table.find("thead")
            if not thead or "詳しい投球内容" not in thead.get_text():
                continue
            chart_td = table.find("td", class_=re.compile(r"allocationChartBg"))
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
                                zone_by_seq[n] = (top_px, left_px)
                            except (ValueError, TypeError):
                                pass
                break

    # 投球テーブル（投球数・球種・球速・結果）— 複数表をすべて結合
    global_row = global_row_start
    last_pitch_tr = None
    for table in pitch_tables:
        tbody = table.find("tbody")
        for row_idx, tr in enumerate(tbody.find_all("tr") if tbody else []):
            pr = _parse_pitch_tr_row(
                tr,
                game_id,
                inning,
                top_bottom,
                bat_order,
                pitcher_id,
                batter_id,
                batter_name,
                batter_hand,
                zone_by_seq,
                global_row,
                row_idx,
            )
            if pr is None:
                continue
            rows.append(pr)
            last_pitch_tr = tr
            global_row += 1

    _extend_pitch_rows_after_ball_trailing(
        soup,
        rows,
        last_pitch_tr,
        game_id,
        inning,
        top_bottom,
        bat_order,
        pitcher_id,
        batter_id,
        batter_name,
        batter_hand,
        zone_by_seq,
    )

    if next_zone_seq_out is not None:
        next_zone_seq_out.clear()
        nz = max(zone_by_seq.keys(), default=zone_seq_start - 1) + 1 if zone_by_seq else zone_seq_start
        next_zone_seq_out.append(nz)

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
        print(f"  [{i+1}/{len(plate_appearances)}] {game_id} {inning}{top_bottom} {bat_order}番 ... ", end="", flush=True)

        chain = fetch_pitch_detail_score_pages_for_pa(
            game_id, inning, top_bottom, bat_order, sleep_sec=args.sleep
        )
        if not chain:
            failed += 1
            print("❌")
            time.sleep(args.sleep)
            continue

        if args.save_html:
            for idx_pg, html_pg in chain:
                (html_dir / f"{game_id}_{idx_pg}.html").write_text(html_pg, encoding="utf-8")

        pages_html = [h for _idx, h in chain]
        rows = parse_pitch_details_merged_score_pages(
            pages_html, game_id, inning, top_bottom, bat_order
        )
        if rows:
            all_rows.extend(rows)
            npg = len(chain)
            extra = f" ({npg}ページ)" if npg > 1 else ""
            print(f"✅ {len(rows)}球{extra}")
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
