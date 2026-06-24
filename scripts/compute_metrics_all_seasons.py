#!/usr/bin/env python3
"""
compute_metrics_all_seasons.py

Record.csvに記載された指標を計算して、全シーズンのbatting_YYYY_(PL|CL)_from_master.csvを
計算済みCSVとして出力するスクリプト

入力: _data/master_csv/（デフォルト）。--input-dir で _data/master_csv__import_1950_2024 等を指定可。
出力: _data/master_csv_calculated/
元CSVは絶対に上書きしない（破壊的変更禁止）
"""

import csv
import math
import argparse
import glob
import re
import sys
import os
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple, Set

# 共通パーサーをインポート
try:
    from lib.filename_parser import parse_batting_filename, build_calculated_filename
except ImportError:
    # フォールバック: scripts/lib/filename_parser.py
    sys.path.insert(0, os.path.dirname(__file__))
    from lib.filename_parser import parse_batting_filename, build_calculated_filename


# 列名マッピング（英語 → 日本語）
COLUMN_MAPPING = {
    # 基本統計
    'G': '試合',
    'PA': '打席',
    'AB': '打数',
    'R': '得点',
    'H': '安打',
    '1B': '単打',
    '2B': '二塁打',
    '3B': '三塁打',
    'HR': '本塁打',
    'RBI': '打点',
    'BB': '四球',
    'IBB': '敬遠',
    'HBP': '死球',
    'SO': '三振',
    'K': '三振',  # 別名
    'GDP': '併殺打',
    'GIDP': '併殺打',  # 別名
    'TB': '塁打',
    'SB': '盗塁',
    'CS': '盗塁死',
    'SH': '犠打',
    'SF': '犠飛',
    # 率系
    'AVG': '打率',
    'OBP': '出塁率',
    'SLG': '長打率',
    'OPS': 'OPS',
    # 派生指標
    'IsoP': 'IsoP',
    'IsoD': 'IsoD',
    'BB%': 'BB%',
    'K%': 'K%',
    'BB/K': 'BB/K',
    'RC': 'RC',
    'XR': 'XR',
    'BABIP': 'BABIP',
    'SecA': 'SecA',
    'TA': 'TA',
    'NOI': 'NOI',
    'GPA': 'GPA',
}

# 日本語 → 英語の逆マッピング
JAPANESE_TO_ENGLISH = {v: k for k, v in COLUMN_MAPPING.items() if v != k}

# 元列として存在する/別名としてコピーできる指標（計算しない）
SOURCE_COLUMN_METRICS = {
    '試合', '打席', '打数', '安打', '本塁打', '二塁打', '三塁打', '打点', '得点',
    '四球', '死球', '三振', '犠打', '犠飛', '併殺打', '盗塁', '盗塁死', '敬遠',
    '単打', '塁打', '打率', '出塁率', '長打率',
    # 英語名も含める
    'G', 'PA', 'AB', 'H', 'HR', '2B', '3B', 'RBI', 'R',
    'BB', 'HBP', 'SO', 'K', 'SH', 'SF', 'GDP', 'GIDP', 'SB', 'CS', 'IBB',
    '1B', 'TB', 'AVG', 'OBP', 'SLG'
}

# 派生指標（計算する）
CALCULATED_METRICS = {
    'OPS', 'IsoP', 'IsoD', 'BB%', 'K%', 'BB/K', 'RC', 'XR', 'BABIP', 'SecA', 'TA', 'NOI', 'GPA'
}


def normalize_column_name(col_name: str) -> str:
    """列名を正規化（BOM除去、全角スペース除去、前後空白strip、連続空白を1個に）"""
    if not col_name:
        return col_name
    # BOM除去
    col_name = col_name.lstrip('\ufeff')
    # 全角スペースを通常スペースに変換
    col_name = col_name.replace('\u3000', ' ')
    # 前後空白除去
    col_name = col_name.strip()
    # 連続空白を1個に
    col_name = re.sub(r'\s+', ' ', col_name)
    return col_name


