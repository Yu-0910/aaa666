#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
2025年投手成績を球団別選手一覧（rst_*.html）経由で全投手取得する。

1. https://npb.jp/bis/teams/rst_{id}.html から各球団の支配下・育成の投手一覧を取得
2. 各選手の bis/players/{id}.html から投手成績表をパースし、2025年の行があれば取得
3. 球団をCL/PLに振り分け、pitching_2025_PL_from_master.csv / pitching_2025_CL_from_master.csv を出力

使用例: python scrape_2025_pitching_via_roster.py
"""
import csv
import io
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import requests
from bs4 import BeautifulSoup

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

# rst_id → (league, team_name)
RST_TEAMS: Dict[str, Tuple[str, str]] = {
    'g': ('CL', '読売ジャイアンツ'),
    't': ('CL', '阪神タイガース'),
    'db': ('CL', '横浜DeNAベイスターズ'),
    'c': ('CL', '広島東洋カープ'),
    's': ('CL', '東京ヤクルトスワローズ'),
    'd': ('CL', '中日ドラゴンズ'),
    'h': ('PL', '福岡ソフトバンクホークス'),
    'f': ('PL', '北海道日本ハムファイターズ'),
    'm': ('PL', '千葉ロッテマリーンズ'),
    'e': ('PL', '東北楽天ゴールデンイーグルス'),
    'b': ('PL', 'オリックス・バファローズ'),
    'l': ('PL', '埼玉西武ライオンズ'),
}

YEAR = 2025
BASE_URL = "https://npb.jp/bis/teams"


def _get(url: str, retry: int = 2) -> Optional[str]:
    for attempt in range(retry + 1):
        try:
            if attempt > 0:
                time.sleep(1)
            r = requests.get(url, headers=HEADERS, timeout=25)
            r.raise_for_status()
            r.encoding = r.apparent_encoding or 'utf-8'
            return r.text
        except requests.RequestException as e:
            print(f"  ⚠️ {url}: {e}")
    return None


def get_pitchers_from_roster(rst_id: str) -> List[Tuple[str, str]]:
    """球団rstページから (player_id, player_name_ja) の投手リストを取得。支配下・育成の両方を含む。"""
    url = f"{BASE_URL}/rst_{rst_id}.html"
    html = _get(url)
    if not html:
        return []
    soup = BeautifulSoup(html, 'lxml')
    players: List[Tuple[str, str]] = []
    in_pitcher_section = False

    for table in soup.find_all('table'):
        rows = table.find_all('tr')
        for row in rows:
            cells = row.find_all(['th', 'td'])
            if len(cells) < 2:
                continue
            second_cell = cells[1].get_text(strip=True)
            if second_cell == '投手':
                in_pitcher_section = True
                continue
            if second_cell in ('捕手', '内野手', '外野手'):
                in_pitcher_section = False
                continue
            if not in_pitcher_section:
                continue
            for a in row.find_all('a', href=re.compile(r'/bis/players/\d+\.html')):
                m = re.search(r'/bis/players/(\d+)\.html', a.get('href', ''))
                if m:
                    pid = m.group(1)
                    name = a.get_text(strip=True)
                    if name and len(name) < 30:
                        players.append((pid, name))
                break
    return players


def _safe_int(v: Any) -> Optional[int]:
    if v is None:
        return None
    s = str(v).strip().replace(',', '')
    if not s or s == '-' or s == '－':
        return None
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None


def _safe_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    s = str(v).strip().replace(',', '')
    if not s or s == '-' or s == '－':
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _parse_ip_cells(cells: List, ip_idx: int) -> Tuple[Optional[float], int]:
    """投球回をパース。NPBは「111」+「.2」の2セル形式あり。返す: (IPの値, 消費したセル数)"""
    if ip_idx >= len(cells):
        return None, 0
    t0 = cells[ip_idx].get_text(strip=True).replace(',', '')
    if not t0:
        return None, 1
    try:
        whole = int(t0)
    except ValueError:
        return _safe_float(t0), 1
    if ip_idx + 1 < len(cells):
        t1 = cells[ip_idx + 1].get_text(strip=True)
        if re.match(r'^\.\d+$', t1):
            return _safe_float(t0 + t1), 2
        if t1 == '+' and ip_idx + 2 < len(cells):
            t2 = cells[ip_idx + 2].get_text(strip=True)
            if t2 in ('0', '1', '2'):
                return whole + int(t2) / 3.0, 3
    return float(whole), 1


def get_player_pitching_for_year(
    player_id: str, player_name_ja: str, team: str, league: str, year: int
) -> Optional[Dict[str, Any]]:
    """選手ページから指定年度の投手成績1行を取得。なければ None。"""
    url = f"https://npb.jp/bis/players/{player_id}.html"
    html = _get(url)
    if not html:
        return None
    soup = BeautifulSoup(html, 'lxml')
    for table in soup.find_all('table'):
        rows = table.find_all('tr')
        if len(rows) < 2:
            continue
        header_cells = rows[0].find_all(['th', 'td'])
        header_texts = [c.get_text(strip=True) for c in header_cells]
        header_joined = ''.join(header_texts).replace(' ', '')
        if '年度' not in header_joined or '防御率' not in header_joined or '投球回' not in header_joined:
            continue
        if '登板' not in header_joined and '試合' not in header_joined:
            continue
        col_map: Dict[str, int] = {}
        for i, h in enumerate(header_texts):
            h = h.replace(' ', '')
            if '年度' in h:
                col_map['year'] = i
            elif '登板' in h:
                col_map['G'] = i
            elif '勝利' in h:
                col_map['W'] = i
            elif '敗北' in h:
                col_map['L'] = i
            elif 'セーブ' in h:
                col_map['SV'] = i
            elif h == 'H' and 'HP' in header_joined:
                col_map['HOLD'] = i
            elif 'HP' in h or h == 'ＨＰ':
                col_map['HP'] = i
            elif '完投' in h:
                col_map['CG'] = i
            elif '完封' in h:
                col_map['SHO'] = i
            elif '勝率' in h:
                col_map['WPCT'] = i
            elif '打者' in h:
                col_map['BF'] = i
            elif '投球回' in h:
                col_map['IP'] = i
            elif '安打' in h:
                col_map['H'] = i
            elif '本塁打' in h:
                col_map['HR'] = i
            elif '四球' in h and '故意' not in h:
                col_map['BB'] = i
            elif '死球' in h:
                col_map['HBP'] = i
            elif '三振' in h:
                col_map['SO'] = i
            elif '暴投' in h:
                col_map['WP'] = i
            elif 'ボーク' in h:
                col_map['BK'] = i
            elif '失点' in h:
                col_map['R'] = i
            elif '自責' in h:
                col_map['ER'] = i
            elif '防御率' in h:
                col_map['ERA'] = i
        if 'year' not in col_map or 'G' not in col_map or 'IP' not in col_map:
            continue
        cols_after_ip = ['H', 'HR', 'BB', 'HBP', 'SO', 'WP', 'BK', 'R', 'ER', 'ERA']
        cols_offset_2 = ['R', 'ER', 'ERA']
        header_len = len(header_cells)
        for row in rows[1:]:
            cells = row.find_all(['th', 'td'])
            if col_map['year'] >= len(cells):
                continue
            year_val = cells[col_map['year']].get_text(strip=True).replace(' ', '')
            year_str = str(year)
            year_zen = str(year).translate(str.maketrans('0123456789', '０１２３４５６７８９'))
            if year_val != year_str and year_val != year_zen:
                continue
            g = _safe_int(cells[col_map['G']].get_text(strip=True)) if col_map.get('G') is not None and col_map['G'] < len(cells) else None
            if g is not None and g == 0:
                continue
            ip_val, ip_cells = _parse_ip_cells(cells, col_map['IP'])
            # ヘッダより行が長い分は IP 周辺の colspan ずれ（例: 120 + 120 + 空）
            row_extra = max(0, len(cells) - header_len)
            ip_extra = max(0, ip_cells - 1)
            if ip_cells == 1 and row_extra > 0:
                ip_extra = row_extra

            def _cell_idx(key: str) -> int:
                idx = col_map.get(key)
                if idx is None:
                    return -1
                if key in cols_after_ip:
                    offset = ip_extra - 1 if key in cols_offset_2 and ip_extra >= 3 else ip_extra
                    idx = idx + offset
                return idx

            def _read(k: str, as_float: bool = False) -> Any:
                idx = _cell_idx(k)
                if idx < 0 or idx >= len(cells):
                    return None
                t = cells[idx].get_text(strip=True).replace(',', '')
                if not t or t in ('-', '－'):
                    return None
                return (_safe_float(t) if as_float else _safe_int(t))

            def _read_tail() -> Optional[Dict[str, Any]]:
                """行末 R/ER/ERA と被安〜三振を固定オフセットで読む（NPB 表の IP 列ずれ対策）"""
                if len(cells) < 11:
                    return None
                era_t = cells[-1].get_text(strip=True).replace(',', '')
                if not era_t or era_t in ('-', '－'):
                    return None
                era_v = _safe_float(era_t)
                if era_v is None or era_v > 15:
                    return None
                er_v = _safe_int(cells[-2].get_text(strip=True))
                r_v = _safe_int(cells[-3].get_text(strip=True))
                if er_v is None or r_v is None:
                    return None
                return {
                    'H': _safe_int(cells[-10].get_text(strip=True)),
                    'HR': _safe_int(cells[-9].get_text(strip=True)),
                    'BB': _safe_int(cells[-8].get_text(strip=True)),
                    'HBP': _safe_int(cells[-7].get_text(strip=True)),
                    'SO': _safe_int(cells[-6].get_text(strip=True)),
                    'WP': _safe_int(cells[-5].get_text(strip=True)),
                    'BK': _safe_int(cells[-4].get_text(strip=True)),
                    'R': r_v,
                    'ER': er_v,
                    'ERA': era_v,
                }

            def _row_plausible(data: Dict[str, Any]) -> bool:
                ip_d = data.get('IP')
                er_v = data.get('ER') or 0
                era_v = data.get('ERA')
                h_v = data.get('H') or 0
                if ip_d is None or float(ip_d) <= 0:
                    return False
                if isinstance(era_v, (int, float)) and float(era_v) > 15:
                    return False
                if h_v > float(ip_d) * 1.5:
                    return False
                if er_v > 0 and isinstance(era_v, (int, float)):
                    exp = round((float(er_v) * 9) / float(ip_d), 2)
                    if abs(float(era_v) - exp) > 0.25:
                        return False
                return True

            row_data: Dict[str, Any] = {
                'year': year,
                'league': league,
                'team': team,
                'player_id': player_id,
                'player_name_ja': player_name_ja,
                'player_name_en': '',
                'G': g,
                'IP': ip_val,
                'W': _read('W'),
                'L': _read('L'),
                'SV': _read('SV'),
                'ERA': _read('ERA', as_float=True),
                'BF': _read('BF'),
                'H': _read('H'),
                'HR': _read('HR'),
                'BB': _read('BB'),
                'IBB': None,
                'HBP': _read('HBP'),
                'SO': _read('SO'),
                'ER': _read('ER'),
                'R': _read('R'),
            }
            for key, ckey in [('HOLD', 'HOLD'), ('HP', 'HP'), ('CG', 'CG'), ('SHO', 'SHO'), ('WPCT', 'WPCT'), ('WP', 'WP'), ('BK', 'BK')]:
                idx = _cell_idx(ckey)
                if idx >= 0 and idx < len(cells):
                        row_data[key] = _safe_float(cells[idx].get_text(strip=True)) if key == 'WPCT' else _safe_int(cells[idx].get_text(strip=True))
            if not _row_plausible(row_data):
                tail = _read_tail()
                if tail:
                    row_data.update({k: v for k, v in tail.items() if v is not None})
            return row_data
    return None


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--league', choices=['CL', 'PL', 'all'], default='all', help='取得するリーグ (all=両方)')
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    out_dir = project_root / '_data' / 'master_csv__import_1950_2024'
    out_dir.mkdir(parents=True, exist_ok=True)

    league_filter = None if args.league == 'all' else args.league
    print(f"=== {YEAR}年 投手成績（球団別選手一覧 rst_* 経由）===\n")

    by_league: Dict[str, List[Dict[str, Any]]] = {'PL': [], 'CL': []}
    seen_ids: Dict[str, set] = {'PL': set(), 'CL': set()}
    total_roster = 0
    total_pitchers = 0

    for rst_id, (league, team_name) in RST_TEAMS.items():
        if league_filter and league != league_filter:
            continue
        pitchers = get_pitchers_from_roster(rst_id)
        total_roster += len(pitchers)
        print(f"{team_name} ({league}): {len(pitchers)}名 → 投手成績取得中...", flush=True)
        for i, (pid, pname) in enumerate(pitchers):
            if pid in seen_ids[league]:
                continue
            row = get_player_pitching_for_year(pid, pname, team_name, league, YEAR)
            if row:
                seen_ids[league].add(pid)
                by_league[league].append(row)
                total_pitchers += 1
            if (i + 1) % 20 == 0:
                print(f"  ... {i+1}/{len(pitchers)}", flush=True)
            time.sleep(0.2)
        time.sleep(0.25)

    print(f"\n取得: 延べ投手 {total_roster}名、{YEAR}年投手成績あり {total_pitchers}名")
    print(f"  CL: {len(by_league['CL'])}名  PL: {len(by_league['PL'])}名")

    for league in ('CL', 'PL'):
        data = by_league[league]
        if not data:
            print(f"  ⚠️ {league} は0件です")
            continue
        out_path = out_dir / f'pitching_{YEAR}_{league}_from_master.csv'
        tmp_path = out_dir / f'pitching_{YEAR}_{league}_from_master.csv.tmp'
        headers = ['year', 'league', 'team', 'player_id', 'player_name_ja', 'player_name_en',
                   'G', 'IP', 'W', 'L', 'SV', 'ERA', 'BF', 'H', 'HR', 'BB', 'IBB', 'HBP', 'SO', 'ER', 'R']
        optional = ['HOLD', 'HP', 'CG', 'SHO', 'WPCT', 'WP', 'BK']
        for k in optional:
            if k in data[0]:
                headers.append(k)
        try:
            with open(tmp_path, 'w', encoding='utf-8-sig', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=headers, extrasaction='ignore')
                writer.writeheader()
                writer.writerows(data)
            os.replace(tmp_path, out_path)
            print(f"✅ {out_path} （{len(data)}件）")
        except OSError as e:
            if tmp_path.exists():
                tmp_path.unlink()
            print(f"  ❌ {out_path}: {e}")

    print("\n完了。")


if __name__ == '__main__':
    main()
