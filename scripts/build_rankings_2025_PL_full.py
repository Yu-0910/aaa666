#!/usr/bin/env python3
"""
build_rankings_2025_PL_full.py

2025年パ・リーグの全指標ランキングTOP100を生成するスクリプト
batting_2025_PL_from_master.csv と Record.csv から指標リストを抽出し、
public/data/rankings/2025/PL/{METRIC}.json を各指標ごとに生成する
"""

import csv
import json
import math
import re
import shutil
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional, Set, Tuple

# get_min_pa_by_yearモジュールをインポート
sys.path.insert(0, str(Path(__file__).parent))
try:
    from get_min_pa_by_year import get_min_pa_by_year
except ImportError:
    print("⚠️  get_min_pa_by_year.py が見つかりません。手動でmin_paを指定してください。")
    get_min_pa_by_year = None


def load_csv_with_encoding(csv_path: str) -> List[Dict[str, Any]]:
    """CSVファイルを読み込む（文字コード自動判定）"""
    encodings = ['utf-8-sig', 'utf-8', 'shift_jis', 'cp932']
    for encoding in encodings:
        try:
            with open(csv_path, 'r', encoding=encoding) as f:
                reader = csv.DictReader(f)
                return list(reader)
        except (UnicodeDecodeError, FileNotFoundError):
            continue
    raise ValueError(f"Failed to read {csv_path} with any encoding")


def find_column(row: Dict[str, Any], candidates: List[str]) -> Optional[str]:
    """列名の候補から実際に存在する列を探す"""
    for candidate in candidates:
        if candidate in row:
            return candidate
    return None


def safe_float(value: Any, default: float = 0.0) -> float:
    """安全にfloatに変換"""
    if value is None or value == '':
        return default
    try:
        return float(value)
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

def safe_int_or_none(value: Any) -> Optional[int]:
    """安全にintに変換（失敗時はNoneを返す）"""
    if value is None or value == '':
        return None
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return None


def normalize_string(text: str) -> str:
    """文字列を正規化（全角スペース→半角、連続スペース→1個、前後空白除去）"""
    if not text:
        return text
    # 全角スペースを半角スペースに変換
    text = text.replace('\u3000', ' ')
    # 連続スペースを1個に
    text = re.sub(r'\s+', ' ', text)
    # 前後の空白を除去
    text = text.strip()
    return text


def normalize_name(name: str) -> str:
    """
    列名・指標名を正規化（統一処理）
    - BOM除去 \ufeff
    - 全角スペース→半角
    - 前後空白strip
    - 連続空白を1個
    """
    if not name:
        return name
    # BOM除去
    name = name.lstrip('\ufeff')
    # 全角スペースを半角スペースに変換
    name = name.replace('\u3000', ' ')
    # 前後空白除去
    name = name.strip()
    # 連続空白を1個に
    name = re.sub(r'\s+', ' ', name)
    return name


def sanitize_filename(metric: str) -> str:
    """
    ファイル名用に指標名をサニタイズ（日本語は保持）
    - Windowsで禁止の文字のみ置換: \\ / : * ? " < > | を "_" に置換
    - それ以外は保持（日本語OK、%や/は置換する）
    - 例: "BB/K" → "BB_K.json" にする（/だけ置換）
    """
    if not metric:
        return metric
    
    # 前後の空白を除去
    file_metric = metric.strip()
    
    # Windowsで禁止の文字を "_" に置換
    forbidden_chars = ['\\', '/', ':', '*', '?', '"', '<', '>', '|']
    for char in forbidden_chars:
        file_metric = file_metric.replace(char, '_')
    
    # 末尾の "." を除去（Windowsで禁止）
    file_metric = file_metric.rstrip('.')
    
    # 日本語は保持（全角スペースや連続スペースはそのまま）
    # ただし、空文字になる場合は元の値を返す
    if not file_metric:
        return metric.strip()
    
    return file_metric


def get_pa_value(row: Dict[str, Any]) -> Tuple[Optional[int], Optional[str]]:
    """
    PA（打席）の値を取得（堅牢化）
    戻り値: (PA値, 使用した列名)
    """
    # PA列を優先、無ければpa列を見る
    if 'PA' in row:
        pa_val = safe_int_or_none(row['PA'])
        if pa_val is not None:
            return pa_val, 'PA'
    
    if 'pa' in row:
        pa_val = safe_int_or_none(row['pa'])
        if pa_val is not None:
            return pa_val, 'pa'
    
    return None, None


def get_player_name(row: Dict[str, Any]) -> str:
    """選手名を取得（正規化済み）"""
    candidates = ['player_name', 'player_name_ja', 'NAME', 'name', 'Name', '選手名']
    col = find_column(row, candidates)
    if col:
        return normalize_string(str(row[col]))
    # フォールバック: player_idを文字列化
    player_id_col = find_column(row, ['player_id', 'playerId', 'ID', 'id'])
    if player_id_col:
        return normalize_string(str(row[player_id_col]))
    return "不明"


def get_team_name(row: Dict[str, Any]) -> str:
    """チーム名を取得（正規化済み）"""
    candidates = ['team', 'TEAM', 'Team', '球団', 'チーム']
    col = find_column(row, candidates)
    if col:
        return normalize_string(str(row[col]))
    return ""


