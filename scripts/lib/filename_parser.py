"""
ファイル名パース関数（batting / pitching CSV用）

batting — 3つのファイル名パターンに対応：
1) batting_YYYY_PL_from_master.csv / batting_YYYY_CL_from_master.csv / batting_YYYY_PRE_from_master.csv
2) batting_1936_spring_PRE.csv / batting_1936_fall_PRE.csv（生CSV）
3) batting_YYYY_PRE_spring_from_master.csv / batting_YYYY_PRE_fall_from_master.csv（計算済み）

pitching（v1）— CL/PL の from_master のみ：
  pitching_YYYY_(CL|PL)_from_master.csv
"""
import re
from typing import Optional, Dict, Any


def parse_batting_filename(filename: str) -> Optional[Dict[str, Any]]:
    """
    batting CSVファイル名をパース
    
    @param filename: ファイル名
    @returns: パース結果の辞書、またはNone（パース失敗時）
    
    返却値の構造:
    {
        "year": int,                    # 年度（例: 1936, 2025）
        "league": str,                  # リーグ（"PL"|"CL"|"PRE"）
        "season_tag": Optional[str],    # シーズンタグ（"spring"|"fall"|None）
        "league_key": str,              # 出力用リーグキー（"PL"|"CL"|"PRE"|"PRE_spring"|"PRE_fall"）
    }
    """
    # パターン1: 通常（from_master）
    # batting_YYYY_(PL|CL|PRE)_from_master.csv
    pattern1 = r'^batting_(\d{4})_(PL|CL|PRE)_from_master\.csv$'
    match1 = re.match(pattern1, filename)
    if match1:
        year = int(match1.group(1))
        league = match1.group(2)
        return {
            "year": year,
            "league": league,
            "season_tag": None,
            "league_key": league
        }
    
    # パターン2: 戦前春秋シーズン（生CSV）
    # batting_YYYY_(spring|fall)_PRE.csv
    pattern2 = r'^batting_(\d{4})_(spring|fall)_PRE\.csv$'
    match2 = re.match(pattern2, filename)
    if match2:
        year = int(match2.group(1))
        season_tag = match2.group(2)  # "spring" or "fall"
        league = "PRE"
        league_key = f"PRE_{season_tag}"
        return {
            "year": year,
            "league": league,
            "season_tag": season_tag,
            "league_key": league_key
        }
    
    # パターン3: 戦前春秋シーズン（計算済み）
    # batting_YYYY_PRE_spring_from_master.csv / batting_YYYY_PRE_fall_from_master.csv
    pattern3 = r'^batting_(\d{4})_PRE_(spring|fall)_from_master\.csv$'
    match3 = re.match(pattern3, filename)
    if match3:
        year = int(match3.group(1))
        season_tag = match3.group(2)  # "spring" or "fall"
        league = "PRE"
        league_key = f"PRE_{season_tag}"
        return {
            "year": year,
            "league": league,
            "season_tag": season_tag,
            "league_key": league_key
        }
    
    # パターンに一致しない場合はエラー
    return None


def build_calculated_filename(parsed: Dict[str, Any]) -> str:
    """
    パース結果から計算済みCSVのファイル名を生成
    
    @param parsed: parse_batting_filename()の結果
    @returns: 計算済みCSVのファイル名
    
    例:
    - 入力: batting_2025_PL_from_master.csv
      出力: batting_2025_PL_from_master.csv（そのまま）
    
    - 入力: batting_1936_spring_PRE.csv
      出力: batting_1936_PRE_spring_from_master.csv
    """
    year = parsed["year"]
    league_key = parsed["league_key"]
    
    if parsed.get("season_tag"):
        # 戦前春秋シーズン: league_key を使って "from_master" 形式に統一
        return f"batting_{year}_{league_key}_from_master.csv"
    else:
        # 通常: 既存命名はそのまま
        return f"batting_{year}_{parsed['league']}_from_master.csv"


def build_rankings_output_path(year: int, league_key: str) -> str:
    """
    打撃ランキングJSONの出力パス（相対パス）を生成
    
    @param year: 年度
    @param league_key: リーグキー（"PL"|"CL"|"PRE"|"PRE_spring"|"PRE_fall"）
    @returns: 出力パス（例: "1936/PRE_spring"）
    """
    return f"{year}/{league_key}"


def parse_pitching_filename(filename: str) -> Optional[Dict[str, Any]]:
    """
    pitching CSVファイル名をパース（v1: CL/PL の from_master のみ）

    @returns: {
        "year": int,
        "league": str,           # "CL" | "PL"
        "season_tag": None,
        "league_key": str,       # "CL" | "PL"
    }
    """
    pattern = r'^pitching_(\d{4})_(CL|PL)_from_master\.csv$'
    match = re.match(pattern, filename)
    if not match:
        return None
    year = int(match.group(1))
    league = match.group(2)
    return {
        "year": year,
        "league": league,
        "season_tag": None,
        "league_key": league,
    }


def build_pitching_rankings_output_path(year: int, league_key: str) -> str:
    """
    投手ランキングJSONの出力パス（相対パス）を生成

    @returns: 例 "pitching/1958/CL"
    """
    return f"pitching/{year}/{league_key}"


















