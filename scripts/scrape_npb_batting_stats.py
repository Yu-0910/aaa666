#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scrape_npb_batting_stats.py

NPB公式サイトから打撃成績をスクレイピングして、既存のマスターCSVファイルを更新するスクリプト
新規選手（player_idが既存にない）のみを追加し、既存選手のデータは保持する
"""

import argparse
import csv
import sys
import time
import io
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Set
from datetime import datetime
import shutil

# WindowsでのUnicode出力対応
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("❌ エラー: 必要なライブラリがインストールされていません")
    print("   インストール方法: pip install requests beautifulsoup4 lxml")
    sys.exit(1)


def safe_float(value: Any) -> Optional[float]:
    """安全にfloatに変換"""
    if value is None or value == '' or value == 'nan':
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def safe_int(value: Any) -> Optional[int]:
    """安全にintに変換"""
    if value is None or value == '' or value == 'nan':
        return None
    try:
        fval = safe_float(value)
        if fval is None:
            return None
        return int(fval)
    except (ValueError, TypeError):
        return None


def get_player_english_name(player_name_ja: str) -> str:
    """
    選手の日本語名から英字名を取得（既存のマッピングを使用）
    """
    # 既知の選手の英字名マッピング
    player_roman_names = {
        '佐藤輝明': 'Sato Teruaki',
        '岡本和真': 'Okamoto Kazuma',
        '村上宗隆': 'Murakami Munetaka',
        '近本光司': 'Chikamoto Koji',
        '牧秀悟': 'Maki Shugo',
        '佐野恵太': 'Sano Keita',
        '青柳晃洋': 'Aoyagi Koyo',
        '菅野智之': 'Sugano Tomoyuki',
        '大野雄大': 'Ono Yudai',
        '岩崎優': 'Iwasaki Yu',
        '伊勢大夢': 'Ise Hiromu',
        '石田健大': 'Ishida Kenta',
        '戸郷翔征': 'Togou Shosei',
        '山川穂高': 'Yamakawa Hotaka',
        '吉田正尚': 'Yoshida Masataka',
        '中村晃': 'Nakamura Akira',
        '源田壮亮': 'Genda Sosuke',
        '柳田悠岐': 'Yanagita Yuki',
        '浅村栄斗': 'Asamura Hideto',
        '周東佑京': 'Shuto Ukyo',
        '山本由伸': 'Yamamoto Yoshinobu',
        '千賀滉大': 'Senga Kodai',
        '佐々木朗希': 'Sasaki Roki',
        '宮城大弥': 'Miyagi Hiroya',
        '森唯斗': 'Mori Yuito',
        '益田直也': 'Masuda Naoya',
        # 2025年新規選手
        'ファビアン': 'Sandro Fabian',
        'サンドロ・ファビアン': 'Sandro Fabian',
        '西川史礁': 'Nishikawa Shisho',
        '西川 史礁': 'Nishikawa Shisho',
        '牧原　大成': 'Makihara Taisei',
        '柳町　達': 'Yanagimachi Tatsu',
        '中川　圭太': 'Nakagawa Keita',
        '太田　椋': 'Ota Ryo',
        '村林　一輝': 'Murabayashi Kazuki',
        'レイエス': 'Jose Reyes',
        'Reyes': 'Jose Reyes',
        'ネビン': 'Tyler Nevin',
        'Nevin': 'Tyler Nevin',
        '清宮　幸太郎': 'Kiyomiya Kotaro',
        '藤原　恭大': 'Fujiwara Kyota',
        '中島　大輔': 'Nakajima Daisuke',
        '西川　愛也': 'Nishikawa Aiya',
        '宗山　塁': 'Muneayama Rui',
        '紅林　弘太郎': 'Kurebayashi Kotaro',
        '杉本　裕太郎': 'Sugimoto Yutaro',
        '渡部　聖弥': 'Watanabe Seiya',
        '寺地　隆成': 'Teraji Takasei',
        '廣岡　大志': 'Hirooka Taishi',
        '頓宮　裕真': 'Tongu Yuma',
        '万波　中正': 'Mannami Nakamasa',
        '山川　穂高': 'Yamakawa Hotaka',
        '長谷川　信哉': 'Hasegawa Shinya',
        '小園　海斗': 'Osono Kaito',
        '泉口　友汰': 'Izumiguchi Yuta',
        '岡林　勇希': 'Okabayashi Yuki',
        '桑原　将志': 'Kuwahara Masashi',
        '中野　拓夢': 'Nakano Takumu',
        # セ・リーグの追加選手
        '近本　光司': 'Chikamoto Koji',
        '近本光司': 'Chikamoto Koji',
        '佐藤　輝明': 'Sato Teruaki',
        '佐藤輝明': 'Sato Teruaki',
        '吉川　尚輝': 'Yoshikawa Naoki',
        '森下　翔太': 'Morishita Shota',
        '佐野　恵太': 'Sano Keita',
        '上林　誠知': 'Uebayashi Seiji',
        'キャベッジ': 'Tyler Cabbage',
        'Cabbage': 'Tyler Cabbage',
        '大山　悠輔': 'Oyama Yusuke',
        '内山　壮真': 'Uchiyama Soma',
        'ボスラー': 'Sheldon Bosler',
        'Bosler': 'Sheldon Bosler',
        'オスナ': 'Roberto Osuna',
        'Osuna': 'Roberto Osuna',
        '末包　昇大': 'Suetsugu Shota',
    }
    
    # 全角スペースを除去して検索
    player_name_normalized = player_name_ja.replace('\u3000', ' ').replace('　', ' ').strip()
    
    # マッピングのキーも正規化して検索
    normalized_mapping = {}
    for ja_name, en_name in player_roman_names.items():
        normalized_key = ja_name.replace('\u3000', ' ').replace('　', ' ').strip()
        normalized_mapping[normalized_key] = en_name
    
    # 直接マッチ
    if player_name_normalized in normalized_mapping:
        return normalized_mapping[player_name_normalized]
    
    # 部分マッチ（姓のみなど）
    for ja_name_normalized, en_name in normalized_mapping.items():
        if player_name_normalized in ja_name_normalized or ja_name_normalized in player_name_normalized:
            return en_name
    
    # マッチしない場合は空文字列を返す
    return ''


def normalize_team_name(team: str) -> str:
    """チーム名を正規化"""
    team_mapping = {
        '巨人': '読売ジャイアンツ',
        '阪神': '阪神タイガース',
        'DeNA': '横浜DeNAベイスターズ',
        '横浜': '横浜DeNAベイスターズ',
        '広島': '広島東洋カープ',
        '中日': '中日ドラゴンズ',
        'ヤクルト': '東京ヤクルトスワローズ',
        'オリックス': 'オリックス・バファローズ',
        '西武': '埼玉西武ライオンズ',
        'ロッテ': '千葉ロッテマリーンズ',
        '楽天': '東北楽天ゴールデンイーグルス',
        'ソフトバンク': '福岡ソフトバンクホークス',
        '日本ハム': '北海道日本ハムファイターズ',
        '北海道日本ハム': '北海道日本ハムファイターズ',
    }
    for key, value in team_mapping.items():
        if key in team:
            return value
    return team


def extract_player_id_from_url(url: str) -> Optional[str]:
    """URLからplayer_idを抽出"""
    if not url:
        return None
    # 相対パスと絶対パスの両方に対応
    match = re.search(r'/bis/players/(\d+)', url)
    if match:
        return match.group(1)
    return None


def scrape_batting_stats(year: int, league: str, retry: int = 3) -> List[Dict[str, Any]]:
    """
    NPB公式サイトから打撃成績をスクレイピング
    
    Args:
        year: 年度（例: 2025）
        league: リーグ（'PL' または 'CL'）
        retry: リトライ回数
    
    Returns:
        選手成績のリスト（辞書形式）
    """
    # 2005年以降: https://npb.jp/bis/2025/stats/bat_p.html (PL) or bat_c.html (CL)
    if year >= 2005:
        league_code = 'p' if league.upper() == 'PL' else 'c'
        url = f"https://npb.jp/bis/{year}/stats/bat_{league_code}.html"
    else:
        # 2004年以前: 旧URL構造（現在は404の年度あり）
        league_lower = league.lower()
        url = f"https://npb.jp/bis/stats/{year}/{league_lower}/batting.html"
    
    print(f"📡 NPB公式サイトから打撃成績を取得中: {url}")
    
    for attempt in range(retry):
        try:
            # リクエスト間隔を空ける（レート制限対策）
            if attempt > 0:
                time.sleep(2 ** attempt)  # 指数バックオフ
            
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            
            # エンコーディングを検出
            response.encoding = response.apparent_encoding or 'utf-8'
            html = response.text
            
            # HTMLからplayer_idと選手名のマッピングを作成
            player_id_map = {}  # {選手名: player_id} のマッピング
            if '/bis/players/' in html:
                print(f"  ✅ HTMLに '/bis/players/' が含まれています")
                # 選手名とplayer_idのリンクを抽出
                # パターン: <a href="/bis/players/数字.html">選手名</a> または <a href="/bis/players/数字">選手名</a>
                link_pattern = r'<a[^>]*href=["\']([^"\']*\/bis\/players\/(\d+)[^"\']*)["\'][^>]*>([^<]+)<\/a>'
                matches = re.finditer(link_pattern, html, re.IGNORECASE)
                for match in matches:
                    player_id = match.group(2)
                    player_name = match.group(3).strip()
                    # 括弧内のチーム名を除去
                    player_name_clean = re.sub(r'\([^)]+\)', '', player_name).strip()
                    if player_name_clean and len(player_name_clean) < 50:
                        # 選手名を正規化（全角スペースを統一）
                        player_name_normalized = player_name_clean.replace('\u3000', ' ').replace('　', ' ')
                        if player_name_normalized not in player_id_map:
                            player_id_map[player_name_normalized] = player_id
                
                if player_id_map:
                    print(f"  ✅ {len(player_id_map)}個のplayer_idマッピングを作成しました")
                else:
                    print(f"  ⚠️ player_idマッピングを作成できませんでした")
            else:
                print(f"  ⚠️ HTMLに '/bis/players/' が含まれていません")
            
            # BeautifulSoupでパース
            soup = BeautifulSoup(html, 'lxml')
            
            # テーブルを探す（複数のテーブルがある可能性があるため、すべて確認）
            tables = soup.find_all('table')
            if not tables:
                print("⚠️ テーブルが見つかりません。HTML構造を確認してください。")
                # HTMLの一部を出力してデバッグ
                print("HTMLの最初の1000文字:")
                print(html[:1000])
                return []
            
            print(f"📊 {len(tables)}個のテーブルが見つかりました")
            
            players = []
            
            # すべてのテーブルを確認
            for table_idx, table in enumerate(tables):
                rows = table.find_all('tr')
                if len(rows) < 2:  # ヘッダー + データ行が最低1行必要
                    continue
                
                print(f"  テーブル {table_idx + 1}: {len(rows)}行")
                
                # ヘッダー行を探す
                header_row_idx = None
                header_cells = None
                
                for i, row in enumerate(rows):
                    cells = row.find_all(['th', 'td'])
                    cell_texts = [cell.get_text(strip=True) for cell in cells]
                    
                    # ヘッダー行の判定: 選手名や試合などの列名が含まれている
                    # 「順位」と「選手」が両方含まれている行をヘッダーとして判定
                    cell_texts_joined = ' '.join(cell_texts)
                    if '選手' in cell_texts_joined and ('順位' in cell_texts_joined or '試合' in cell_texts_joined or '打席' in cell_texts_joined):
                        header_row_idx = i
                        header_cells = cell_texts
                        print(f"  ✅ ヘッダー行を発見: 行 {i + 1}, 列数: {len(header_cells)}")
                        print(f"     ヘッダー: {header_cells[:5]}...")  # 最初の5列を表示
                        break
                
                if header_row_idx is None:
                    print(f"  ⚠️ テーブル {table_idx + 1} にヘッダー行が見つかりません")
                    # 最初の数行を表示してデバッグ
                    for i in range(min(3, len(rows))):
                        cells = rows[i].find_all(['th', 'td'])
                        cell_texts = [cell.get_text(strip=True) for cell in cells]
                        print(f"      行 {i + 1}: {cell_texts[:5]}...")
                    continue
                
                # 列インデックスをマッピング
                col_map = {}
                for idx, header_text in enumerate(header_cells):
                    header_lower = header_text.lower()
                    if '選手' in header_text or 'name' in header_lower:
                        col_map['name'] = idx
                    elif 'チーム' in header_text or 'team' in header_lower:
                        col_map['team'] = idx
                    elif '試合' in header_text or header_text == 'G':
                        col_map['G'] = idx
                    elif '打席' in header_text or header_text == 'PA':
                        col_map['PA'] = idx
                    elif '打数' in header_text or header_text == 'AB':
                        col_map['AB'] = idx
                    elif '得点' in header_text or header_text == 'R':
                        col_map['R'] = idx
                    elif '安打' in header_text or header_text == 'H':
                        col_map['H'] = idx
                    elif '二塁打' in header_text or header_text == '2B':
                        col_map['2B'] = idx
                    elif '三塁打' in header_text or header_text == '3B':
                        col_map['3B'] = idx
                    elif '本塁打' in header_text or header_text == 'HR':
                        col_map['HR'] = idx
                    elif '塁打' in header_text or header_text == 'TB':
                        col_map['TB'] = idx
                    elif '打点' in header_text or header_text == 'RBI':
                        col_map['RBI'] = idx
                    elif '盗塁刺' in header_text or '盗塁死' in header_text or header_text == 'CS':
                        col_map['CS'] = idx
                    elif header_text == '盗塁' or header_text == 'SB':
                        col_map['SB'] = idx
                    elif '犠打' in header_text or header_text == 'SH':
                        col_map['SH'] = idx
                    elif '犠飛' in header_text or header_text == 'SF':
                        col_map['SF'] = idx
                    elif '四球' in header_text or header_text == 'BB':
                        col_map['BB'] = idx
                    elif '敬遠' in header_text or header_text == 'IBB':
                        col_map['IBB'] = idx
                    elif '死球' in header_text or header_text == 'HBP':
                        col_map['HBP'] = idx
                    elif '三振' in header_text or header_text in ['SO', 'K']:
                        col_map['SO'] = idx
                    elif '併殺打' in header_text or header_text in ['GDP', 'GIDP']:
                        col_map['GDP'] = idx
                    elif '打率' in header_text or header_text == 'AVG':
                        col_map['AVG'] = idx
                    elif '出塁率' in header_text or header_text == 'OBP':
                        col_map['OBP'] = idx
                    elif '長打率' in header_text or header_text in ['SLG', '長打']:
                        col_map['SLG'] = idx
                    elif header_text == 'OPS':
                        col_map['OPS'] = idx
                
                # データ行を処理
                processed_count = 0
                skipped_count = 0
                for row_idx, row in enumerate(rows[header_row_idx + 1:], start=header_row_idx + 2):
                    cells = row.find_all(['td', 'th'])
                    if len(cells) < 3:  # 最小限のデータがない場合はスキップ
                        skipped_count += 1
                        if row_idx <= header_row_idx + 3:  # 最初の3行のみデバッグ出力
                            print(f"      ⚠️ 行 {row_idx}: セル数が少ない ({len(cells)}個)")
                        continue
                    
                    # 選手名とplayer_idを取得
                    # 2025年のページではリンクがないため、選手名から直接取得
                    player_name_with_team = ''
                    player_id = None
                    
                    # 選手名列から選手名を取得
                    if 'name' in col_map and col_map['name'] < len(cells):
                        name_cell = cells[col_map['name']]
                        # セル全体のテキストを取得（括弧内のチーム名も含む）
                        player_name_with_team = name_cell.get_text(strip=True)
                        
                        # まず、リンクがあるか確認
                        player_link = name_cell.find('a', href=lambda x: x and '/bis/players/' in x if x else False)
                        if player_link:
                            player_id = extract_player_id_from_url(player_link.get('href', ''))
                            # リンクのテキストに括弧が含まれていない場合、セル全体から取得
                            link_text = player_link.get_text(strip=True)
                            if '(' not in link_text:
                                player_name_with_team = name_cell.get_text(strip=True)
                            else:
                                player_name_with_team = link_text
                        else:
                            # リンクがない場合、行全体から探す
                            player_link = row.find('a', href=lambda x: x and '/bis/players/' in x if x else False)
                            if player_link:
                                player_id = extract_player_id_from_url(player_link.get('href', ''))
                                link_text = player_link.get_text(strip=True)
                                if '(' not in link_text:
                                    player_name_with_team = name_cell.get_text(strip=True)
                                else:
                                    player_name_with_team = link_text
                            else:
                                # リンクがない場合、player_idは後で検索するか、空にする
                                # 2025年のページではリンクがないため、player_idなしで進める
                                player_id = None
                                # 選手名はセル全体から取得（括弧内のチーム名も含む）
                                # 括弧は後でチーム名抽出時に使用するため、ここでは除去しない
                    else:
                        # 選手名列が見つからない場合、行全体から探す
                        player_link = row.find('a', href=lambda x: x and '/bis/players/' in x if x else False)
                        if player_link:
                            player_id = extract_player_id_from_url(player_link.get('href', ''))
                            player_name_with_team = player_link.get_text(strip=True)
                        else:
                            skipped_count += 1
                            if row_idx <= header_row_idx + 3:
                                debug_cells = [cell.get_text(strip=True)[:20] for cell in cells[:5]]
                                print(f"      ⚠️ 行 {row_idx}: 選手名が見つかりません。セル内容: {debug_cells}")
                            continue
                    
                    if not player_name_with_team:
                        skipped_count += 1
                        continue
                    
                    # 選手名からチーム名を抽出（括弧内のチーム略称を取得）
                    # 例: "牧原　大成(ソ)" -> 選手名: "牧原　大成", チーム: "ソ"
                    # 注意: player_name_with_teamには括弧が含まれている可能性がある
                    team_match = re.search(r'\(([^)]+)\)', player_name_with_team)
                    if team_match:
                        team_code = team_match.group(1)
                        # チーム略称を正式名に変換
                        team_code_map = {
                            '巨': '読売ジャイアンツ', '神': '阪神タイガース', 'デ': '横浜DeNAベイスターズ',
                            '横': '横浜DeNAベイスターズ', '広': '広島東洋カープ', '中': '中日ドラゴンズ',
                            'ヤ': '東京ヤクルトスワローズ', 'オ': 'オリックス・バファローズ',
                            '西': '埼玉西武ライオンズ', 'ロ': '千葉ロッテマリーンズ',
                            '楽': '東北楽天ゴールデンイーグルス', 'ソ': '福岡ソフトバンクホークス',
                            '日': '北海道日本ハムファイターズ', 'ハ': '北海道日本ハムファイターズ'
                        }
                        team = team_code_map.get(team_code, '')
                        # 括弧とチーム名を除去して選手名のみを取得
                        player_name_ja = re.sub(r'\([^)]+\)', '', player_name_with_team).strip()
                    else:
                        player_name_ja = player_name_with_team
                        team = ''
                    
                    # チーム名が見つからない場合、セル全体を検索
                    if not team:
                        if 'team' in col_map and col_map['team'] < len(cells):
                            team_text = cells[col_map['team']].get_text(strip=True)
                            team = normalize_team_name(team_text)
                        
                        if not team:
                            for cell in cells:
                                cell_text = cell.get_text(strip=True)
                                team_patterns = [
                                    '巨人', '阪神', 'DeNA', '横浜', '広島', '中日', 'ヤクルト',
                                    'オリックス', '西武', 'ロッテ', '楽天', 'ソフトバンク', '日本ハム', '北海道日本ハム'
                                ]
                                for pattern in team_patterns:
                                    if pattern in cell_text:
                                        team = normalize_team_name(cell_text)
                                        break
                                if team:
                                    break
                    
                    # player_idがない場合、HTMLから抽出したマッピングから検索
                    if not player_id:
                        # 選手名を正規化してマッチング
                        player_name_normalized = player_name_ja.replace('\u3000', ' ').replace('　', ' ')
                        if player_name_normalized in player_id_map:
                            player_id = player_id_map[player_name_normalized]
                            if processed_count < 3:
                                print(f"      ✅ 行 {row_idx}: player_idを割り当てました。選手名: {player_name_ja}, player_id: {player_id}")
                        else:
                            # 部分マッチングを試行（姓のみ、名のみなど）
                            for mapped_name, mapped_id in player_id_map.items():
                                if player_name_normalized in mapped_name or mapped_name in player_name_normalized:
                                    player_id = mapped_id
                                    if processed_count < 3:
                                        print(f"      ✅ 行 {row_idx}: player_idを部分マッチで割り当てました。選手名: {player_name_ja}, player_id: {player_id}")
                                    break
                            
                            if not player_id and processed_count < 3:
                                print(f"      ⚠️ 行 {row_idx}: player_idが見つかりません。選手名: {player_name_ja}")
                    
                    # 英字名を取得（既存のマッピングから）
                    player_name_en = get_player_english_name(player_name_ja)
                    
                    # 成績データを取得
                    player_data = {
                        'year': year,
                        'league': league,
                        'team': team,
                        'player_id': player_id or '',  # player_idがない場合は空文字
                        'player_name_ja': player_name_ja,
                        'player_name_en': player_name_en,
                    }
                    
                    # 各統計項目を取得
                    stat_keys = ['G', 'PA', 'AB', 'R', 'H', '2B', '3B', 'HR', 'TB', 'RBI', 'SB', 'CS', 'SH', 'SF', 'BB', 'IBB', 'HBP', 'SO', 'GDP', 'AVG', 'OBP', 'SLG', 'OPS']
                    for key in stat_keys:
                        if key in col_map and col_map[key] < len(cells):
                            cell_text = cells[col_map[key]].get_text(strip=True).replace(',', '')
                            if key in ['AVG', 'OBP', 'SLG', 'OPS']:
                                player_data[key] = safe_float(cell_text)
                            else:
                                player_data[key] = safe_int(cell_text)
                        else:
                            player_data[key] = None
                    
                    players.append(player_data)
                    processed_count += 1
                
                print(f"  📈 処理結果: {processed_count}件の選手データを取得, {skipped_count}件をスキップ")
                
                # 最初の有効なテーブルでデータが取得できたら終了
                if players:
                    break
            
            if not players:
                print("⚠️ 選手データを取得できませんでした。HTML構造が予想と異なる可能性があります。")
                print("HTMLの一部を出力してデバッグ:")
                print(html[:2000])
            
            print(f"✅ {len(players)}人の選手データを取得しました")
            return players
            
        except requests.exceptions.RequestException as e:
            print(f"⚠️ リクエストエラー (試行 {attempt + 1}/{retry}): {e}")
            if attempt == retry - 1:
                print(f"❌ スクレイピングに失敗しました: {e}")
                return []
        except Exception as e:
            print(f"❌ エラーが発生しました: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    return []


def load_existing_csv(csv_path: Path) -> tuple[List[Dict[str, Any]], List[str]]:
    """
    既存CSVファイルを読み込む
    
    Returns:
        (データ行のリスト, ヘッダー行)
    """
    if not csv_path.exists():
        return [], []
    
    try:
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []
            rows = list(reader)
        return rows, headers
    except Exception as e:
        print(f"⚠️ 既存CSVの読み込みエラー: {e}")
        return [], []


def update_existing_csv(scraped_data: List[Dict[str, Any]], existing_path: Path, year: int, league: str) -> tuple[List[Dict[str, Any]], int]:
    """
    既存CSVファイルを更新（新規選手のみ追加）
    
    Args:
        scraped_data: スクレイピングで取得したデータ
        existing_path: 既存CSVファイルのパス
        year: 年度
        league: リーグ
    
    Returns:
        (更新後の全データ, 追加された新規選手数)
    """
    # 既存データを読み込む
    existing_rows, headers = load_existing_csv(existing_path)
    
    # player_idをキーとして既存データをマップ
    existing_player_ids: Set[str] = set()
    existing_player_names: Set[tuple] = set()  # (選手名, チーム名)のタプル
    for row in existing_rows:
        player_id = str(row.get('player_id', '')).strip()
        if player_id:
            existing_player_ids.add(player_id)
        # player_idがない場合、選手名とチーム名でマッチング
        player_name = str(row.get('player_name_ja', '')).strip()
        team = str(row.get('team', '')).strip()
        if player_name and team:
            existing_player_names.add((player_name, team))
    
    print(f"📖 既存データ: {len(existing_rows)}件（player_id: {len(existing_player_ids)}件）")
    
    # 新規選手を抽出
    new_players = []
    for player in scraped_data:
        player_id = str(player.get('player_id', '')).strip()
        player_name = str(player.get('player_name_ja', '')).strip()
        team = str(player.get('team', '')).strip()
        
        is_new = False
        if player_id:
            # player_idがある場合、player_idでチェック
            if player_id not in existing_player_ids:
                is_new = True
                existing_player_ids.add(player_id)  # 重複チェック用に追加
        else:
            # player_idがない場合、選手名とチーム名でチェック
            if player_name and team:
                if (player_name, team) not in existing_player_names:
                    is_new = True
                    existing_player_names.add((player_name, team))  # 重複チェック用に追加
        
        if is_new:
            new_players.append(player)
    
    print(f"🆕 新規選手: {len(new_players)}件")
    
    # 既存データ + 新規選手を結合
    # 新規選手のデータを既存の形式に合わせる
    updated_rows = existing_rows.copy()
    
    for new_player in new_players:
        # 既存のCSV形式に合わせてデータを整形
        row = {
            'year': str(year),
            'league': league,
            'team': new_player.get('team', ''),
            'player_id': new_player.get('player_id', ''),
            'player_name_ja': new_player.get('player_name_ja', ''),
            'player_name_en': new_player.get('player_name_en', ''),
        }
        
        # 成績データを追加（スクレイピングで取得できたもの）
        for key in ['G', 'PA', 'AB', 'R', 'H', '2B', '3B', 'HR', 'TB', 'RBI', 'SB', 'CS', 'SH', 'SF', 'BB', 'IBB', 'HBP', 'SO', 'GDP', 'AVG', 'OBP', 'SLG', 'OPS']:
            if key in new_player:
                row[key] = new_player[key]
            else:
                row[key] = ''
        
        updated_rows.append(row)
    
    return updated_rows, len(new_players)


def save_to_csv(data: List[Dict[str, Any]], headers: List[str], output_path: Path, backup: bool = True):
    """
    CSV形式で保存（既存ファイルがある場合はバックアップを作成）
    """
    if backup and output_path.exists():
        backup_path = output_path.with_suffix(output_path.suffix + '.backup')
        shutil.copy2(output_path, backup_path)
        print(f"💾 バックアップを作成しました: {backup_path}")
    
    # ヘッダーが空の場合は、データから推測
    if not headers and data:
        headers = list(data[0].keys())
    
    try:
        with open(output_path, 'w', encoding='utf-8-sig', newline='') as f:
            if headers:
                writer = csv.DictWriter(f, fieldnames=headers, extrasaction='ignore')
                writer.writeheader()
                writer.writerows(data)
            else:
                # ヘッダーがない場合は、データのキーを使用
                if data:
                    writer = csv.DictWriter(f, fieldnames=list(data[0].keys()))
                    writer.writeheader()
                    writer.writerows(data)
        
        print(f"✅ CSVファイルを保存しました: {output_path}")
    except Exception as e:
        print(f"❌ CSV保存エラー: {e}")
        raise


def main():
    parser = argparse.ArgumentParser(description='NPB公式サイトから打撃成績をスクレイピングして既存CSVを更新')
    parser.add_argument('--year', type=int, required=True, help='年度（例: 2025）')
    parser.add_argument('--league', type=str, required=True, choices=['PL', 'CL'], help='リーグ（PL/CL）')
    parser.add_argument('--update-existing', action='store_true', default=True, help='既存ファイルを更新する（デフォルト: True）')
    parser.add_argument('--overwrite', action='store_true', help='既存ファイルを完全に上書きする（デフォルト: False、新規選手のみ追加）')
    
    args = parser.parse_args()
    
    # プロジェクトルートを取得
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    # 既存ファイルのパス（2024年以前の非規定版と同じフォルダ）
    existing_path = project_root / '_data' / 'master_csv__import_1950_2024' / f'batting_{args.year}_{args.league}_from_master.csv'
    
    print(f"\n{'='*60}")
    print(f"=== NPB公式サイト 打撃成績スクレイピング ===")
    print(f"{'='*60}\n")
    print(f"年度: {args.year}")
    print(f"リーグ: {args.league}")
    print(f"既存ファイル: {existing_path}\n")
    
    # スクレイピング実行
    scraped_data = scrape_batting_stats(args.year, args.league)
    
    if not scraped_data:
        print("❌ スクレイピングデータが取得できませんでした")
        sys.exit(1)
    
    # 既存ファイルを更新
    if args.update_existing and existing_path.exists():
        if args.overwrite:
            # 完全に上書き
            print("⚠️ 既存ファイルを完全に上書きします")
            updated_data = scraped_data
            new_count = len(scraped_data)
        else:
            # 新規選手のみ追加
            updated_data, new_count = update_existing_csv(scraped_data, existing_path, args.year, args.league)
        
        # 既存のヘッダーを取得
        _, headers = load_existing_csv(existing_path)
        
        # CSV保存
        save_to_csv(updated_data, headers, existing_path, backup=True)
        
        print(f"\n✅ 処理完了: 新規追加 {new_count}件、合計 {len(updated_data)}件")
    else:
        # 新規ファイル作成
        print("📝 新規ファイルを作成します")
        headers = ['year', 'league', 'team', 'player_id', 'player_name_ja', 'player_name_en',
                   'G', 'PA', 'AB', 'R', 'H', '2B', '3B', 'HR', 'TB', 'RBI', 'SB', 'CS', 'SH', 'SF',
                   'BB', 'IBB', 'HBP', 'SO', 'GDP', 'AVG', 'OBP', 'SLG', 'OPS']
        save_to_csv(scraped_data, headers, existing_path, backup=False)
        print(f"\n✅ 処理完了: {len(scraped_data)}件のデータを保存しました")
    
    print(f"\n📋 次のステップ:")
    print(f"   1. 指標計算を実行: python scripts/compute_metrics_all_seasons.py --year {args.year} --league {args.league}")
    print(f"   2. 検証: node scripts/fact_check_npb_official.mjs {args.year} {args.league}")


if __name__ == '__main__':
    main()