def calculate_missing_values(row: Dict[str, Any]) -> Dict[str, Any]:
    """欠損値を計算で補完"""
    result = row.copy()
    
    # OPS = OBP + SLG
    if 'OPS' not in result or not result.get('OPS') or safe_float(result.get('OPS')) == 0:
        obp = safe_float(result.get('OBP') or result.get('obp'))
        slg = safe_float(result.get('SLG') or result.get('slg'))
        if obp > 0 or slg > 0:
            result['OPS'] = obp + slg
    
    # OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
    if 'OBP' not in result or not result.get('OBP') or safe_float(result.get('OBP')) == 0:
        h = safe_float(result.get('H') or result.get('hits') or result.get('Hits'))
        bb = safe_float(result.get('BB') or result.get('bb') or result.get('BB'))
        hbp = safe_float(result.get('HBP') or result.get('hbp') or result.get('HBP'))
        ab = safe_float(result.get('AB') or result.get('ab') or result.get('AB'))
        sf = safe_float(result.get('SF') or result.get('sf') or result.get('SF'))
        denominator = ab + bb + hbp + sf
        if denominator > 0:
            result['OBP'] = (h + bb + hbp) / denominator
    
    # SLG = TB / AB
    if 'SLG' not in result or not result.get('SLG') or safe_float(result.get('SLG')) == 0:
        tb = safe_float(result.get('TB') or result.get('tb') or result.get('TB'))
        ab = safe_float(result.get('AB') or result.get('ab') or result.get('AB'))
        if ab > 0 and tb >= 0:
            result['SLG'] = tb / ab
    
    # TB = 1B + 2*(2B) + 3*(3B) + 4*HR
    if 'TB' not in result or not result.get('TB') or safe_float(result.get('TB')) == 0:
        h = safe_float(result.get('H') or result.get('hits') or result.get('Hits'))
        doubles = safe_float(result.get('2B') or result.get('doubles') or result.get('2B') or result.get('doubles'))
        triples = safe_float(result.get('3B') or result.get('triples') or result.get('3B') or result.get('triples'))
        hr = safe_float(result.get('HR') or result.get('hr') or result.get('HR'))
        if h > 0:
            singles = h - doubles - triples - hr
            if singles >= 0:
                result['TB'] = singles + 2 * doubles + 3 * triples + 4 * hr
    
    # AVG = H / AB
    if 'AVG' not in result or not result.get('AVG') or safe_float(result.get('AVG')) == 0:
        h = safe_float(result.get('H') or result.get('hits') or result.get('Hits'))
        ab = safe_float(result.get('AB') or result.get('ab') or result.get('AB'))
        if ab > 0:
            result['AVG'] = h / ab
    
    # BB% = (BB / PA) * 100
    if 'BB%' not in result and 'BBPct' not in result:
        bb = safe_float(result.get('BB') or result.get('bb') or result.get('BB'))
        pa = safe_float(result.get('PA') or result.get('pa') or result.get('PA'))
        if pa > 0:
            result['BB%'] = (bb / pa) * 100
    
    # K% = (SO / PA) * 100
    if 'K%' not in result and 'KPct' not in result:
        so = safe_float(result.get('SO') or result.get('so') or result.get('SO') or result.get('K') or result.get('k'))
        pa = safe_float(result.get('PA') or result.get('pa') or result.get('PA'))
        if pa > 0:
            result['K%'] = (so / pa) * 100
    
    # RC (nf3互換)
    if 'RC' not in result or not result.get('RC') or safe_float(result.get('RC')) == 0:
        h = safe_float(result.get('H') or result.get('hits') or result.get('Hits') or result.get('安打'))
        bb = safe_float(result.get('BB') or result.get('bb') or result.get('四球'))
        hbp = safe_float(result.get('HBP') or result.get('hbp') or result.get('死球'))
        cs = safe_float(result.get('CS') or result.get('cs') or result.get('盗塁死') or result.get('盗塁刺'))
        gidp = safe_float(result.get('GDP') or result.get('gdp') or result.get('GIDP') or result.get('gidp') or result.get('併殺打'))
        tb = safe_float(result.get('TB') or result.get('tb') or result.get('塁打'))
        sf = safe_float(result.get('SF') or result.get('sf') or result.get('犠飛'))
        sh = safe_float(result.get('SH') or result.get('sh') or result.get('犠打'))
        sb = safe_float(result.get('SB') or result.get('sb') or result.get('盗塁'))
        so = safe_float(result.get('SO') or result.get('so') or result.get('K') or result.get('k') or result.get('三振'))
        ab = safe_float(result.get('AB') or result.get('ab') or result.get('打数'))

        A = h + bb + hbp - cs - gidp
        B = tb + 0.26 * (bb + hbp) + 0.53 * (sf + sh) + 0.64 * sb - 0.03 * so
        C = ab + bb + hbp + sf + sh
        if C > 0:
            # Technical RC (nf3互換)
            result['RC'] = (((A + 2.4 * C) * (B + 3 * C)) / (9 * C)) - (0.9 * C)
    
    # XR (nf3互換)
    if 'XR' not in result or not result.get('XR') or safe_float(result.get('XR')) == 0:
        singles = safe_float(result.get('1B') or result.get('singles') or result.get('単打'))
        doubles = safe_float(result.get('2B') or result.get('doubles') or result.get('二塁打'))
        triples = safe_float(result.get('3B') or result.get('triples') or result.get('三塁打'))
        hr = safe_float(result.get('HR') or result.get('hr') or result.get('HR') or result.get('本塁打'))
        bb = safe_float(result.get('BB') or result.get('bb') or result.get('BB') or result.get('四球'))
        ibb = safe_float(result.get('IBB') or result.get('ibb') or result.get('敬遠'))
        hbp = safe_float(result.get('HBP') or result.get('hbp') or result.get('HBP') or result.get('死球'))
        sb = safe_float(result.get('SB') or result.get('sb') or result.get('SB') or result.get('盗塁'))
        cs = safe_float(result.get('CS') or result.get('cs') or result.get('CS') or result.get('盗塁死') or result.get('盗塁刺'))
        ab = safe_float(result.get('AB') or result.get('ab') or result.get('AB') or result.get('打数'))
        h = safe_float(result.get('H') or result.get('hits') or result.get('Hits') or result.get('安打'))
        so = safe_float(result.get('SO') or result.get('so') or result.get('K') or result.get('k') or result.get('三振'))
        gidp = safe_float(result.get('GDP') or result.get('gdp') or result.get('GIDP') or result.get('gidp') or result.get('併殺打'))
        sf = safe_float(result.get('SF') or result.get('sf') or result.get('犠飛'))
        sh = safe_float(result.get('SH') or result.get('sh') or result.get('犠打'))
        # 1Bが計算されていない場合は計算
        if singles == 0 and h > 0:
            singles = max(0.0, h - doubles - triples - hr)
        result['XR'] = (
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
    
    return result


def get_metric_value(row: Dict[str, Any], metric: str, normalized_columns: Optional[Dict[str, str]] = None) -> Tuple[Optional[float], Optional[str], str]:
    """
    指標の値を取得（日本語指標名を最優先で探す）
    
    @param row: データ行
    @param metric: 指標名（元のまま）
    @param normalized_columns: 正規化列名→元の列名のマッピング
    @returns: (値, 使用した列名, エラー理由)
    """
    # 1) 正規化した指標名を作成
    metric_normalized = normalize_name(metric)
    
    # 2) 正規化列名マッピングがある場合、それを使って探す（最優先）
    if normalized_columns:
        if metric_normalized in normalized_columns:
            original_col = normalized_columns[metric_normalized]
            if original_col in row and row[original_col] is not None:
                val = safe_float(row[original_col])
                if val is not None and not math.isnan(val) and not math.isinf(val):
                    return val, original_col, "OK"
    
    # 3) 元の指標名をそのまま列名として探す（CSVに日本語列名が存在する場合）
    if metric in row and row[metric] is not None:
        val = safe_float(row[metric])
        if val is not None and not math.isnan(val) and not math.isinf(val):
            return val, metric, "OK"
    
    # 4) 正規化した指標名を列名として探す
    if metric_normalized in row and row[metric_normalized] is not None:
        val = safe_float(row[metric_normalized])
        if val is not None and not math.isnan(val) and not math.isinf(val):
            return val, metric_normalized, "OK"
    
    # 5) 簡易別名表で探す（日本語→英語）
    japanese_to_english = {
        '打率': 'AVG',
        '安打': 'H',
        '本塁打': 'HR',
        '打点': 'RBI',
        '試合': 'G',
        '打席': 'PA',
        '打数': 'AB',
        '単打': '1B',
        '二塁打': '2B',
        '三塁打': '3B',
        '得点': 'R',
        '出塁率': 'OBP',
        '長打率': 'SLG',
        '四球': 'BB',
        '敬遠': 'IBB',
        '死球': 'HBP',
        '三振': 'SO',
        '塁打': 'TB',
        '盗塁': 'SB',
        '盗塁死': 'CS',
        '盗塁刺': 'CS',
        '犠打': 'SH',
        '犠飛': 'SF',
        '併殺打': 'GDP',
        'GIDP': 'GDP',
    }
    
    if metric in japanese_to_english:
        english_col = japanese_to_english[metric]
        # 英語列名の候補を生成
        candidates = [english_col, english_col.upper(), english_col.lower()]
        for cand in candidates:
            if cand in row and row[cand] is not None:
                val = safe_float(row[cand])
                if val is not None and not math.isnan(val) and not math.isinf(val):
                    return val, cand, "OK"
    
    # 6) metric_map経由で探す（既存のロジック）
    # 6) 候補列名を生成して探す
    candidates = [
        metric,
        metric_normalized,
        metric.upper(),
        metric.lower(),
        metric.capitalize(),
        metric.replace('%', 'Pct'),
        metric.replace('%', '%'),
        metric.replace('_', ''),
    ]
    
    # 直接マッチ
    for candidate in candidates:
        if candidate in row and row[candidate] is not None:
            val = safe_float(row[candidate])
            if val is not None and not math.isnan(val) and not math.isinf(val):
                return val, candidate, "OK"
    
    # 7) 部分マッチ（大文字小文字無視）
    metric_lower = metric.lower().replace('%', '').replace('_', '').replace('-', '')
    for key in row.keys():
        key_lower = key.lower().replace('%', '').replace('_', '').replace('-', '')
        if metric_lower == key_lower:
            val = safe_float(row[key])
            if val is not None and not math.isnan(val) and not math.isinf(val):
                return val, key, "OK"
    
    # 8) 計算可能な指標の場合、計算を試みる
    # まず、行を計算で補完してから再度検索
    calculated_row = calculate_missing_values(row)
    if calculated_row != row:
        # 計算で補完された行から再度検索
        # 正規化した指標名を列名として探す
        if metric_normalized in calculated_row and calculated_row[metric_normalized] is not None:
            val = safe_float(calculated_row[metric_normalized])
            if val is not None and not math.isnan(val) and not math.isinf(val):
                return val, metric_normalized, "計算値"
        
        # 元の指標名を列名として探す
        if metric in calculated_row and calculated_row[metric] is not None:
            val = safe_float(calculated_row[metric])
            if val is not None and not math.isnan(val) and not math.isinf(val):
                return val, metric, "計算値"
        
        # 簡易別名表で探す（日本語→英語）
        if metric in japanese_to_english:
            english_col = japanese_to_english[metric]
            candidates = [english_col, english_col.upper(), english_col.lower()]
            for cand in candidates:
                if cand in calculated_row and calculated_row[cand] is not None:
                    val = safe_float(calculated_row[cand])
                    if val is not None and not math.isnan(val) and not math.isinf(val):
                        return val, cand, "計算値"
    
    return None, None, "列が見つからない"


def format_value(value: float, metric: str) -> Any:
    """値を適切な形式にフォーマット"""
    if math.isnan(value) or math.isinf(value):
        return None
    
    # 率系（小数3桁）
    rate_metrics = ['AVG', 'OBP', 'SLG', 'OPS', 'BABIP', 'avg', 'obp', 'slg', 'ops', 'babip']
    if metric in rate_metrics:
        return round(value, 3)
    
    # %系（小数1桁、ただし内部が0.123なら12.3に変換）
    pct_metrics = ['BB%', 'K%', 'BBPct', 'KPct', 'bb%', 'k%', 'bbpct', 'kpct']
    if metric in pct_metrics:
        # 既に%形式（0-100）ならそのまま、小数形式（0-1）なら100倍
        if value > 1:
            return round(value, 1)
        else:
            return round(value * 100, 1)
    
    # 整数っぽいものはint
    if value == int(value):
        return int(value)
    
    return value


def load_metric_map(project_root: Path) -> Dict[str, str]:
    """config/metric_map.json を読み込む（単一ソース）"""
    metric_map_path = project_root / 'config' / 'metric_map.json'
    if not metric_map_path.exists():
        raise FileNotFoundError(f"metric_map.jsonが見つかりません: {metric_map_path}")
    
    with open(metric_map_path, 'r', encoding='utf-8') as f:
        metric_map = json.load(f)
    
    return metric_map


# 規定打席到達が必要な指標（率・割合・指標系）の内部キー
METRICS_REQUIRE_QUALIFYING_PA = {
    "ops", "avg", "obp", "slg", "isop", "isod",
    "bbpct", "kpct", "bbk", "rc", "xr", "babip",
    "seca", "ta", "noi", "gpa"
}

# 規定打席到達が不要な指標（カウント系）の内部キー
METRICS_NO_QUALIFYING_PA = {
    "hits", "hr", "rbi", "games", "pa", "ab",
    "singles", "doubles", "triples", "runs",
    "bb", "ibb", "hbp", "so", "tb", "sb", "cs",
    "sh", "sf", "gidp"
}

# 規定打席到達が必要な指標（ファイル名・指標名で判定）
# Record.csvから抽出される実際の指標名に合わせる
METRICS_REQUIRE_QUALIFYING_PA_BY_NAME = {
    "OPS", "打率", "出塁率", "長打率", "IsoP", "IsoD",
    "BB%", "K%", "BB/K",  # Record.csvには "BB/K" のみ（"BB-K" はファイル名サニタイズ後の形式）
    "RC", "XR", "BABIP",  # Record.csvには "BABIP" のみ（"BABIP↓" は表示名）
    "SecA", "TA", "NOI", "GPA"
}

# 規定打席到達が不要な指標（ファイル名・指標名で判定）
METRICS_NO_QUALIFYING_PA_BY_NAME = {
    "安打", "本塁打", "打点", "試合", "打席", "打数",
    "単打", "二塁打", "三塁打", "得点",
    "四球", "敬遠", "死球", "三振", "塁打",
    "盗塁", "盗塁死", "犠打", "犠飛", "併殺打"
}


def should_require_qualifying_pa(metric_key: str) -> bool:
    """
    指標キーに対して規定打席が必要かどうかを判定
    @param metric_key: 指標の内部キー（小文字推奨）
    @returns: 規定打席が必要な場合はTrue、不要な場合はFalse
    @raises: 未知の指標キーの場合はValueError
    """
    normalized_key = metric_key.lower()
    
    if normalized_key in METRICS_REQUIRE_QUALIFYING_PA:
        return True
    
    if normalized_key in METRICS_NO_QUALIFYING_PA:
        return False
    
    # 未知の指標キーの場合はエラーを投げる（サイレント無視を防ぐ）
    raise ValueError(
        f"Unknown metricKey: {metric_key} (normalized: {normalized_key}). "
        f"Please add it to either METRICS_REQUIRE_QUALIFYING_PA or METRICS_NO_QUALIFYING_PA"
    )


def extract_metrics_from_record_csv(record_csv_path: str) -> List[str]:
    """Record.csvから指標リストを抽出（ヘッダーのみでも対応）"""
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
        return []
    
    # 改行文字を除去
    first_line = first_line.rstrip('\r\n')
    
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
    
    return metrics


def generate_ranking_for_metric(
    batting_data: List[Dict[str, Any]],
    metric: str,
    output_path: str,
    top_n: int = 100,
    min_pa: int = 443,
    metric_map: Optional[Dict[str, str]] = None,
    normalized_columns: Optional[Dict[str, str]] = None,
    csv_columns: Optional[List[str]] = None
) -> Tuple[bool, str]:
    """
    指定指標のランキングを生成（詳細ログ付き）
    
    @param batting_data: バッティングデータ
    @param metric: 指標の表示名（例: "OPS", "打率", "安打"）
    @param output_path: 出力パス
    @param top_n: 上位N件
    @param min_pa: 規定打席（デフォルト443）
    @param metric_map: 指標マップ（表示名 → 内部キー）
    @param normalized_columns: 正規化列名→元の列名のマッピング
    @param csv_columns: CSVの列名一覧（ログ用）
    @returns: (成功した場合True, エラー理由)
    """
    # 1) 指標の正規化
    metric_normalized = normalize_name(metric)
    
    # 2) 指標の内部キーを取得（metric_mapから）
    metric_key = None
    if metric_map and metric in metric_map:
        metric_key = metric_map[metric]
    else:
        # metric_mapがない場合、表示名を小文字化して試す
        metric_key = metric.lower().replace('%', 'pct').replace('/', '').replace('-', '')
    
    # 3) 規定打席が必要かどうかを判定
    requires_qualifying_pa = False
    try:
        requires_qualifying_pa = should_require_qualifying_pa(metric_key)
    except ValueError as e:
        # 未知の指標キーの場合はエラーをログに記録し、フィルタリングしない
        print(f"   ⚠️  [QUALIFY] Unknown metricKey: {metric_key}, filtering disabled: {e}")
        requires_qualifying_pa = False
    
    # 4) 実際に使用するmin_paを決定
    effective_min_pa = min_pa if requires_qualifying_pa else 0
    
    # 5) データを計算で補完（フル母集団）
    enriched_data = []
    for row in batting_data:
        enriched_row = calculate_missing_values(row)
        enriched_data.append(enriched_row)
    
    full_count = len(enriched_data)
    
    # 6) 規定打席フィルタを適用（Aグループのみ）
    filtered_data = []
    for row in enriched_data:
        pa_val, _ = get_pa_value(row)
        # Aグループ（規定打席必要）の場合のみフィルタリング
        if requires_qualifying_pa:
            if pa_val is not None and pa_val >= effective_min_pa:
                filtered_data.append(row)
        else:
            # Bグループ（規定打席不要）の場合は全選手対象（フル母集団）
            filtered_data.append(row)
    
    qualified_count = len(filtered_data)
    
    # 7) サンプル行で列名解決を試す（ログ用）
    csv_col = None
    value_type = "unknown"
    sample_row = enriched_data[0] if enriched_data else {}
    value, csv_col, reason = get_metric_value(sample_row, metric, normalized_columns)
    
    if value is not None:
        if isinstance(value, (int, float)):
            if value == int(value):
                value_type = "int"
            else:
                value_type = "float"
        else:
            value_type = type(value).__name__
    else:
        if reason == "列が見つからない":
            value_type = "列なし"
        else:
            value_type = f"取得失敗({reason})"
    
    # 8) 詳細ログ出力
    print(f"   [METRIC] metric={metric} normalized={metric_normalized} csv_col={csv_col or 'None'} value_type={value_type} output={Path(output_path).name} reason={reason}")
    
    # 9) 指標の値を取得してソート
    players_with_value = []
    nan_count = 0
    for row in filtered_data:
        value, _, _ = get_metric_value(row, metric, normalized_columns)
        # 数値で並べられない指標（NaN、None、空文字、不正文字列）は除外
        if value is not None and not math.isnan(value) and not math.isinf(value):
            players_with_value.append((value, row))
        else:
            nan_count += 1
    
    if not players_with_value:
        error_reason = f"全NaN({nan_count}件)" if nan_count > 0 else "列なし"
        print(f"   [METRIC] metric={metric} FAILED: {error_reason}")
        return False, error_reason
    
    # 降順でソート
    players_with_value.sort(key=lambda x: x[0], reverse=True)
    
    # TOP100を取得
    top_players = players_with_value[:top_n]
    
    # JSON形式に整形
    result = []
    for rank, (value, row) in enumerate(top_players, start=1):
        player_name = get_player_name(row)
        team_name = get_team_name(row)
        pa, _ = get_pa_value(row)
        
        formatted_value = format_value(value, metric)
        # 現在の指標の内部キー（ソートに使った値は正しいのでそれをそのまま使う）
        current_metric_key = metric_key
        
        player_data = {
            'rank': rank,
            'player': player_name,
            'team': team_name,
            'PA': pa,
            'value': formatted_value,
            'metric': metric,
        }
        
        # 既存UIの形式に合わせて追加フィールドを設定
        # generatePlayerData()の形式を参考にする
        player_data['playerId'] = f"player-{rank}"
        player_data['name'] = normalize_string(player_name)
        # 英字名の取得（優先順: player_name_en → RomanName → romanName → roman_name）
        # 大文字小文字を区別せずに検索
        roman_name_raw = None
        for key in row.keys():
            key_lower = key.lower()
            if key_lower in ['player_name_en', 'romanname', 'roman_name', 'name_en', 'english_name']:
                val = row.get(key)
                if val and str(val).strip():
                    roman_name_raw = val
                    break
        
        # 取得できなかった場合は空文字
        if roman_name_raw is None:
            roman_name_raw = ''
        
        roman_name = normalize_string(str(roman_name_raw).strip())
        # 空白のみの場合は空文字にする
        if not roman_name or roman_name.isspace():
            roman_name = ''
        player_data['romanName'] = roman_name
        player_data['team'] = normalize_string(team_name)
        
        # その他のフィールドも可能な限り設定
        # 現在の指標はソートに使った値（正しい）をそのまま使う。他は get_metric_value で取得
        def _get_metric_val(display_name: str, fallback_eng: str) -> Optional[float]:
            v, _, _ = get_metric_value(row, display_name, normalized_columns)
            if v is not None:
                return v
            v, _, _ = get_metric_value(row, fallback_eng, normalized_columns)
            if v is not None:
                return v
            return safe_float(row.get(fallback_eng) or row.get(fallback_eng.lower()))
        obp_val = formatted_value if current_metric_key == 'obp' else _get_metric_val('出塁率', 'OBP')
        slg_val = formatted_value if current_metric_key == 'slg' else _get_metric_val('長打率', 'SLG')
        if obp_val is None:
            obp_val = row.get('OBP') or row.get('obp')
        if slg_val is None:
            slg_val = row.get('SLG') or row.get('slg')
        # 打率は定義上 H/AB。CSVで打率列に長打率など別の値が入っている場合があるため計算値で上書き
        h_val = safe_float(row.get('H') or row.get('hits') or row.get('Hits') or row.get('安打'))
        ab_val = safe_float(row.get('AB') or row.get('ab') or row.get('打数'))
        if h_val is not None and ab_val is not None and ab_val > 0:
            avg_val = h_val / ab_val
        else:
            avg_val = formatted_value if current_metric_key == 'avg' else _get_metric_val('打率', 'AVG')
            if avg_val is None:
                avg_val, _, _ = get_metric_value(row, 'AVG', normalized_columns)
            if avg_val is None:
                avg_val = row.get('AVG') or row.get('avg')
        # OPSは定義上 OBP+SLG。CSVでOPS列に別の値が入っている場合があるため計算値で上書き
        if obp_val is not None and slg_val is not None:
            ops_val = safe_float(obp_val) + safe_float(slg_val)
        else:
            ops_val = formatted_value if current_metric_key == 'ops' else _get_metric_val('OPS', 'OPS')
        if ops_val is None:
            ops_val = row.get('OPS') or row.get('ops')
        player_data['age'] = safe_int(row.get('Age') or row.get('age'), 0)
        player_data['ops'] = format_value(safe_float(ops_val), 'OPS')
        player_data['avg'] = format_value(safe_float(avg_val), 'AVG')
        # 現在指標がOPSのとき、value も計算した OPS に合わせる
        if current_metric_key == 'ops' and ops_val is not None:
            player_data['value'] = format_value(safe_float(ops_val), 'OPS')
        # 現在指標が打率のとき、value も計算した打率に合わせる
        if current_metric_key == 'avg' and avg_val is not None:
            player_data['value'] = format_value(safe_float(avg_val), 'AVG')
        player_data['hits'] = safe_int(row.get('H') or row.get('hits') or row.get('Hits') or row.get('安打'), 0)
        player_data['hr'] = safe_int(row.get('HR') or row.get('hr') or row.get('HR') or row.get('本塁打'), 0)
        player_data['rbi'] = safe_int(row.get('RBI') or row.get('rbi') or row.get('RBI') or row.get('打点'), 0)
        player_data['games'] = safe_int(row.get('G') or row.get('games') or row.get('G') or row.get('試合'), 0)
        player_data['pa'] = safe_int(row.get('PA') or row.get('pa') or row.get('PA') or row.get('打席'), 0)
        player_data['ab'] = safe_int(row.get('AB') or row.get('ab') or row.get('AB') or row.get('打数'), 0)
        player_data['doubles'] = safe_int(row.get('2B') or row.get('doubles') or row.get('2B') or row.get('二塁打'), 0)
        player_data['triples'] = safe_int(row.get('3B') or row.get('triples') or row.get('3B') or row.get('三塁打'), 0)
        player_data['runs'] = safe_int(row.get('R') or row.get('runs') or row.get('R') or row.get('得点'), 0)
        # 単打: CSVに単打/1B列が空のことがあるため H - 2B - 3B - HR で計算
        singles_raw = safe_int(row.get('1B') or row.get('singles') or row.get('単打'), 0)
        if singles_raw > 0:
            player_data['singles'] = singles_raw
        else:
            h, d, t, hr = player_data['hits'], player_data['doubles'], player_data['triples'], player_data['hr']
            player_data['singles'] = max(0, (h or 0) - (d or 0) - (t or 0) - (hr or 0))
        player_data['obp'] = format_value(safe_float(obp_val), 'OBP')
        player_data['slg'] = format_value(safe_float(slg_val), 'SLG')
        player_data['isop'] = format_value(
            safe_float(slg_val) - safe_float(avg_val) if (slg_val is not None and avg_val is not None) else 0.0,
            'SLG'
        )
        player_data['isod'] = format_value(
            safe_float(obp_val) - safe_float(avg_val) if (obp_val is not None and avg_val is not None) else 0.0,
            'OBP'
        )
        bb_pct = safe_float(row.get('BB%') or row.get('BBPct') or row.get('bb%'))
        if bb_pct == 0:
            bb = safe_float(row.get('BB') or row.get('bb'))
            pa_val = safe_float(row.get('PA') or row.get('pa'))
            if pa_val > 0:
                bb_pct = (bb / pa_val) * 100
        player_data['bbPct'] = format_value(bb_pct, 'BB%')
        k_pct = safe_float(row.get('K%') or row.get('KPct') or row.get('k%'))
        if k_pct == 0:
            so = safe_float(row.get('SO') or row.get('so') or row.get('K'))
            pa_val = safe_float(row.get('PA') or row.get('pa'))
            if pa_val > 0:
                k_pct = (so / pa_val) * 100
        player_data['kPct'] = format_value(k_pct, 'K%')
        player_data['bb'] = safe_int(row.get('BB') or row.get('bb') or row.get('BB'), 0)
        player_data['ibb'] = safe_int(row.get('IBB') or row.get('ibb') or row.get('IBB'), 0)
        player_data['hbp'] = safe_int(row.get('HBP') or row.get('hbp') or row.get('HBP'), 0)
        player_data['so'] = safe_int(row.get('SO') or row.get('so') or row.get('K') or row.get('k'), 0)
        bb_val = safe_float(row.get('BB') or row.get('bb'))
        so_val = safe_float(row.get('SO') or row.get('so') or row.get('K'))
        player_data['bbk'] = format_value(bb_val / so_val if so_val > 0 else 0.0, 'bbk')
        player_data['tb'] = safe_int(row.get('TB') or row.get('tb') or row.get('TB'), 0)
        player_data['sb'] = safe_int(row.get('SB') or row.get('sb') or row.get('SB'), 0)
        # 盗塁死（CS）: 英語カラム名「CS」または日本語カラム名「盗塁死」「盗塁刺」から取得
        player_data['cs'] = safe_int(
            row.get('CS') or row.get('cs') or 
            row.get('盗塁死') or row.get('盗塁刺'), 
            0
        )
        player_data['sh'] = safe_int(row.get('SH') or row.get('sh') or row.get('SH'), 0)
        player_data['sf'] = safe_int(row.get('SF') or row.get('sf') or row.get('SF'), 0)
        # 併殺打（GDP）: 英語カラム名「GDP」または日本語カラム名「併殺打」から取得
        # 注意: CSVには「GDP」として存在（GIDPではない）
        player_data['gidp'] = safe_int(
            row.get('GDP') or row.get('gdp') or 
            row.get('GIDP') or row.get('gidp') or 
            row.get('併殺打'), 
            0
        )
        player_data['rc'] = safe_int(row.get('RC') or row.get('rc') or row.get('RC'), 0)
        # XRは小数指標（nf3互換）なのでfloatで保持
        player_data['xr'] = safe_float(row.get('XR') or row.get('xr') or row.get('XR'), 0.0)
        player_data['babip'] = format_value(safe_float(row.get('BABIP') or row.get('babip')), 'BABIP')
        player_data['seca'] = format_value(safe_float(row.get('SecA') or row.get('seca')), 'SecA')
        player_data['ta'] = format_value(safe_float(row.get('TA') or row.get('ta')), 'TA')
        player_data['noi'] = format_value(safe_float(row.get('NOI') or row.get('noi')), 'NOI')
        player_data['gpa'] = format_value(safe_float(row.get('GPA') or row.get('gpa')), 'GPA')
        
        result.append(player_data)
    
    # 出力ディレクトリを作成
    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # 13) JSONファイルに出力
    try:
        output_path_obj = Path(output_path)
        output_path_obj.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"   [METRIC] metric={metric} SUCCESS: {len(result)}件を出力")
        return True, "OK"
    except Exception as e:
        error_reason = f"ファイル書き込みエラー: {e}"
        print(f"   [METRIC] metric={metric} FAILED: {error_reason}")
        import traceback
        traceback.print_exc()
        return False, error_reason


