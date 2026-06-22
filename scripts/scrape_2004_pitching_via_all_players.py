#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
指定年度の投手成績を「全ての選手から探す」経由で全選手取得する（2004年形式）。

1. https://npb.jp/bis/players/all/index.html から 指定年度の球団URL一覧を取得
2. 各球団ページから在籍選手（player_id）一覧を取得
3. 各選手の bis/players/{id}.html から投手成績表をパースし、該当年度の行があれば取得
4. 球団をCL/PLに振り分け、pitching_YYYY_PL_from_master.csv / pitching_YYYY_CL_from_master.csv を出力

使用例: python scrape_2004_pitching_via_all_players.py --year 2003
"""
import csv
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup

INDEX_URL = "https://npb.jp/bis/players/all/index.html"
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

# 球団名（NPB表記）→ (リーグ, 正式名)。1950〜2024年対応
TEAM_LEAGUE_MAP: Dict[str, Tuple[str, str]] = {
    # === セントラル・リーグ ===
    '読売ジャイアンツ': ('CL', '読売ジャイアンツ'),
    '中日ドラゴンズ': ('CL', '中日ドラゴンズ'),
    '名古屋ドラゴンズ': ('CL', '中日ドラゴンズ'),
    '阪神タイガース': ('CL', '阪神タイガース'),
    '大阪タイガース': ('CL', '阪神タイガース'),
    '広島東洋カープ': ('CL', '広島東洋カープ'),
    '広島カープ': ('CL', '広島東洋カープ'),
    '東京ヤクルトスワローズ': ('CL', '東京ヤクルトスワローズ'),
    'ヤクルトスワローズ': ('CL', '東京ヤクルトスワローズ'),
    '横浜ベイスターズ': ('CL', '横浜DeNAベイスターズ'),
    '横浜DeNAベイスターズ': ('CL', '横浜DeNAベイスターズ'),
    '大洋ホエールズ': ('CL', '大洋ホエールズ'),
    '国鉄スワローズ': ('CL', '国鉄スワローズ'),
    'サンケイスワローズ': ('CL', 'サンケイスワローズ'),
    'サンケイアトムズ': ('CL', 'サンケイアトムズ'),
    'ヤクルトアトムズ': ('CL', '東京ヤクルトスワローズ'),
    'アトムズ': ('CL', '東京ヤクルトスワローズ'),
    '松竹ロビンス': ('CL', '松竹ロビンス'),
    '大洋松竹ロビンス': ('CL', '大洋松竹ロビンス'),
    '西日本パイレーツ': ('CL', '西日本パイレーツ'),
    # === パシフィック・リーグ ===
    '埼玉西武ライオンズ': ('PL', '埼玉西武ライオンズ'),
    '西武ライオンズ': ('PL', '埼玉西武ライオンズ'),
    '福岡ソフトバンクホークス': ('PL', '福岡ソフトバンクホークス'),
    '福岡ダイエーホークス': ('PL', '福岡ソフトバンクホークス'),
    'ダイエーホークス': ('PL', '福岡ソフトバンクホークス'),
    '南海ホークス': ('PL', '南海ホークス'),
    'オリックス・バファローズ': ('PL', 'オリックス・バファローズ'),
    'オリックス・ブルーウェーブ': ('PL', 'オリックス・バファローズ'),
    '千葉ロッテマリーンズ': ('PL', '千葉ロッテマリーンズ'),
    '大阪近鉄バファローズ': ('PL', '大阪近鉄バファローズ'),
    '近鉄バファローズ': ('PL', '大阪近鉄バファローズ'),
    '近鉄パールス': ('PL', '近鉄パールス'),
    '近鉄バファロー': ('PL', '近鉄バファローズ'),
    '北海道日本ハムファイターズ': ('PL', '北海道日本ハムファイターズ'),
    '日本ハムファイターズ': ('PL', '北海道日本ハムファイターズ'),
    '日本ハム・ファイターズ': ('PL', '北海道日本ハムファイターズ'),
    '東北楽天ゴールデンイーグルス': ('PL', '東北楽天ゴールデンイーグルス'),
    '楽天': ('PL', '東北楽天ゴールデンイーグルス'),
    '西鉄ライオンズ': ('PL', '西鉄ライオンズ'),
    '西鉄クリッパース': ('PL', '西鉄クリッパース'),
    '太平洋クラブ・ライオンズ': ('PL', '埼玉西武ライオンズ'),
    '日拓ホーム・フライヤーズ': ('PL', '北海道日本ハムファイターズ'),
    '毎日オリオンズ': ('PL', '毎日オリオンズ'),
    '毎日大映オリオンズ': ('PL', '毎日大映オリオンズ'),
    '東京オリオンズ': ('PL', '東京オリオンズ'),
    'ロッテ・オリオンズ': ('PL', '千葉ロッテマリーンズ'),
    '大映スターズ': ('PL', '大映スターズ'),
    '東急フライヤーズ': ('PL', '東急フライヤーズ'),
    '急映フライヤーズ': ('PL', '急映フライヤーズ'),
    '東映フライヤーズ': ('PL', '東映フライヤーズ'),
    '阪急ブレーブス': ('PL', '阪急ブレーブス'),
    '高橋ユニオンズ': ('PL', '高橋ユニオンズ'),
    'トンボユニオンズ': ('PL', 'トンボユニオンズ'),
    '大映ユニオンズ': ('PL', '大映ユニオンズ'),
}


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


def _get_player_html(player_id: str, cache_dir: Path, retry: int = 2) -> Tuple[Optional[str], bool]:
    """
    選手個人ページは統合スクレイパと同じキャッシュを使う。
    Returns: (html, fetched_via_network)
    """
    cache_path = cache_dir / f"{player_id}.html"
    if cache_path.is_file():
        return cache_path.read_text(encoding='utf-8', errors='replace'), False

    url = f"https://npb.jp/bis/players/{player_id}.html"
    html = _get(url, retry=retry)
    if html:
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(html, encoding='utf-8')
        return html, True
    return None, False


def get_team_urls_for_year(year: int) -> List[Tuple[str, str, str]]:
    """インデックスから指定年度の (球団表示名, league, url) を取得。"""
    html = _get(INDEX_URL)
    if not html:
        return []
    soup = BeautifulSoup(html, 'lxml')
    result: List[Tuple[str, str, str]] = []
    year_str = str(year)
    pattern = f'/bis/players/search/yearly/{year_str}/'
    for a in soup.find_all('a', href=True):
        href = a.get('href', '')
        if pattern not in href:
            continue
        text = a.get_text(strip=True)
        if not text or len(text) > 50:
            continue
        # リンクテキストが球団名（括弧や「年」が含まれない、または「○○(2004)」でない）
        team_label = text.replace('(', '（').replace(')', '）')
        if '（' in team_label:
            team_label = team_label.split('（')[0].strip()
        url = href if href.startswith('http') else 'https://npb.jp' + (href if href.startswith('/') else '/' + href)
        league_name = None
        for key in sorted(TEAM_LEAGUE_MAP.keys(), key=len, reverse=True):
            if key in text or key in team_label:
                league_name = TEAM_LEAGUE_MAP[key]
                break
        if not league_name:
            if '巨人' in text or '読売' in text:
                league_name = ('CL', '読売ジャイアンツ')
            elif '西武' in text or '太平洋クラブ' in text:
                league_name = ('PL', '埼玉西武ライオンズ')
            elif '中日' in text or '名古屋' in text:
                league_name = ('CL', '中日ドラゴンズ')
            elif '阪神' in text or '大阪タイガース' in text:
                league_name = ('CL', '阪神タイガース')
            elif '広島' in text:
                league_name = ('CL', '広島東洋カープ')
            elif 'ヤクルト' in text:
                league_name = ('CL', '東京ヤクルトスワローズ')
            elif '国鉄' in text or 'サンケイ' in text or 'アトムズ' in text:
                league_name = ('CL', '国鉄スワローズ')
            elif '横浜' in text or 'ベイスターズ' in text or '大洋' in text:
                league_name = ('CL', '大洋ホエールズ')
            elif 'ダイエー' in text or 'ソフトバンク' in text or ('ホークス' in text and '南海' not in text):
                league_name = ('PL', '福岡ソフトバンクホークス')
            elif 'オリックス' in text:
                league_name = ('PL', 'オリックス・バファローズ')
            elif 'ロッテ' in text or 'マリーンズ' in text or 'オリオンズ' in text:
                league_name = ('PL', '千葉ロッテマリーンズ')
            elif '近鉄' in text:
                league_name = ('PL', '大阪近鉄バファローズ')
            elif '日本ハム' in text or ('ファイターズ' in text and '東映' in text) or '日拓' in text:
                league_name = ('PL', '北海道日本ハムファイターズ')
            elif '南海' in text:
                league_name = ('PL', '南海ホークス')
            elif '西鉄' in text or 'ライオン' in text:
                league_name = ('PL', '埼玉西武ライオンズ')
            elif '東映' in text or '東急' in text or '急映' in text:
                league_name = ('PL', '北海道日本ハムファイターズ')
            elif '阪急' in text or 'ブレーブス' in text:
                league_name = ('PL', '阪急ブレーブス')
            elif '松竹' in text or 'ロビンス' in text:
                league_name = ('CL', '松竹ロビンス')
            elif '西日本' in text or 'パイレーツ' in text:
                league_name = ('CL', '西日本パイレーツ')
            elif '楽天' in text:
                league_name = ('PL', '東北楽天ゴールデンイーグルス')
        if league_name:
            league, name = league_name
            result.append((name, league, url))
    # 重複除去（同一URL）
    seen = set()
    unique = []
    for name, league, url in result:
        if url not in seen:
            seen.add(url)
            unique.append((name, league, url))
    return unique


def get_player_list_from_team_page(team_url: str) -> List[Tuple[str, str]]:
    """球団ページから (player_id, player_name_ja) のリストを取得。"""
    html = _get(team_url)
    if not html:
        return []
    soup = BeautifulSoup(html, 'lxml')
    players: List[Tuple[str, str]] = []
    for a in soup.find_all('a', href=re.compile(r'/bis/players/\d+\.html')):
        href = a.get('href', '')
        m = re.search(r'/bis/players/(\d+)\.html', href)
        if not m:
            continue
        pid = m.group(1)
        text = a.get_text(strip=True)
        # "上原 浩治 1999年 公式戦初出場" → "上原 浩治"
        name = re.sub(r'\s*\d{4}年\s*(公式戦初出場|入団).*', '', text).strip()
        if not name or len(name) > 30:
            name = text.split()[0] + ' ' + text.split()[1] if len(text.split()) >= 2 else text
        players.append((pid, name))
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


def get_player_pitching_for_year(
    player_id: str,
    player_name_ja: str,
    team: str,
    league: str,
    year: int,
    cache_dir: Path,
) -> Tuple[Optional[Dict[str, Any]], bool]:
    """選手ページから指定年度の投手成績1行を取得。なければ None。"""
    from lib.npb_player_unified import parse_pitching_from_html

    html, fetched_network = _get_player_html(player_id, cache_dir)
    if not html:
        return None, fetched_network
    parsed = parse_pitching_from_html(
        html,
        player_id,
        player_name_ja,
        {year},
        default_league=league,
        default_team=team,
    )
    row = parsed.get(year)
    if row is None:
        return None, fetched_network
    return row, fetched_network


def _log_progress(log_path: Optional[Path], msg: str) -> None:
    """進捗をログファイルに追記（--progress-log 指定時）。"""
    if not log_path:
        return
    try:
        with open(log_path, 'a', encoding='utf-8') as f:
            from datetime import datetime
            f.write(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--year', type=int, default=2004, help='取得する年度（例: 2003）')
    parser.add_argument('--test', action='store_true', help='球団URL取得のみ実行')
    parser.add_argument('--staging', action='store_true', help='Phase 3用ステージング出力に保存する')
    parser.add_argument('--out-dir', type=str, default='', help='出力ディレクトリを明示指定する')
    parser.add_argument('--cache-dir', type=str, default='', help='選手個人ページHTMLキャッシュ（既定: _data/cache/npb_player_page）')
    parser.add_argument('--progress-log', type=str, default='', help='進捗ログを書き出すファイルパス（相対はプロジェクトの_data配下）')
    args = parser.parse_args()
    year = args.year

    project_root = Path(__file__).resolve().parents[1]
    if args.out_dir:
        out_dir = Path(args.out_dir)
        if not out_dir.is_absolute():
            out_dir = project_root / out_dir
    elif args.staging:
        out_dir = project_root / '_data' / 'master_csv__rescrape_staging'
    else:
        out_dir = project_root / '_data' / 'master_csv__import_1950_2024'
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.cache_dir:
        cache_dir = Path(args.cache_dir)
        if not cache_dir.is_absolute():
            cache_dir = project_root / cache_dir
    else:
        cache_dir = project_root / '_data' / 'cache' / 'npb_player_page'
    cache_dir.mkdir(parents=True, exist_ok=True)

    progress_log: Optional[Path] = None
    if args.progress_log:
        progress_log = Path(args.progress_log) if os.path.isabs(args.progress_log) else out_dir / args.progress_log
        progress_log.parent.mkdir(parents=True, exist_ok=True)

    print(f"=== {year}年 投手成績（「全ての選手から探す」経由）===\n", flush=True)
    _log_progress(progress_log, f"開始 {year}年")

    teams = get_team_urls_for_year(year)
    if not teams:
        print(f"❌ {year}年の球団URLを取得できませんでした")
        sys.exit(1)
    if args.test:
        print("--test: 球団URLのみ表示して終了")
        for name, league, url in teams:
            print(f"  {league} {name} {url}")
        return
    print(f"球団数: {len(teams)}")
    for name, league, url in teams:
        print(f"  {league} {name}")

    by_league: Dict[str, List[Dict[str, Any]]] = {'PL': [], 'CL': []}
    seen_ids: Dict[str, set] = {'PL': set(), 'CL': set()}
    total_players = 0
    total_pitchers = 0
    total_network_gets = 0

    for team_name, league, team_url in teams:
        players = get_player_list_from_team_page(team_url)
        total_players += len(players)
        print(f"\n{team_name} ({league}): {len(players)}名 → 投手成績取得中...", flush=True)
        _log_progress(progress_log, f"{year} {team_name} ({league}): {len(players)}名 取得中")
        for i, (pid, pname) in enumerate(players):
            if pid in seen_ids[league]:
                continue
            row, fetched_network = get_player_pitching_for_year(pid, pname, team_name, league, year, cache_dir)
            if fetched_network:
                total_network_gets += 1
            if row:
                seen_ids[league].add(pid)
                by_league[league].append(row)
                total_pitchers += 1
            if (i + 1) % 20 == 0:
                print(f"  ... {i+1}/{len(players)}", flush=True)
                _log_progress(progress_log, f"  ... {i+1}/{len(players)}")
            time.sleep(0.2)
        time.sleep(0.25)

    print(f"\n取得: 延べ選手 {total_players}名、{year}年投手成績あり {total_pitchers}名")
    print(f"  選手ページ network GET: {total_network_gets} 回（キャッシュ命中は除外）")
    _log_progress(progress_log, f"{year}年 完了 延べ{total_players}名 投手成績{total_pitchers}名 network_gets:{total_network_gets} CL:{len(by_league['CL'])} PL:{len(by_league['PL'])}")
    print(f"  CL: {len(by_league['CL'])}名  PL: {len(by_league['PL'])}名")

    for league in ('PL', 'CL'):
        data = by_league[league]
        if not data:
            print(f"  ⚠️ {league} は0件です")
            continue
        out_path = out_dir / f'pitching_{year}_{league}_from_master.csv'
        headers = ['year', 'league', 'team', 'player_id', 'player_name_ja', 'player_name_en',
                   'G', 'IP', 'W', 'L', 'SV', 'ERA', 'BF', 'H', 'HR', 'BB', 'IBB', 'HBP', 'SO', 'ER', 'R']
        optional = ['HOLD', 'HP', 'CG', 'SHO', 'WPCT', 'WP', 'BK']
        for k in optional:
            if k in data[0]:
                headers.append(k)
        with open(out_path, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=headers, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(data)
        print(f"✅ {out_path} （{len(data)}件）")
        _log_progress(progress_log, f"✅ {out_path.name} {len(data)}件")

    print("\n完了。")
    _log_progress(progress_log, f"{year}年 処理完了")


if __name__ == '__main__':
    if sys.platform == 'win32':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    main()
