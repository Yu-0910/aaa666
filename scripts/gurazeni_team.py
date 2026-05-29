#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""グラゼニ チーム別年俸ページの共通パース・名簿突合"""

from __future__ import annotations

import re
import time
from typing import Any, Dict, List, Optional, Tuple

from bs4 import BeautifulSoup


def fetch_html(url: str, retry: int = 3) -> Optional[str]:
    import requests

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    for attempt in range(retry):
        try:
            if attempt > 0:
                time.sleep(2**attempt)
            r = requests.get(url, headers=headers, timeout=30)
            r.raise_for_status()
            r.encoding = r.apparent_encoding or "utf-8"
            return r.text
        except Exception:
            pass
    return None

# https://www.gurazeni.com/team/ のチームナビ（2026年）
GURAZENI_TEAM_PAGES: List[Tuple[int, str, str]] = [
    (1, "巨人", "読売ジャイアンツ"),
    (2, "中日", "中日ドラゴンズ"),
    (3, "ヤクルト", "東京ヤクルトスワローズ"),
    (4, "広島", "広島東洋カープ"),
    (5, "阪神", "阪神タイガース"),
    (6, "DeNA", "横浜DeNAベイスターズ"),
    (7, "日本ハム", "北海道日本ハムファイターズ"),
    (8, "西武", "埼玉西武ライオンズ"),
    (9, "ソフトバンク", "福岡ソフトバンクホークス"),
    (10, "楽天", "東北楽天ゴールデンイーグルス"),
    (11, "ロッテ", "千葉ロッテマリーンズ"),
    (12, "オリックス", "オリックス・バファローズ"),
]

GURAZENI_TEAM_URL = "https://www.gurazeni.com/team/{team_id}"
GURAZENI_TEAM_YEAR_URL = "https://www.gurazeni.com/team/year:{year}"


_KANJI_VARIANTS = (
    ("髙", "高"),
    ("﨑", "崎"),
    ("梅", "梅"),
    ("廣", "広"),
    ("海", "海"),
    ("朗", "朗"),
    ("濱", "浜"),
    ("國", "国"),
    ("榮", "栄"),
    ("圓", "円"),
    ("亞", "亜"),
    ("邉", "辺"),
    ("實", "実"),
    ("澤", "沢"),
    ("峯", "峰"),
    ("淵", "渕"),
    ("齋", "斎"),
    ("齊", "斉"),
    ("黑", "黒"),
    ("德", "徳"),
    ("惠", "恵"),
    ("禎", "禎"),
    ("祏", "祏"),
)


def normalize_name_key(name: str) -> str:
    # remove whitespace + parenthetical alias: 林家正(ライル・リン) -> 林家正
    s = re.sub(r"\(.*?\)", "", (name or ""))
    s = re.sub(r"[（].*?[）]", "", s)
    s = re.sub(r"[\s\u3000　]+", "", s)
    # 外国人名の中黒は表記ゆれが多いのでキーでは落とす（ケムナ・ブラッド誠 vs ケムナ誠 等）
    s = s.replace("・", "").replace("･", "").replace("·", "")
    for old, new in _KANJI_VARIANTS:
        s = s.replace(old, new)
    return s


def katakana_suffix_key(name: str) -> Optional[str]:
    """
    ブライアン・マタ → マタ
    Ｂ．マタ → マタ（名簿の外国人略称）
    """
    raw = (name or "").strip()
    n = normalize_name_key(raw)
    m = re.match(r"^[Ａ-ＺA-Zａ-ｚ][．.](.+)$", n)
    if m and len(m.group(1)) >= 2:
        return m.group(1)
    for sep in ("・", "･", "·"):
        if sep in raw:
            tail = normalize_name_key(raw.split(sep)[-1])
            if len(tail) >= 2:
                return tail
    return None


def alias_keys_from_parentheses(name: str) -> List[str]:
    """林家正(ライル・リン) -> ['ライル・リン', 'リン']"""
    raw = (name or "").strip()
    out: List[str] = []
    m = re.search(r"\(([^)]+)\)", raw) or re.search(r"（([^）]+)）", raw)
    if not m:
        return out
    inside = m.group(1).strip()
    inside_norm = normalize_name_key(inside)
    if inside_norm and inside_norm not in out:
        out.append(inside_norm)
    # also add suffix from inside (ライル・リン -> リン)
    suf = katakana_suffix_key(inside)
    if suf and suf not in out:
        out.append(suf)
    return out