def find_file_with_fallback(filename: str, search_paths: List[Path]) -> Optional[Path]:
    """ファイルを複数のパスから順に探す"""
    for search_path in search_paths:
        file_path = search_path / filename
        if file_path.exists():
            return file_path
    return None


def normalize_metric_json_for_ui(output_dir: Path, metrics: List[str]) -> None:
    """
    UIが読む {指標名}.json を正規化する
    
    - Aグループ（規定打席必要）: {指標名}.json は規定あり版のまま（変更なし）
    - Bグループ（規定打席不要）: {指標名}.json を {指標名}_all.json の内容で上書き
    """
    import shutil
    import tempfile
    
    overwritten_count = 0
    
    # デバッグ: 抽出された指標名と定義されている指標名を確認
    print(f"   [QUALIFY-MAP] デバッグ: 抽出された指標数={len(metrics)}")
    print(f"   [QUALIFY-MAP] デバッグ: 定義されているAグループ={sorted(METRICS_REQUIRE_QUALIFYING_PA_BY_NAME)}")
    
    for metric in metrics:
        # ファイル名用にサニタイズ
        file_metric = sanitize_filename(metric)
        json_path = output_dir / f"{file_metric}.json"
        json_all_path = output_dir / f"{file_metric}_all.json"
        
        # 両方のファイルが存在することを確認
        if not json_path.exists():
            print(f"   ⚠️  [QUALIFY-MAP] {metric}: {json_path} が存在しません")
            continue
        
        if not json_all_path.exists():
            print(f"   ⚠️  [QUALIFY-MAP] {metric}: {json_all_path} が存在しません")
            continue
        
        # 指標名でA/Bグループを判定
        is_a_group = metric in METRICS_REQUIRE_QUALIFYING_PA_BY_NAME
        is_b_group = metric in METRICS_NO_QUALIFYING_PA_BY_NAME
        
        # デバッグ: 判定結果を出力
        print(f"   [QUALIFY-MAP] デバッグ: metric={metric} is_a_group={is_a_group} is_b_group={is_b_group}")
        
        if not is_a_group and not is_b_group:
            print(f"   ⚠️  [QUALIFY-MAP] {metric}: A/Bグループのどちらにも分類されていません")
            # 分類されていない場合はスキップ（エラーにはしない）
            continue
        
        if is_a_group:
            # Aグループ: 何もしない（規定あり版のまま）
            print(f"   [QUALIFY-MAP] A: keep {file_metric}.json (qualified)")
        else:
            # Bグループ: {指標名}.json を {指標名}_all.json で上書き
            # Windowsでファイルロックを避けるため、一時ファイル経由でコピー
            try:
                with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', delete=False, dir=output_dir) as tmp_file:
                    tmp_path = Path(tmp_file.name)
                    # _all.json の内容を読み込んで一時ファイルに書き込む
                    with open(json_all_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    json.dump(data, tmp_file, ensure_ascii=False, indent=2)
                
                # 一時ファイルを正式ファイルにリネーム（上書き）
                # Windowsでファイルロックを避けるため、既存ファイルを削除してからリネーム
                if json_path.exists():
                    json_path.unlink()
                tmp_path.replace(json_path)
                overwritten_count += 1
                print(f"   [QUALIFY-MAP] B: overwrite {file_metric}.json <- {file_metric}_all.json (unqualified)")
            except Exception as e:
                print(f"   ❌ [QUALIFY-MAP] {metric}: 上書きエラー: {e}")
                import traceback
                traceback.print_exc()
                raise
    
    print(f"\n   ✅ [QUALIFY-MAP] 正規化完了: Bグループ {overwritten_count}件を上書きしました")


def validate_metric_json_mapping(
    output_dir: Path,
    metrics: List[str],
    metric_map: Dict[str, str],
    min_pa: int
) -> None:
    """
    UIが読む {指標名}.json のマッピングを検証
    
    - Aグループ: PA < min_pa が混入していないか確認
    - Bグループ: {指標名}.json と {指標名}_all.json が完全一致することを確認（sha256）
    """
    import hashlib
    
    a_errors = []
    b_errors = []
    
    for metric in metrics:
        file_metric = sanitize_filename(metric)
        json_path = output_dir / f"{file_metric}.json"
        json_all_path = output_dir / f"{file_metric}_all.json"
        
        if not json_path.exists():
            continue
        
        # 指標名でA/Bグループを判定
        is_a_group = metric in METRICS_REQUIRE_QUALIFYING_PA_BY_NAME
        
        try:
            if is_a_group:
                # Aグループ検証: PA < min_pa が混入していないか確認
                with open(json_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                if not isinstance(data, list):
                    continue
                
                for idx, player in enumerate(data):
                    if not isinstance(player, dict):
                        continue
                    
                    # PA値を取得（pa/PA/打席のどれか）
                    pa_val = None
                    if 'pa' in player:
                        pa_val = safe_int_or_none(player['pa'])
                    elif 'PA' in player:
                        pa_val = safe_int_or_none(player['PA'])
                    elif '打席' in player:
                        pa_val = safe_int_or_none(player['打席'])
                    
                    if pa_val is not None and pa_val < min_pa:
                        player_name = player.get('name', player.get('player', '不明'))
                        a_errors.append(
                            f"[QUALIFY-MAP][FAIL] metric={metric} "
                            f"player={player_name} pa={pa_val} (min={min_pa})"
                        )
            else:
                # Bグループ検証: json と all が完全一致することを確認（sha256）
                if not json_all_path.exists():
                    b_errors.append(
                        f"[QUALIFY-MAP][FAIL] metric={metric}: {file_metric}_all.json が存在しません"
                    )
                    continue
                
                # 両方のファイルのハッシュを計算
                def calculate_file_hash(file_path: Path) -> str:
                    with open(file_path, 'rb') as f:
                        return hashlib.sha256(f.read()).hexdigest()
                
                json_hash = calculate_file_hash(json_path)
                json_all_hash = calculate_file_hash(json_all_path)
                
                if json_hash != json_all_hash:
                    b_errors.append(
                        f"[QUALIFY-MAP][FAIL] metric={metric}: "
                        f"{file_metric}.json と {file_metric}_all.json が一致しません "
                        f"(json_hash={json_hash[:16]}..., all_hash={json_all_hash[:16]}...)"
                    )
        
        except Exception as e:
            if is_a_group:
                a_errors.append(f"[QUALIFY-MAP][FAIL] metric={metric}: 検証エラー: {e}")
            else:
                b_errors.append(f"[QUALIFY-MAP][FAIL] metric={metric}: 検証エラー: {e}")
    
    # エラーを報告
    if a_errors:
        error_msg = "\n".join(a_errors)
        raise ValueError(
            f"❌ Aグループのバリデーション失敗: PA<{min_pa}が混入しています\n"
            f"{error_msg}"
        )
    
    if b_errors:
        error_msg = "\n".join(b_errors)
        raise ValueError(
            f"❌ Bグループのバリデーション失敗: json と all が一致しません\n"
            f"{error_msg}"
        )
    
    print(f"   ✅ [QUALIFY-MAP] バリデーション完了:")
    print(f"      - Aグループ: PA<{min_pa}混入なし")
    print(f"      - Bグループ: json と all が完全一致")


def validate_qualifying_pa_filter(
    output_dir: Path,
    metrics: List[str],
    metric_map: Dict[str, str],
    min_pa: int,
    full_population_count: int
) -> None:
    """
    A/Bグループ指標のランキングJSONを検証
    
    - Aグループ: pa < min_pa の選手が1人でも入っていたら例外で終了
    - Bグループ: フル母集団であることを確認（pa < min_pa が含まれる、または行数が一致）
    """
    a_errors = []
    b_errors = []
    
    for metric in metrics:
        # 指標の内部キーを取得
        metric_key = None
        if metric in metric_map:
            metric_key = metric_map[metric]
        else:
            metric_key = metric.lower().replace('%', 'pct').replace('/', '').replace('-', '')
        
        # A/Bグループかどうかを判定
        try:
            requires_qualifying_pa = should_require_qualifying_pa(metric_key)
        except ValueError:
            # 未知の指標キーはスキップ
            continue
        
        # JSONファイルを読み込んで検証
        file_metric = sanitize_filename(metric)
        json_path = output_dir / f"{file_metric}.json"
        
        if not json_path.exists():
            continue
        
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if not isinstance(data, list):
                continue
            
            output_count = len(data)
            
            if requires_qualifying_pa:
                # Aグループ検証: pa < min_pa が混入していないか確認
                for idx, player in enumerate(data):
                    if not isinstance(player, dict):
                        continue
                    
                    # PA値を取得（paまたはPAキーから）
                    pa_val = None
                    if 'pa' in player:
                        pa_val = safe_int_or_none(player['pa'])
                    elif 'PA' in player:
                        pa_val = safe_int_or_none(player['PA'])
                    
                    if pa_val is not None and pa_val < min_pa:
                        player_name = player.get('name', player.get('player', '不明'))
                        a_errors.append(
                            f"[RANK][FAIL] metric={metric} key={metric_key} "
                            f"player={player_name} pa={pa_val} (min={min_pa})"
                        )
            else:
                # Bグループ検証: フル母集団であることを確認
                # 方法1: pa < min_pa が存在することを確認（「絞ってない」証明）
                has_low_pa = False
                for idx, player in enumerate(data):
                    if not isinstance(player, dict):
                        continue
                    
                    # PA値を取得
                    pa_val = None
                    if 'pa' in player:
                        pa_val = safe_int_or_none(player['pa'])
                    elif 'PA' in player:
                        pa_val = safe_int_or_none(player['PA'])
                    
                    if pa_val is not None and pa_val < min_pa:
                        has_low_pa = True
                        break
                
                # 方法2: 行数がフル母集団と一致するか確認（より強い検証）
                # ただし、指標値がNaN/nullで除外された選手がいる可能性があるため、
                # 完全一致は要求しない（pa < min_pa が存在すればOK）
                
                if not has_low_pa and output_count < full_population_count * 0.5:
                    # pa < min_pa が存在せず、かつ行数が大幅に減っている場合は警告
                    # （ただし、指標値がNaN/nullで除外された選手が多い可能性もある）
                    # ここでは警告のみ（エラーにはしない）
                    print(f"   ⚠️  [RANK] metric={metric} key={metric_key} B-group but output_count={output_count} < full_count*0.5={full_population_count*0.5}")
        
        except Exception as e:
            if requires_qualifying_pa:
                a_errors.append(f"[RANK][FAIL] metric={metric} JSON読み込みエラー: {e}")
            else:
                b_errors.append(f"[RANK][FAIL] metric={metric} JSON読み込みエラー: {e}")
    
    # エラーを報告
    if a_errors:
        error_msg = "\n".join(a_errors)
        raise ValueError(
            f"❌ 規定打席フィルタのバリデーション失敗: Aグループにpa<{min_pa}が混入しています\n"
            f"{error_msg}"
        )
    
    if b_errors:
        error_msg = "\n".join(b_errors)
        raise ValueError(
            f"❌ Bグループのバリデーション失敗: フル母集団ランキングの検証エラー\n"
            f"{error_msg}"
        )


def validate_generated_json_files(
    output_dir: Path,
    metrics: List[str],
    metric_map: Dict[str, str]
) -> None:
    """生成されたJSONファイルをバリデーション（欠けたら例外で終了）"""
    # Record順に抽出したavailableMetricsを取得（CSVに存在する指標のみ）
    # ここでは簡易的に、生成されたJSONファイルの存在を確認
    required_keys = set(metric_map.values())  # すべてのJSONキー
    
    # 特に重要なキー（BB%、K%、BB/K）を確認
    critical_keys = {'bbPct', 'kPct', 'bbk'}
    
    validated_count = 0
    
    # 各指標のJSONファイルを検証
    for metric in metrics:
        file_metric = sanitize_filename(metric)
        json_path = output_dir / f"{file_metric}.json"
        
        if not json_path.exists():
            continue  # 生成されなかった指標はスキップ
        
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if not isinstance(data, list) or len(data) == 0:
                continue  # 空のデータはスキップ
            
            # 最初の行で全キーを確認
            first_row = data[0]
            row_keys = set(first_row.keys())
            
            # メタデータキー（必須ではない）
            meta_keys = {'rank', 'player', 'team', 'value', 'metric', 'playerId', 'name', 'romanName', 'age', 'PA'}
            
            # 必須キーがすべて存在するか確認（メタデータを除く）
            expected_data_keys = required_keys - meta_keys
            missing_keys = expected_data_keys - row_keys
            
            if missing_keys:
                raise ValueError(
                    f"❌ {metric}.json に必須キーが欠けています: {sorted(missing_keys)}\n"
                    f"   存在するキー: {sorted(row_keys)}\n"
                    f"   期待されるデータキー: {sorted(expected_data_keys)}"
                )
            
            # 特に重要なキー（BB%、K%、BB/K）が存在するか確認
            missing_critical = critical_keys - row_keys
            if missing_critical:
                raise ValueError(
                    f"❌ {metric}.json に重要なキーが欠けています: {sorted(missing_critical)}\n"
                    f"   特に bbPct, kPct, bbk は必須です\n"
                    f"   存在するキー: {sorted(row_keys)}"
                )
            
            # すべての行でキーが一致するか確認
            for idx, row in enumerate(data):
                if not isinstance(row, dict):
                    raise ValueError(f"❌ {metric}.json の {idx+1}行目が辞書型ではありません")
                
                row_keys = set(row.keys())
                if row_keys != set(first_row.keys()):
                    missing = set(first_row.keys()) - row_keys
                    extra = row_keys - set(first_row.keys())
                    raise ValueError(
                        f"❌ {metric}.json の {idx+1}行目でキーが不一致:\n"
                        f"   欠けているキー: {sorted(missing)}\n"
                        f"   余分なキー: {sorted(extra)}"
                    )
            
            validated_count += 1
        
        except json.JSONDecodeError as e:
            raise ValueError(f"❌ {metric}.json のJSON解析エラー: {e}")
        except Exception as e:
            if isinstance(e, ValueError):
                raise
            raise ValueError(f"❌ {metric}.json の検証エラー: {e}")
    
    print(f"   ✅ {validated_count}件のJSONファイルを検証しました")


def main():
    # コマンドライン引数をパース（最初に実行）
    import argparse
    parser = argparse.ArgumentParser(description='ランキングJSONを生成')
    parser.add_argument('--year', type=int, default=2025, help='年度（デフォルト: 2025）')
    parser.add_argument('--league', type=str, default='PL', choices=['PL', 'CL'], help='リーグ（デフォルト: PL）')
    args = parser.parse_args()
    
    year_arg = args.year
    league_arg = args.league
    
    # スクリプトのディレクトリを基準にパスを設定
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    print(f"📁 プロジェクトルート: {project_root}")
    print(f"📁 スクリプトディレクトリ: {script_dir}")
    print(f"📅 対象年度: {year_arg}年")
    print(f"🏟️  対象リーグ: {league_arg}")
    
    # データ置き場フォルダ
    data_master_csv_dir = project_root / '_data' / 'master_csv'
    data_master_csv_calculated_dir = project_root / '_data' / 'master_csv_calculated'
    
    # Record.csv の探索（ルート直下 → _data/master_csv/）
    record_search_paths = [
        project_root,  # 1) ルート直下
        data_master_csv_dir,  # 2) _data/master_csv/
    ]
    record_csv_path = find_file_with_fallback('Record.csv', record_search_paths)
    
    # batting_YYYY_(PL|CL)_from_master.csv の探索（計算済みCSV優先）
    batting_filename = f'batting_{year_arg}_{league_arg}_from_master.csv'
    batting_search_paths = [
        data_master_csv_calculated_dir,  # 1) _data/master_csv_calculated/
        data_master_csv_dir,  # 2) _data/master_csv/
        project_root,  # 3) プロジェクトルート直下（後方互換）
    ]
    batting_csv_path = find_file_with_fallback(batting_filename, batting_search_paths)
    
    # 出力ディレクトリ（年度とリーグに基づいて動的生成）
    output_dir = project_root / 'public' / 'data' / 'rankings' / str(year_arg) / league_arg
    
    print(f"\n📄 入力ファイル確認:")
    
    # Record.csv の結果表示
    if record_csv_path:
        print(f"   ✅ Record.csv が見つかりました: {record_csv_path}")
    else:
        print(f"   ❌ Record.csv が見つかりません")
        print(f"   探索したパス:")
        for search_path in record_search_paths:
            print(f"     - {search_path / 'Record.csv'}")
        print(f"   プロジェクトルートまたは _data/master_csv/ にRecord.csvを配置してください")
        return 1
    
    # batting_YYYY_(PL|CL)_from_master.csv の結果表示
    if batting_csv_path:
        print(f"   ✅ {batting_filename} が見つかりました: {batting_csv_path}")
        print(f"   📍 実際に使用した入力パス: {batting_csv_path}")
    else:
        print(f"   ❌ {batting_filename} が見つかりません")
        print(f"   探索したパス:")
        for search_path in batting_search_paths:
            print(f"     - {search_path / batting_filename}")
        print(f"   _data/master_csv_calculated/ または _data/master_csv/ またはプロジェクトルートにCSVファイルを配置してください")
        return 1
    
    # バッティングデータを読み込む
    try:
        batting_data = load_csv_with_encoding(str(batting_csv_path))
        print(f"✅ バッティングデータを読み込みました: {len(batting_data)}件")
    except Exception as e:
        print(f"❌ バッティングデータの読み込みに失敗: {e}")
        return 1
    
    # 規定打席到達版CSV（2025年のみ）: 規定必須指標用に使用するとサイト負荷・読み込み軽減
    batting_data_qualifying = None
    if year_arg == 2025:
        qualifying_filename = f'batting_2025_{league_arg}_qualifying.csv'
        qualifying_csv_path = data_master_csv_calculated_dir / qualifying_filename
        if qualifying_csv_path.exists():
            try:
                batting_data_qualifying = load_csv_with_encoding(str(qualifying_csv_path))
                print(f"✅ 規定打席到達版CSVを読み込みました: {qualifying_filename} ({len(batting_data_qualifying)}件)")
            except Exception as e:
                print(f"⚠️  規定打席到達版CSVの読み込みに失敗（フルCSVで続行）: {e}")
        else:
            print(f"   📋 規定打席到達版CSVなし（{qualifying_filename}）。フルCSVで規定フィルタを適用します。")

    # 指標リストを抽出
    metrics = extract_metrics_from_record_csv(str(record_csv_path))
    if not metrics:
        print(f"❌ 指標リストの抽出に失敗しました")
        return 1
    
    print(f"✅ 指標リストを抽出しました: {len(metrics)}件")
    print(f"   指標: {', '.join(metrics[:10])}{'...' if len(metrics) > 10 else ''}")
    
    # 年度とリーグをコマンドライン引数から取得（既に取得済み）
    year = year_arg
    league = league_arg
    
    # 規定打席を自動計算
    MIN_PA = None
    TEAM_GAMES = None
    source_url = None
    
    # 2025年PLの場合は443に固定（シーズン途中のため自動取得が不正確）
    if year == 2025 and league == 'PL':
        MIN_PA = 443
        TEAM_GAMES = 143
        print(f"\n📊 規定打席設定（2025年PL固定値）:")
        print(f"   年度: {year}年")
        print(f"   リーグ: {league}")
        print(f"   試合数(G): {TEAM_GAMES}")
        print(f"   規定打席(min_pa): {MIN_PA} (固定値)")
    # 2025年CLの場合は443に固定（シーズン途中のため自動取得が不正確）
    elif year == 2025 and league == 'CL':
        MIN_PA = 443
        TEAM_GAMES = 143
        print(f"\n📊 規定打席設定（2025年CL固定値）:")
        print(f"   年度: {year}年")
        print(f"   リーグ: {league}")
        print(f"   試合数(G): {TEAM_GAMES}")
        print(f"   規定打席(min_pa): {MIN_PA} (固定値)")
    elif get_min_pa_by_year:
        try:
            TEAM_GAMES, MIN_PA, source_url = get_min_pa_by_year(year, league)
            print(f"\n📊 規定打席設定（自動取得）:")
            print(f"   年度: {year}年")
            print(f"   リーグ: {league}")
            print(f"   試合数(G): {TEAM_GAMES}")
            print(f"   規定打席(min_pa): {MIN_PA} (G × 3.1)")
            print(f"   取得元URL: {source_url}")
        except ValueError as e:
            print(f"\n❌ 規定打席の自動取得に失敗しました:")
            print(f"   {e}")
            print(f"   手動でmin_paを指定するか、NPB公式ページを確認してください。")
            return 1
    else:
        # フォールバック: 固定値（get_min_pa_by_yearが利用できない場合）
        TEAM_GAMES = 143
        MIN_PA = int(round(TEAM_GAMES * 3.1))
        print(f"\n📊 規定打席設定（固定値）:")
        print(f"   年度: {year}年")
        print(f"   リーグ: {league}")
        print(f"   試合数(G): {TEAM_GAMES}（固定値、get_min_pa_by_yearが利用できません）")
        print(f"   規定打席(min_pa): {MIN_PA} (G × 3.1)")
    
    MIN_PA_2025 = MIN_PA  # 既存コードとの互換性のため
    
    # PA列の確認（最初のデータ行から）
    if batting_data:
        pa_val, pa_col_name = get_pa_value(batting_data[0])
        if pa_col_name:
            print(f"   📍 使用するPA列: {pa_col_name}")
        else:
            print(f"   ⚠️  PA列が見つかりません（PAまたはpa列が必要です）")
    
    # 既存の不正なフォルダ（BB/など）を削除
    if output_dir.exists():
        for item in output_dir.iterdir():
            if item.is_dir() and item.name in ['BB', 'K']:  # BB/K で作られた可能性のあるフォルダ
                print(f"   🗑️  既存の不正なフォルダを削除: {item}")
                try:
                    shutil.rmtree(item)
                except Exception as e:
                    print(f"   ⚠️  フォルダ削除エラー: {e}")
    
    # metric_mapを読み込む
    try:
        metric_map = load_metric_map(project_root)
        print(f"✅ metric_map.jsonを読み込みました: {len(metric_map)}件")
    except Exception as e:
        print(f"⚠️  metric_map.jsonの読み込みに失敗: {e}")
        metric_map = {}
    
    # 各指標のランキングを生成（規定あり版と規定なし版の両方）
    success_count = 0
    failed_metrics = []
    
    # デバッグログ（開発時のみ）
    import os
    is_dev = os.getenv('NODE_ENV') == 'development' or os.getenv('PYTHON_ENV') == 'development'
    if is_dev or True:  # 暫定的に常に出力
        print(f"\n[QUALIFY] year={year_arg} league={league_arg} minPA={MIN_PA_2025}")
    
    for metric in metrics:
        # ファイル名用にサニタイズ（表示名とファイルキーを分離）
        file_metric = sanitize_filename(metric)
        
        # 規定あり版: 規定必須指標かつ規定打席到達版CSVがある場合はそれを使用（min_pa=0）、それ以外はフルCSVでmin_pa=443
        output_path = output_dir / f"{file_metric}.json"
        use_qualifying = (
            metric in METRICS_REQUIRE_QUALIFYING_PA_BY_NAME
            and batting_data_qualifying is not None
        )
        data_for_qual = batting_data_qualifying if use_qualifying else batting_data
        min_pa_for_qual = 0 if use_qualifying else MIN_PA_2025
        
        try:
            success = generate_ranking_for_metric(
                data_for_qual,
                metric,
                str(output_path),
                top_n=100,
                min_pa=min_pa_for_qual,
                metric_map=metric_map  # metric_mapを渡す
            )
            
            if success:
                src_note = "規定到達版CSV" if use_qualifying else f"規定あり: min_pa={MIN_PA_2025}"
                print(f"✅ {metric} → {output_path} ({src_note})")
                success_count += 1
            else:
                print(f"⚠️  {metric} → データ不足のためスキップ（数値で並べられない指標の可能性）")
                failed_metrics.append((metric, "データ不足または数値で並べられない指標"))
        except Exception as e:
            print(f"❌ {metric} → エラー: {e}")
            failed_metrics.append((metric, str(e)))
        
        # 規定なし版（min_pa=0）も出力
        output_path_all = output_dir / f"{file_metric}_all.json"
        
        try:
            success_all = generate_ranking_for_metric(
                batting_data,
                metric,
                str(output_path_all),
                top_n=100,
                min_pa=0,  # 規定なし
                metric_map=metric_map  # metric_mapを渡す
            )
            
            if success_all:
                print(f"   ✅ {metric}_all → {output_path_all} (規定なし)")
            # 規定なし版の失敗はログに出すが、全体の成功カウントには含めない
        except Exception as e:
            print(f"   ⚠️  {metric}_all → エラー: {e}")
    
    # 結果を表示
    print("\n" + "="*60)
    print(f"✅ 生成完了: {success_count}件 / {len(metrics)}件")
    if failed_metrics:
        print(f"\n⚠️  生成に失敗した指標:")
        for metric, reason in failed_metrics:
            print(f"   - {metric}: {reason}")
    
    # バリデーション: 生成されたJSONファイルを検証
    print("\n" + "="*60)
    print("🔍 バリデーション開始...")
    try:
        validate_generated_json_files(output_dir, metrics, metric_map)
        print("✅ バリデーション完了: すべてのJSONファイルが正常です")
    except Exception as e:
        print(f"❌ バリデーションエラー: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    # UIが読む {指標名}.json を正規化（Bグループは _all.json で上書き）
    print("\n" + "="*60)
    print("🔍 UI参照用JSONの正規化開始...")
    try:
        normalize_metric_json_for_ui(output_dir, metrics)
        print("✅ 正規化完了")
    except Exception as e:
        print(f"❌ 正規化エラー: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    # 正規化後のバリデーション（A/Bグループのマッピング検証）
    print("\n" + "="*60)
    print("🔍 正規化後のバリデーション開始...")
    try:
        validate_metric_json_mapping(output_dir, metrics, metric_map, MIN_PA_2025)
        print("✅ 正規化後のバリデーション完了")
    except Exception as e:
        print(f"❌ 正規化後のバリデーションエラー: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == '__main__':
    exit(main())

