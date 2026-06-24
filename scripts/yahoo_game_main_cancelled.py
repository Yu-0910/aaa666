"""試合トップ HTML の中止判定（lib/yahooGame/sportsnaviStatsTextParse.mjs と同義）。"""

from __future__ import annotations

import re

_BB_HEAD01_TITLE_RE = re.compile(
    r"<h2[^>]*\bbb-head01__title\b[^>]*>([\s\S]*?)</h2>",
    re.IGNORECASE,
)
_HEAD_CANCELLED_RE = re.compile(r"試合中止|ノーゲーム|コールドゲーム|コールド|試合は中止")
_BB_SPLITS_NOGAME_RE = re.compile(r"bb-splitsTable__nogame", re.IGNORECASE)
_BB_GAME_CARD_STATE_RE = re.compile(
    r'class="bb-gameCard__state"[\s\S]{0,160}(試合中止|ノーゲーム)',
    re.IGNORECASE,
)


def _head_plain(html: str) -> str:
    m = _BB_HEAD01_TITLE_RE.search(html)
    if not m:
        return ""
    return re.sub(r"<[^>]+>", "", m.group(1)).strip()


def main_html_cancelled(html: str | None, game_id: str = "") -> bool:
    if not html:
        return False

    head_plain = _head_plain(html)
    if head_plain and _HEAD_CANCELLED_RE.search(head_plain):
        return True

    if _BB_SPLITS_NOGAME_RE.search(html):
        return True

    if _BB_GAME_CARD_STATE_RE.search(html):
        return True

    gid = str(game_id or "").strip()
    if gid:
        if re.search(r'class="bb-scoreList__state">\s*(試合中止|ノーゲーム)\s*<', html, re.I):
            return True
        if re.search(
            rf'class="bb-scoreList__state"[^>]*href="/npb/game/{re.escape(gid)}/index"[^>]*>[\s\S]*?(試合中止|ノーゲーム)',
            html,
            re.I,
        ):
            return True
        other_only = bool(
            re.search(
                rf'class="bb-scoreList__state"[^>]*href="/npb/game/(?!{re.escape(gid)})\d+/index"[^>]*>\s*(試合中止|ノーゲーム)',
                html,
                re.I,
            )
        ) and not _BB_SPLITS_NOGAME_RE.search(html) and not (
            head_plain and _HEAD_CANCELLED_RE.search(head_plain)
        )
        if other_only:
            return False

    return False