def name_lookup_keys(name: str) -> List[str]:
    """名簿の略称（Ｂ．マタ）とグラゼニ表記（ブライアン・マタ）の突合用キー"""
    base = normalize_name_key(name)
    keys: List[str] = []
    for k in (base, katakana_suffix_key(name), *alias_keys_from_parentheses(name)):
        if k and k not in keys:
            keys.append(k)
    # ケムナ・ブラッド誠 → ケムナ誠 のように「ミドルネーム + 名」表記がある場合の短縮キー
    raw = (name or "").strip()
    for sep in ("・", "･", "·"):
        if sep in raw:
            first = raw.split(sep, 1)[0].strip()
            last = raw.split(sep)[-1].strip()
            # 末尾の「名（漢字/ひらがな）」だけ拾う（ブラッド誠 → 誠）
            m = re.search(r"([一-龯ぁ-ん]+)$", last)
            if m:
                short = normalize_name_key(first + m.group(1))
                if short and short not in keys:
                    keys.append(short)
            break
    # 砂川 リチャード → リチャード（姓+名の名のみ）
    parts = re.split(r"[\s\u3000　]+", (name or "").strip())
    if len(parts) >= 2:
        last = normalize_name_key(parts[-1])
        if len(last) >= 2 and last not in keys:
            keys.append(last)
    # Jr / ジュニア 対応: 「スチュワート・Jr.」と「スチュワート・ジュニア」を相互に引けるように
    joined = (name or "").strip()
    if "ジュニア" in joined:
        k = normalize_name_key(joined.replace("ジュニア", "Jr."))
        if k and k not in keys:
            keys.append(k)
    if re.search(r"Jr\.?$", joined):
        k = normalize_name_key(re.sub(r"Jr\.?$", "ジュニア", joined))
        if k and k not in keys:
            keys.append(k)
    return keys


def parse_yen_ja(text: str) -> Optional[int]:
    if not text:
        return None
    s = text.strip().replace(",", "").replace("，", "")
    if "円" not in s and not re.search(r"[億万]", s):
        return None
    oku = 0
    rest = s
    if "億" in rest:
        a, rest = rest.split("億", 1)
        m = re.search(r"(\d+)", a)
        if m:
            oku = int(m.group(1))
    if "万" in rest:
        b = rest.split("万", 1)[0]
        m = re.search(r"(\d+)", b)
        if m:
            return oku * 100_000_000 + int(m.group(1)) * 10_000
    if oku:
        return oku * 100_000_000
    m = re.search(r"(\d+)", rest)
    return int(m.group(1)) if m else None


def parse_team_roster_table(html: str, year: int) -> List[Dict[str, Any]]:
    """
    チーム年俸一覧テーブルから選手行を抽出。
    返却: gurazeni_id, name_ja, salary_yen, year
    """
    soup = BeautifulSoup(html, "lxml")
    out: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()

    for table in soup.find_all("table"):
        header = table.find("tr")
        if not header or "年俸" not in header.get_text():
            continue
        for tr in table.find_all("tr")[1:]:
            player_a = tr.find("a", href=re.compile(r"/player/\d+"))
            if not player_a:
                continue
            m = re.search(r"/player/(\d+)", player_a.get("href") or "")
            if not m:
                continue
            gz_id = m.group(1)
            if gz_id in seen_ids:
                continue
            seen_ids.add(gz_id)
            name = re.sub(r"\s+", " ", (player_a.get_text() or "")).strip()
            cells = [c.get_text(strip=True) for c in tr.find_all(["td", "th"])]
            salary_yen = None
            for cell in reversed(cells):
                salary_yen = parse_yen_ja(cell)
                if salary_yen is not None:
                    break
            out.append(
                {
                    "gurazeni_id": gz_id,
                    "name_ja": name,
                    "name_key": normalize_name_key(name),
                    "salary_yen": salary_yen,
                    "year": year,
                }
            )
    return out


def _lookup_key(name_key: str, roster_team: str, *, suffix_only: bool = False) -> str:
    prefix = "@" if suffix_only else ""
    return f"{prefix}{name_key}|{roster_team}"


def build_team_lookup(
    rosters_by_team: Dict[str, List[Dict[str, Any]]],
) -> Dict[str, Dict[str, Any]]:
    """
    キー: {name_key}|{roster_team_full} または @{suffix}|{team}（姓省略用）
    値: gurazeni_id, salary_2026, name_ja (グラゼニ表記)
    """
    lookup: Dict[str, Dict[str, Any]] = {}
    for roster_team, players in rosters_by_team.items():
        for p in players:
            keys = name_lookup_keys(p["name_ja"])
            for i, nk in enumerate(keys):
                # 2番目以降（サフィックス・名のみ）は @ 付きでも登録（略称突合用）
                for suffix_only in (False, True) if i > 0 else (False,):
                    key = _lookup_key(nk, roster_team, suffix_only=suffix_only)
                    if key not in lookup:
                        lookup[key] = p
    return lookup


def resolve_gurazeni_from_team(
    name_ja: str,
    roster_team: str,
    lookup: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    keys = name_lookup_keys(name_ja)
    for nk in keys:
        for suffix_only in (False, True):
            key = _lookup_key(nk, roster_team, suffix_only=suffix_only)
            if key in lookup:
                return lookup[key]
    return None
