"""選手名・球団の突合用キー生成（通算マスタ結合・player_id 補完で共用）"""

from __future__ import annotations

import re
from typing import List

# NPB / Yahoo / スクレイプ間の表記ゆれ（空白除去後に適用）
_KANJI_VARIANTS = str.maketrans(
    {
        "淺": "浅",
        "國": "国",
        "齋": "斎",
        "邊": "辺",
        "澤": "沢",
        "廣": "広",
        "實": "実",
        "學": "学",
        "髙": "高",
        "﨑": "崎",
    }
)


def kanji_normalize(s: str) -> str:
    return (s or "").translate(_KANJI_VARIANTS)


def normalize_name_key(name: str, team: str = "") -> str:
    n = kanji_normalize(re.sub(r"[\s\u3000]+", "", name or ""))
    t = re.sub(r"[\s\u3000]+", "", team or "")
    return f"{n}|{t}" if t else n


def name_keys_for_matching(name: str) -> List[str]:
    raw = (name or "").strip()
    if not raw:
        return []
    base = kanji_normalize(re.sub(r"[\s\u3000]+", "", raw))
    keys: List[str] = []
    for k in (base,):
        if k and k not in keys:
            keys.append(k)
    m = re.match(r"^[Ａ-ＺA-Z][．.](.+)$", base)
    if m:
        k = m.group(1)
        if k and k not in keys:
            keys.append(k)
    if "・" in base:
        k = base.split("・")[-1]
        if k and k not in keys:
            keys.append(k)
    return keys


def normalize_name_team_keys(name: str, team: str) -> List[str]:
    t = re.sub(r"[\s\u3000]+", "", team or "")
    out: List[str] = []
    for nk in name_keys_for_matching(name):
        key = f"{nk}|{t}" if t else nk
        if key and key not in out:
            out.append(key)
    return out