def load_csv_with_encoding(csv_path: Path) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    CSVファイルを読み込む（文字コード自動判定）
    戻り値: (データ行のリスト, 列名マッピング（正規化前→正規化後）)
    """
    encodings = ['utf-8-sig', 'utf-8', 'shift_jis', 'cp932']
    for encoding in encodings:
        try:
            with open(csv_path, 'r', encoding=encoding) as f:
                reader = csv.DictReader(f)
                # 元の列名を取得
                original_fieldnames = reader.fieldnames
                if not original_fieldnames:
                    return [], {}
                
                # 列名を正規化してマッピングを作成
                column_mapping = {}
                normalized_fieldnames = []
                for orig_col in original_fieldnames:
                    norm_col = normalize_column_name(orig_col)
                    column_mapping[orig_col] = norm_col
                    normalized_fieldnames.append(norm_col)
                
                # データを読み込み、列名を正規化
                data = []
                for row in reader:
                    normalized_row = {}
                    for orig_col, norm_col in column_mapping.items():
                        normalized_row[norm_col] = row.get(orig_col, '')
                    data.append(normalized_row)
                
                return data, column_mapping
        except (UnicodeDecodeError, FileNotFoundError):
            continue
    raise ValueError(f"Failed to read {csv_path} with any encoding")


def find_column(row: Dict[str, Any], candidates: List[str]) -> Optional[str]:
    """列名の候補から実際に存在する列を探す"""
    for candidate in candidates:
        if candidate in row:
            return candidate
    return None


def get_column_value(row: Dict[str, Any], candidates: List[str], default: float = 0.0) -> float:
    """列の値を取得（英語/日本語の両方に対応）"""
    col = find_column(row, candidates)
    if col:
        value = row[col]
        if value is None or value == '':
            return default
        try:
            return float(value)
        except (ValueError, TypeError):
            return default
    return default


def safe_float(value: Any, default: float = 0.0) -> float:
    """安全にfloatに変換"""
    if value is None or value == '':
        return default
    try:
        val = float(value)
        if math.isnan(val) or math.isinf(val):
            return default
        return val
    except (ValueError, TypeError):
        return default


def safe_int(value: Any, default: int = 0) -> int:
    """安全にintに変換"""
    if value is None or value == '':
        return default
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return default


def find_file_with_fallback(filename: str, search_paths: List[Path]) -> Optional[Path]:
    """ファイルを複数のパスから順に探す"""
    for search_path in search_paths:
        file_path = search_path / filename
        if file_path.exists():
            return file_path
    return None


def extract_metrics_from_record_csv(record_csv_path: Path) -> List[str]:
    """Record.csvから指標リストを抽出（ヘッダー=指標）"""
    # 先頭1行をテキストとして直接読む（データ行が0でも対応）
    encodings = ['utf-8-sig', 'utf-8', 'shift_jis', 'cp932']
    first_line = None
    
    for encoding in encodings:
        try:
            with open(record_csv_path, 'r', encoding=encoding) as f:
                first_line = f.readline()
                if first_line:
                    break
        except (UnicodeDecodeError, FileNotFoundError):
            continue
    
    if not first_line:
        print(f"⚠️  Record.csvの読み込みに失敗: {record_csv_path}")
        print(f"   探索パス: {record_csv_path}")
        return []
    
    # 改行文字を除去
    first_line = first_line.rstrip('\r\n')
    
    # 先頭行の内容をログに表示（デバッグ用）
    print(f"   📄 先頭行（最初の100文字）: {first_line[:100]}{'...' if len(first_line) > 100 else ''}")
    
    # 区切り文字を判定（カンマ区切りを優先、1要素しか取れない場合はタブ区切りも試す）
    metrics_raw = first_line.split(',')
    if len(metrics_raw) == 1:
        # カンマで1要素しか取れない場合はタブ区切りを試す
        metrics_raw = first_line.split('\t')
    
    # 除外列のセット
    exclude_cols = {'id', 'name', 'label', 'desc', 'description', '単位', '備考', 'unit', 'note', 'memo'}
    
    # 各指標名を正規化
    metrics = []
    for metric in metrics_raw:
        # BOM除去
        metric = metric.lstrip('\ufeff')
        # 前後空白除去
        metric = metric.strip()
        # 全角スペース除去
        metric = metric.replace('\u3000', ' ').strip()
        # 空文字は除外
        if not metric:
            continue
        
        # 除外列チェック
        metric_lower = metric.lower()
        if metric_lower not in exclude_cols:
            metrics.append(metric)
    
    if not metrics:
        print(f"❌ 指標リストの抽出に失敗しました")
        print(f"   探索パス: {record_csv_path}")
        print(f"   先頭行: {first_line[:200]}")
        return []
    
    return metrics


def parse_year_and_league_from_filename(filename: str) -> Optional[Tuple[int, str]]:
    """
    ファイル名から年度とリーグをパース（後方互換性のため残す）
    
    @deprecated: parse_batting_filename() を使用してください
    """
    parsed = parse_batting_filename(filename)
    if parsed:
        return (parsed["year"], parsed["league"])
    return None


def find_all_batting_csv_files(
    data_dir: Path,
    year: Optional[int] = None,
    league: Optional[str] = None,
    exclude_patterns: Optional[List[Tuple[int, str]]] = None,
    max_year: Optional[int] = None
) -> List[Tuple[Path, int, str, Dict[str, Any]]]:
    """
    batting CSVファイルを列挙（from_master と 戦前春秋シーズンの両方をサポート）
    
    @param exclude_patterns: 除外パターンのリスト [(year, league), ...]
    @param max_year: 最大年度（この年度以下のみ処理、Noneの場合は制限なし）
    @returns: [(file_path, year, league, parsed_info), ...]
    """
    results = []
    exclude_patterns = exclude_patterns or []
    
    # パターン1: from_master CSV
    pattern1 = str(data_dir / 'batting_*_*_from_master.csv')
    for file_path_str in glob.glob(pattern1):
        file_path = Path(file_path_str)
        filename = file_path.name
        parsed = parse_batting_filename(filename)
        if parsed:
            file_year = parsed["year"]
            file_league = parsed["league"]
            # 除外パターンチェック
            if (file_year, file_league) in exclude_patterns:
                continue
            # max_yearフィルタリング
            if max_year is not None and file_year > max_year:
                continue
            # フィルタリング
            if year is not None and file_year != year:
                continue
            if league is not None and file_league != league:
                continue
            results.append((file_path, file_year, file_league, parsed))
    
    # パターン2: 戦前春秋シーズンCSV
    pattern2 = str(data_dir / 'batting_*_spring_PRE.csv')
    for file_path_str in glob.glob(pattern2):
        file_path = Path(file_path_str)
        filename = file_path.name
        parsed = parse_batting_filename(filename)
        if parsed:
            file_year = parsed["year"]
            file_league = parsed["league"]
            # 除外パターンチェック
            if (file_year, file_league) in exclude_patterns:
                continue
            # max_yearフィルタリング
            if max_year is not None and file_year > max_year:
                continue
            # フィルタリング
            if year is not None and file_year != year:
                continue
            if league is not None and file_league != league:
                continue
            results.append((file_path, file_year, file_league, parsed))
    
    # パターン3: 戦前秋シーズンCSV
    pattern3 = str(data_dir / 'batting_*_fall_PRE.csv')
    for file_path_str in glob.glob(pattern3):
        file_path = Path(file_path_str)
        filename = file_path.name
        parsed = parse_batting_filename(filename)
        if parsed:
            file_year = parsed["year"]
            file_league = parsed["league"]
            # 除外パターンチェック
            if (file_year, file_league) in exclude_patterns:
                continue
            # max_yearフィルタリング
            if max_year is not None and file_year > max_year:
                continue
            # フィルタリング
            if year is not None and file_year != year:
                continue
            if league is not None and file_league != league:
                continue
            results.append((file_path, file_year, file_league, parsed))
    
    return results


def get_value_for_source(row: Dict[str, Any], english_name: str, japanese_name: str = None) -> float:
    """元列処理用の値取得関数"""
    candidates = [english_name]
    if japanese_name:
        candidates.append(japanese_name)
    candidates.extend([c.upper() for c in candidates] + [c.lower() for c in candidates])
    return get_column_value(row, candidates)


def copy_source_columns(row: Dict[str, Any], target_metrics: List[str]) -> Tuple[Dict[str, Any], List[str]]:
    """
    元列として存在する/別名としてコピーできる指標を処理
    戻り値: (処理済みデータ, 追加できた指標リスト)
    """
    result = row.copy()
    added_metrics = []
    
    # 元列指標のみをフィルタ
    source_metrics = [m for m in target_metrics if m in SOURCE_COLUMN_METRICS]
    
    for metric in source_metrics:
        # 既に存在する場合はスキップ
        if metric in result and result[metric] and str(result[metric]).strip():
            continue
        
        # 英語名から日本語名へのコピー
        if metric in JAPANESE_TO_ENGLISH:
            english_name = JAPANESE_TO_ENGLISH[metric]
            if english_name in result and result[english_name]:
                result[metric] = result[english_name]
                added_metrics.append(metric)
        # 日本語名から英語名へのコピー
        elif metric in COLUMN_MAPPING:
            japanese_name = COLUMN_MAPPING[metric]
            if japanese_name in result and result[japanese_name]:
                result[metric] = result[japanese_name]
                added_metrics.append(metric)
        # 別名の処理（例: K → SO, GIDP → GDP）
        elif metric == '三振':
            # SO または K からコピー
            for alt_name in ['SO', 'K']:
                if alt_name in result and result[alt_name]:
                    result[metric] = result[alt_name]
                    added_metrics.append(metric)
                    break
        elif metric == '併殺打':
            # GDP または GIDP からコピー
            for alt_name in ['GDP', 'GIDP']:
                if alt_name in result and result[alt_name]:
                    result[metric] = result[alt_name]
                    added_metrics.append(metric)
                    break
        # 計算が必要な元列指標
        elif metric in ['単打', '1B']:
            h = get_value_for_source(result, 'H', '安打')
            doubles = get_value_for_source(result, '2B', '二塁打')
            triples = get_value_for_source(result, '3B', '三塁打')
            hr = get_value_for_source(result, 'HR', '本塁打')
            singles = h - doubles - triples - hr
            if singles >= 0:
                result['単打'] = singles
                result['1B'] = singles
                added_metrics.append('単打' if metric == '単打' else '1B')
        elif metric in ['塁打', 'TB']:
            singles = get_value_for_source(result, '1B', '単打')
            doubles = get_value_for_source(result, '2B', '二塁打')
            triples = get_value_for_source(result, '3B', '三塁打')
            hr = get_value_for_source(result, 'HR', '本塁打')
            tb = singles + 2 * doubles + 3 * triples + 4 * hr
            if tb >= 0:
                result['塁打'] = tb
                result['TB'] = tb
                added_metrics.append('塁打' if metric == '塁打' else 'TB')
        elif metric in ['打率', 'AVG']:
            h = get_value_for_source(result, 'H', '安打')
            ab = get_value_for_source(result, 'AB', '打数')
            if ab > 0:
                avg = h / ab
                result['打率'] = avg
                result['AVG'] = avg
                added_metrics.append('打率' if metric == '打率' else 'AVG')
        elif metric in ['出塁率', 'OBP']:
            h = get_value_for_source(result, 'H', '安打')
            bb = get_value_for_source(result, 'BB', '四球')
            hbp = get_value_for_source(result, 'HBP', '死球')
            ab = get_value_for_source(result, 'AB', '打数')
            sf = get_value_for_source(result, 'SF', '犠飛')
            denominator = ab + bb + hbp + sf
            if denominator > 0:
                obp = (h + bb + hbp) / denominator
                result['出塁率'] = obp
                result['OBP'] = obp
                added_metrics.append('出塁率' if metric == '出塁率' else 'OBP')
        elif metric in ['長打率', 'SLG']:
            tb = get_value_for_source(result, 'TB', '塁打')
            ab = get_value_for_source(result, 'AB', '打数')
            if ab > 0:
                slg = tb / ab
                result['長打率'] = slg
                result['SLG'] = slg
                added_metrics.append('長打率' if metric == '長打率' else 'SLG')
    
    return result, added_metrics


def calculate_metrics(row: Dict[str, Any], target_metrics: List[str], available_columns: Set[str]) -> Tuple[Dict[str, Any], List[str], List[Tuple[str, str]]]:
    """
    派生指標を計算して返す
    
    戻り値: (計算済みデータ, 追加できた指標リスト, スキップした指標と理由のリスト)
    """
    result = row.copy()
    added_metrics = []
    skipped_metrics = []
    
    # 派生指標のみをフィルタ
    calculated_metrics = [m for m in target_metrics if m in CALCULATED_METRICS]
    
    # 正規化された値を取得する関数（英語/日本語の両方に対応）
    def get_value(english_name: str, japanese_name: str = None) -> Optional[float]:
        candidates = [english_name]
        if japanese_name:
            candidates.append(japanese_name)
        # 大文字小文字のバリエーションも追加
        candidates.extend([c.upper() for c in candidates] + [c.lower() for c in candidates])
        col = find_column(result, candidates)
        if col:
            value = result[col]
            if value is None or value == '':
                return None
            try:
                val = float(value)
                if math.isnan(val) or math.isinf(val):
                    return None
                return val
            except (ValueError, TypeError):
                return None
        return None
    
    # 列が存在するかチェックする関数
    def has_column(english_name: str, japanese_name: str = None) -> bool:
        candidates = [english_name]
        if japanese_name:
            candidates.append(japanese_name)
        candidates.extend([c.upper() for c in candidates] + [c.lower() for c in candidates])
        return any(c in available_columns for c in candidates)
    
    def count(english_name: str, japanese_name: str = None) -> float:
        return get_value(english_name, japanese_name) or 0.0

    def resolve_obp() -> float:
        obp = get_value('OBP', '出塁率')
        if obp is not None:
            return obp
        h = count('H', '安打')
        bb = count('BB', '四球')
        hbp = count('HBP', '死球')
        ab = count('AB', '打数')
        sf = count('SF', '犠飛')
        den = ab + bb + hbp + sf
        return (h + bb + hbp) / den if den > 0 else float('nan')

    def resolve_slg() -> float:
        slg = get_value('SLG', '長打率')
        if slg is not None:
            return slg
        tb = count('TB', '塁打')
        ab = count('AB', '打数')
        return tb / ab if ab > 0 else float('nan')
    
    # 派生指標の計算
    if 'OPS' in calculated_metrics:
        # 必要な列が存在するかチェック
        if not (has_column('OBP', '出塁率') and has_column('SLG', '長打率')):
            skipped_metrics.append(('OPS', '出塁率(OBP)または長打率(SLG)の列が存在しない'))
        else:
            obp = resolve_obp()
            slg = resolve_slg()
            result['OPS'] = obp + slg if not (math.isnan(obp) or math.isnan(slg)) else float('nan')
            added_metrics.append('OPS')
    
    # 派生指標の計算
    if 'IsoP' in calculated_metrics:
        # SLGが空の場合は計算する
        slg = get_value('SLG', '長打率')
        if slg is None:
            # SLGを計算（TB / AB）
            tb = get_value('TB', '塁打')
            ab = get_value('AB', '打数')
            if tb is not None and ab is not None and ab > 0:
                slg = tb / ab
                result['SLG'] = slg
                result['長打率'] = slg
        
        avg = get_value('AVG', '打率')
        if avg is None:
            # AVGを計算（H / AB）
            h = get_value('H', '安打')
            ab = get_value('AB', '打数')
            if h is not None and ab is not None and ab > 0:
                avg = h / ab
                result['AVG'] = avg
                result['打率'] = avg
        
        if slg is not None and avg is not None:
            isop = slg - avg
            result['IsoP'] = isop
            added_metrics.append('IsoP')
        else:
            skipped_metrics.append(('IsoP', '長打率(SLG)または打率(AVG)の計算に失敗'))
    
    if 'IsoD' in calculated_metrics:
        # OBPが空の場合は計算する
        obp = get_value('OBP', '出塁率')
        if obp is None:
            # OBPを計算（(H + BB + HBP) / (AB + BB + HBP + SF)）
            h = get_value('H', '安打')
            bb = get_value('BB', '四球')
            hbp = get_value('HBP', '死球')
            ab = get_value('AB', '打数')
            sf = get_value('SF', '犠飛')
            if h is not None and bb is not None and hbp is not None and ab is not None and sf is not None:
                denominator = ab + bb + hbp + sf
                if denominator > 0:
                    obp = (h + bb + hbp) / denominator
                    result['OBP'] = obp
                    result['出塁率'] = obp
        
        avg = get_value('AVG', '打率')
        if avg is None:
            # AVGを計算（H / AB）
            h = get_value('H', '安打')
            ab = get_value('AB', '打数')
            if h is not None and ab is not None and ab > 0:
                avg = h / ab
                result['AVG'] = avg
                result['打率'] = avg
        
        if obp is not None and avg is not None:
            isod = obp - avg
            result['IsoD'] = isod
            added_metrics.append('IsoD')
        else:
            skipped_metrics.append(('IsoD', '出塁率(OBP)または打率(AVG)の計算に失敗'))
    
    if 'BB%' in calculated_metrics:
        if not (has_column('BB', '四球') and has_column('PA', '打席')):
            skipped_metrics.append(('BB%', '四球(BB)または打席(PA)の列が存在しない'))
        else:
            bb = count('BB', '四球')
            pa = count('PA', '打席')
            # 分母が0でもNaNで埋める
            bb_pct = (bb / pa) * 100 if pa > 0 else float('nan')
            result['BB%'] = bb_pct
            added_metrics.append('BB%')
    
    if 'K%' in calculated_metrics:
        if not (has_column('SO', '三振') and has_column('PA', '打席')):
            skipped_metrics.append(('K%', '三振(SO)または打席(PA)の列が存在しない'))
        else:
            so = get_value('SO', '三振')
            if so is None or so == 0:
                so = get_value('K', '三振')
            so = so if so is not None else 0.0
            pa = count('PA', '打席')
            k_pct = (so / pa) * 100 if pa > 0 else float('nan')
            result['K%'] = k_pct
            added_metrics.append('K%')
    
    if 'BB/K' in calculated_metrics:
        if not (has_column('BB', '四球') and (has_column('SO', '三振') or has_column('K', '三振'))):
            skipped_metrics.append(('BB/K', '四球(BB)または三振(SO/K)の列が存在しない'))
        else:
            bb = count('BB', '四球')
            so = get_value('SO', '三振')
            if so is None or so == 0:
                so = get_value('K', '三振')
            so = so if so is not None else 0.0
            bbk = bb / so if so > 0 else float('nan')
            result['BB/K'] = bbk
            added_metrics.append('BB/K')
    
    if 'BABIP' in calculated_metrics:
        if not (has_column('H', '安打') and has_column('HR', '本塁打') and has_column('AB', '打数') and 
                (has_column('SO', '三振') or has_column('K', '三振')) and has_column('SF', '犠飛')):
            skipped_metrics.append(('BABIP', '必要な列が存在しない'))
        else:
            h = count('H', '安打')
            hr = count('HR', '本塁打')
            ab = count('AB', '打数')
            so = get_value('SO', '三振')
            if so is None or so == 0:
                so = get_value('K', '三振')
            so = so if so is not None else 0.0
            sf = count('SF', '犠飛')
            denominator = ab - so - hr + sf
            babip = (h - hr) / denominator if denominator > 0 else float('nan')
            result['BABIP'] = babip
            added_metrics.append('BABIP')
    
    if 'SecA' in calculated_metrics:
        if not (has_column('BB', '四球') and has_column('TB', '塁打') and has_column('H', '安打') and 
                has_column('SB', '盗塁') and has_column('CS', '盗塁死') and has_column('AB', '打数')):
            skipped_metrics.append(('SecA', '必要な列が存在しない'))
        else:
            bb = count('BB', '四球')
            tb = count('TB', '塁打')
            h = count('H', '安打')
            sb = count('SB', '盗塁')
            cs = count('CS', '盗塁死')
            ab = count('AB', '打数')
            seca = (bb + (tb - h) + (sb - cs)) / ab if ab > 0 else float('nan')
            result['SecA'] = seca
            added_metrics.append('SecA')
    
    if 'TA' in calculated_metrics:
        if not (has_column('TB', '塁打') and has_column('HBP', '死球') and has_column('BB', '四球') and 
                has_column('SB', '盗塁') and has_column('AB', '打数') and has_column('H', '安打') and 
                has_column('CS', '盗塁死') and (has_column('GDP', '併殺打') or has_column('GIDP', '併殺打'))):
            skipped_metrics.append(('TA', '必要な列が存在しない'))
        else:
            tb = get_value('TB', '塁打') or 0.0
            hbp = get_value('HBP', '死球') or 0.0
            bb = get_value('BB', '四球') or 0.0
            sb = get_value('SB', '盗塁') or 0.0
            ab = get_value('AB', '打数') or 0.0
            h = get_value('H', '安打') or 0.0
            cs = get_value('CS', '盗塁死') or 0.0
            gdp = get_value('GDP', '併殺打')
            if gdp is None or gdp == 0:
                gdp = get_value('GIDP', '併殺打') or 0.0
            denominator = ab - h + cs + gdp
            ta = (tb + hbp + bb + sb) / denominator if denominator > 0 else float('nan')
            result['TA'] = ta
            added_metrics.append('TA')
    
    if 'NOI' in calculated_metrics:
        if not (has_column('OBP', '出塁率') and has_column('SLG', '長打率')):
            skipped_metrics.append(('NOI', '出塁率(OBP)または長打率(SLG)の列が存在しない'))
        else:
            obp = resolve_obp()
            slg = resolve_slg()
            result['NOI'] = (obp + (slg / 3)) * 1000 if not (math.isnan(obp) or math.isnan(slg)) else float('nan')
            added_metrics.append('NOI')
    
    if 'GPA' in calculated_metrics:
        if not (has_column('OBP', '出塁率') and has_column('SLG', '長打率')):
            skipped_metrics.append(('GPA', '出塁率(OBP)または長打率(SLG)の列が存在しない'))
        else:
            obp = resolve_obp()
            slg = resolve_slg()
            result['GPA'] = (1.8 * obp + slg) / 4 if not (math.isnan(obp) or math.isnan(slg)) else float('nan')
            added_metrics.append('GPA')
    
    if 'RC' in calculated_metrics:
        if not (has_column('H', '安打') and has_column('BB', '四球') and has_column('HBP', '死球') and
                has_column('CS', '盗塁死') and (has_column('GDP', '併殺打') or has_column('GIDP', '併殺打')) and
                has_column('TB', '塁打') and has_column('SF', '犠飛') and has_column('SH', '犠打') and
                has_column('SB', '盗塁') and (has_column('SO', '三振') or has_column('K', '三振')) and
                has_column('AB', '打数')):
            skipped_metrics.append(('RC', '必要な列が存在しない'))
        else:
            h = get_value('H', '安打') or 0.0
            bb = get_value('BB', '四球') or 0.0
            hbp = get_value('HBP', '死球') or 0.0
            cs = get_value('CS', '盗塁死') or 0.0
            gidp = get_value('GDP', '併殺打')
            if gidp is None or gidp == 0:
                gidp = get_value('GIDP', '併殺打') or 0.0
            tb = get_value('TB', '塁打') or 0.0
            sf = get_value('SF', '犠飛') or 0.0
            sh = get_value('SH', '犠打') or 0.0
            sb = get_value('SB', '盗塁') or 0.0
            so = get_value('SO', '三振')
            if so is None or so == 0:
                so = get_value('K', '三振') or 0.0
            ab = get_value('AB', '打数') or 0.0

            A = h + bb + hbp - cs - gidp
            B = tb + 0.26 * (bb + hbp) + 0.53 * (sf + sh) + 0.64 * sb - 0.03 * so
            C = ab + bb + hbp + sf + sh
            # Technical RC (nf3互換)
            rc = (((A + 2.4 * C) * (B + 3 * C)) / (9 * C)) - (0.9 * C) if C > 0 else float('nan')
            result['RC'] = rc
            added_metrics.append('RC')
    
    if 'XR' in calculated_metrics:
        if not (has_column('AB', '打数') and has_column('H', '安打') and has_column('2B', '二塁打') and 
                has_column('3B', '三塁打') and has_column('HR', '本塁打') and has_column('BB', '四球') and 
                has_column('IBB', '敬遠') and has_column('HBP', '死球') and has_column('SB', '盗塁') and 
                has_column('CS', '盗塁死') and (has_column('SO', '三振') or has_column('K', '三振')) and
                (has_column('GDP', '併殺打') or has_column('GIDP', '併殺打')) and has_column('SF', '犠飛') and has_column('SH', '犠打')):
            skipped_metrics.append(('XR', '必要な列が存在しない'))
        else:
            ab = get_value('AB', '打数') or 0.0
            h = get_value('H', '安打') or 0.0
            doubles = get_value('2B', '二塁打')
            triples = get_value('3B', '三塁打')
            hr = get_value('HR', '本塁打')
            bb = get_value('BB', '四球')
            ibb = get_value('IBB', '敬遠') or 0.0
            hbp = get_value('HBP', '死球')
            sb = get_value('SB', '盗塁')
            cs = get_value('CS', '盗塁死')
            so = get_value('SO', '三振')
            if so is None or so == 0:
                so = get_value('K', '三振') or 0.0
            gidp = get_value('GDP', '併殺打')
            if gidp is None or gidp == 0:
                gidp = get_value('GIDP', '併殺打') or 0.0
            sf = get_value('SF', '犠飛') or 0.0
            sh = get_value('SH', '犠打') or 0.0

            doubles = doubles or 0.0
            triples = triples or 0.0
            hr = hr or 0.0
            bb = bb or 0.0
            hbp = hbp or 0.0
            sb = sb or 0.0
            cs = cs or 0.0

            singles = max(0.0, h - doubles - triples - hr)
            xr = (
                0.50 * singles
                + 0.72 * doubles
                + 1.04 * triples
                + 1.44 * hr
                + 0.34 * (bb + hbp - ibb)
                + 0.25 * ibb
                + 0.18 * sb
                - 0.32 * cs
                - 0.090 * (ab - h - so)
                - 0.098 * so
                - 0.37 * gidp
                + 0.37 * sf
                + 0.04 * sh
            )
            result['XR'] = xr
            added_metrics.append('XR')
    
    # 既存の列を日本語名でも出力（Record.csvに日本語列名がある場合）
    for metric in target_metrics:
        if metric in JAPANESE_TO_ENGLISH:
            english_name = JAPANESE_TO_ENGLISH[metric]
            if english_name in result and metric not in result:
                result[metric] = result[english_name]
            elif metric in result and english_name not in result:
                result[english_name] = result[metric]
    
    return result, added_metrics, skipped_metrics


def process_batting_csv(
    input_path: Path,
    output_path: Path,
    target_metrics: List[str],
    dry_run: bool = False,
    overwrite: bool = False
) -> Tuple[bool, List[str], List[Tuple[str, str]]]:
    """
    バッティングCSVを処理して計算済みCSVを出力
    
    戻り値: (成功フラグ, 追加できた指標リスト, スキップした指標と理由のリスト)
    """
    if not input_path.exists():
        print(f"   ❌ 入力ファイルが見つかりません: {input_path}")
        return False, [], []
    
    if output_path.exists() and not overwrite and not dry_run:
        print(f"   ⚠️  出力ファイルが既に存在します（スキップ）: {output_path}")
        print(f"      上書きする場合は --overwrite オプションを使用してください")
        return False, [], []
    
    try:
        data, column_mapping = load_csv_with_encoding(input_path)
        if not data:
            print(f"   ⚠️  データが空です: {input_path}")
            return False, [], []
    except Exception as e:
        print(f"   ❌ CSV読み込みエラー: {e}")
        return False, [], []
    
    # 利用可能な列名のセットを作成（正規化後）
    available_columns = set(data[0].keys()) if data else set()
    
    # 各行を処理
    processed_data = []
    all_added_metrics = set()
    all_skipped_metrics = {}
    
    for row in data:
        # 1. 元の行をコピー（team, player_id, player_name_jaなどの非指標列も保持）
        processed_row = row.copy()
        
        # 2. 元列のコピー処理（指標のみ）
        processed_row, added_source = copy_source_columns(processed_row, target_metrics)
        all_added_metrics.update(added_source)
        
        # 3. 派生指標の計算
        processed_row, added_calc, skipped = calculate_metrics(processed_row, target_metrics, available_columns)
        all_added_metrics.update(added_calc)
        for metric, reason in skipped:
            if metric not in all_skipped_metrics:
                all_skipped_metrics[metric] = reason
        
        processed_data.append(processed_row)
    
    if dry_run:
        print(f"   [DRY-RUN] 処理済みデータ: {len(processed_data)}行")
        return True, list(all_added_metrics), list(all_skipped_metrics.items())
    
    # 出力
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 出力する列の順序を決定（元の列 + 追加された指標）
        original_columns = list(data[0].keys())
        output_columns = original_columns.copy()
        
        # 追加された指標を追加（元の列に無いもののみ）
        for metric in target_metrics:
            if metric not in output_columns:
                output_columns.append(metric)
            # 英語/日本語の対応も追加
            if metric in JAPANESE_TO_ENGLISH:
                english = JAPANESE_TO_ENGLISH[metric]
                if english not in output_columns and english in processed_data[0]:
                    output_columns.append(english)
            elif metric in COLUMN_MAPPING:
                japanese = COLUMN_MAPPING[metric]
                if japanese not in output_columns and japanese in processed_data[0]:
                    output_columns.append(japanese)
        
        with open(output_path, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=output_columns)
            writer.writeheader()
            writer.writerows(processed_data)
        
        return True, list(all_added_metrics), list(all_skipped_metrics.items())
    except Exception as e:
        print(f"   ❌ CSV書き込みエラー: {e}")
        return False, [], []


def parse_exclude_pattern(exclude_str: str) -> List[Tuple[int, str]]:
    """
    除外パターンをパース（例: "2025:PL" → [(2025, "PL")]）
    
    @param exclude_str: 除外パターン文字列（例: "2025:PL" または "2025:PL,2024:CL"）
    @returns: 除外パターンのリスト
    """
    patterns = []
    for part in exclude_str.split(','):
        part = part.strip()
        if ':' in part:
            year_str, league_str = part.split(':', 1)
            try:
                year = int(year_str.strip())
                league = league_str.strip().upper()
                patterns.append((year, league))
            except ValueError:
                print(f"⚠️  無効な除外パターン: {part}（スキップ）")
    return patterns


def main():
    parser = argparse.ArgumentParser(description='指標計算スクリプト')
    parser.add_argument('--year', type=int, help='年度でフィルタ（例: 2025）')
    parser.add_argument('--league', type=str, choices=['PL', 'CL', 'PRE'], help='リーグでフィルタ（PL、CL、またはPRE）')
    parser.add_argument('--exclude', type=str, help='除外パターン（例: "2025:PL" または "2025:PL,2024:CL"）')
    parser.add_argument('--max-year', type=int, help='最大年度（この年度以下のみ処理、例: --max-year 2024）')
    parser.add_argument('--dry-run', action='store_true', help='書き込みなしで、対応指標/未対応指標/対象ファイルだけ表示')
    parser.add_argument('--overwrite', action='store_true', help='出力先に同名があれば上書き許可（デフォルトは上書きしない）')
    parser.add_argument('--input-dir', type=str, default=None,
                        help='入力CSVディレクトリ（デフォルト: _data/master_csv）。importフォルダを使う場合は _data/master_csv__import_1950_2024 を指定')
    
    args = parser.parse_args()
    
    # 除外パターンをパース
    exclude_patterns = []
    if args.exclude:
        exclude_patterns = parse_exclude_pattern(args.exclude)
        if exclude_patterns:
            print(f"🚫 除外パターン: {exclude_patterns}")
    
    # max-yearの表示
    if args.max_year:
        print(f"📅 最大年度フィルタ: {args.max_year}年以下のみ処理")
    
    # パス設定
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    if args.input_dir:
        data_master_csv_dir = Path(args.input_dir)
        if not data_master_csv_dir.is_absolute():
            data_master_csv_dir = project_root / data_master_csv_dir
    else:
        data_master_csv_dir = project_root / '_data' / 'master_csv'
    output_dir = project_root / '_data' / 'master_csv_calculated'
    
    print(f"[DIR] プロジェクトルート: {project_root}")
    print(f"[DIR] 入力ディレクトリ: {data_master_csv_dir}")
    print(f"[DIR] 出力ディレクトリ: {output_dir}")
    
    print(f"\n[MODE] 実行モード: {'DRY-RUN（書き込みなし）' if args.dry_run else '通常モード（保存あり）'}")
    
    # Record.csv を読み込み
    record_search_paths = [
        project_root,
        data_master_csv_dir,
    ]
    record_csv_path = find_file_with_fallback('Record.csv', record_search_paths)
    
    if not record_csv_path:
        print(f"\n❌ Record.csv が見つかりません")
        print(f"   探索したパス:")
        for search_path in record_search_paths:
            print(f"     - {search_path / 'Record.csv'}")
        return 1
    
    print(f"\n📄 Record.csv: {record_csv_path}")
    target_metrics = extract_metrics_from_record_csv(record_csv_path)
    if not target_metrics:
        print(f"❌ 指標リストの抽出に失敗しました")
        return 1
    
    print(f"✅ 指標リスト抽出成功: {len(target_metrics)}件")
    if target_metrics:
        print(f"   先頭5指標: {', '.join(target_metrics[:5])}")
        if len(target_metrics) > 5:
            print(f"   ... 他 {len(target_metrics) - 5}件")
    
    # バッティングCSVファイルを列挙
    if not data_master_csv_dir.exists():
        print(f"\n❌ 入力ディレクトリが存在しません: {data_master_csv_dir}")
        return 1
    
    csv_files = find_all_batting_csv_files(data_master_csv_dir, args.year, args.league, exclude_patterns, args.max_year)
    if not csv_files:
        filter_msg = ""
        if args.year:
            filter_msg += f" 年度={args.year}"
        if args.league:
            filter_msg += f" リーグ={args.league}"
        if args.max_year:
            filter_msg += f" 最大年度={args.max_year}"
        if exclude_patterns:
            filter_msg += f" 除外={exclude_patterns}"
        print(f"\n❌ 対象のCSVファイルが見つかりません{filter_msg}")
        print(f"   探索パス: {data_master_csv_dir}")
        return 1
    
    print(f"\n📄 対象CSVファイル: {len(csv_files)}件")
    for file_path, year, league, parsed in sorted(csv_files):
        season_info = ""
        if parsed.get("season_tag"):
            season_info = f", シーズン: {parsed['season_tag']}"
        print(f"   - {file_path.name} (年度: {year}, リーグ: {league}{season_info})")
    
    # 除外されたファイルを表示
    all_files = find_all_batting_csv_files(data_master_csv_dir, args.year, args.league, None, None)
    excluded_files = []
    
    # 除外パターンで除外されたファイル
    if exclude_patterns:
        excluded_by_pattern = [f for f in all_files if (f[1], f[2]) in exclude_patterns]
        excluded_files.extend(excluded_by_pattern)
    
    # max-yearで除外されたファイル
    if args.max_year:
        excluded_by_max_year = [f for f in all_files if f[1] > args.max_year]
        excluded_files.extend(excluded_by_max_year)
    
    if excluded_files:
        print(f"\n🚫 除外されたCSVファイル: {len(excluded_files)}件")
        for file_path, year, league, parsed in sorted(excluded_files):
            reason = ""
            if exclude_patterns and (year, league) in exclude_patterns:
                reason = " (除外パターン)"
            elif args.max_year and year > args.max_year:
                reason = f" (SKIP by max-year: {year} > {args.max_year})"
            season_info = ""
            if parsed.get("season_tag"):
                season_info = f", シーズン: {parsed['season_tag']}"
            print(f"   - {file_path.name} (年度: {year}, リーグ: {league}{season_info}){reason}")
    
    # 各ファイルを処理
    print(f"\n🔄 処理開始...")
    success_count = 0
    skipped_exists_count = 0
    skipped_by_filter_count = 0
    failed_count = 0
    all_skipped_metrics = {}
    
    for item in sorted(csv_files):
        # item は長さ3 or 4 or 5 の可能性があるので吸収
        input_path = item[0]
        year = item[1]
        league = item[2]
        parsed = item[3] if len(item) >= 4 else None
        
        # parsedが無い場合は後方互換性のため作成
        if parsed is None:
            parsed = {
                "year": year,
                "league": league,
                "league_key": league,
                "season_tag": None,
                "kind": "from_master"
            }
        
        season_tag = parsed.get("season_tag") if parsed else None
        league_key = parsed.get("league_key") if parsed else league
        
        # 出力ファイル名を生成（league_keyを使用）
        if parsed and parsed.get("kind") == "pre_season":
            # 戦前春秋シーズン: batting_1936_PRE_spring_from_master.csv
            calculated_filename = f"batting_{year}_{league_key}_from_master.csv"
        else:
            # 通常: batting_1936_PRE_from_master.csv（既存命名を維持）
            calculated_filename = f"batting_{year}_{league}_from_master.csv"
        
        output_path = output_dir / calculated_filename
        
        season_info = ""
        if season_tag:
            season_info = f" (シーズン: {season_tag}, リーグキー: {league_key})"
        print(f"\n📝 処理中: {input_path.name}{season_info}")
        
        # max-yearフィルタチェック（念のため）
        if args.max_year and year > args.max_year:
            print(f"   🚫 SKIP by max-year: {year} > {args.max_year}")
            skipped_by_filter_count += 1
            continue
        
        success, added, skipped = process_batting_csv(
            input_path,
            output_path,
            target_metrics,
            dry_run=args.dry_run,
            overwrite=args.overwrite
        )
        
        if success:
            success_count += 1
            if not args.dry_run:
                print(f"   💾 保存先: {output_path}")
            if added:
                print(f"   ✅ 追加できた指標: {', '.join(added)}")
            if skipped:
                print(f"   ⚠️  スキップした指標:")
                for metric, reason in skipped:
                    print(f"      - {metric}: {reason}")
                    all_skipped_metrics[metric] = reason
        else:
            # 出力ファイルが既に存在する場合はスキップ
            if output_path.exists() and not args.overwrite:
                print(f"   ⚠️  SKIP exists: 出力ファイルが既に存在します（上書きする場合は --overwrite を使用）")
                skipped_exists_count += 1
            else:
                print(f"   ❌ 処理に失敗しました")
                failed_count += 1
    
    # 全体サマリ
    print(f"\n" + "="*60)
    print(f"📊 処理サマリ:")
    print(f"   ✅ 処理成功: {success_count}件")
    print(f"   ⚠️  スキップ（既存）: {skipped_exists_count}件")
    print(f"   🚫 スキップ（フィルタ）: {skipped_by_filter_count}件")
    print(f"   ❌ 処理失敗: {failed_count}件")
    print(f"   合計対象: {len(csv_files)}件")
    
    if all_skipped_metrics:
        print(f"\n⚠️  全体でスキップされた指標:")
        for metric, reason in sorted(all_skipped_metrics.items()):
            print(f"   - {metric}: {reason}")
    
    # 未対応指標（target_metricsにあって、一度も追加されなかったもの）
    # ただし、元列指標は除外（これらはコピーで対応できるため）
    all_processed_metrics = set()
    for input_path, *_ in csv_files:
        _, added, _ = process_batting_csv(
            input_path,
            output_dir / input_path.name,
            target_metrics,
            dry_run=True  # 計算だけして追加された指標を確認
        )
        all_processed_metrics.update(added)
    
    # 元列指標は未対応指標に入れない
    unprocessed_metrics = set(target_metrics) - all_processed_metrics - SOURCE_COLUMN_METRICS
    if unprocessed_metrics:
        print(f"\n⚠️  未対応指標（計算されなかった指標）:")
        for metric in sorted(unprocessed_metrics):
            print(f"   - {metric}")
    
    return 0


if __name__ == '__main__':
    exit(main())

