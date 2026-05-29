# -*- coding: utf-8 -*-
"""一球速報: 走者アウトでイニング終了・打者打席結果なしパターンの判定（Python 側）。"""

from __future__ import annotations

import re

from pa_id_format import parse_pa_id

PHASE10_MISSING_RUNNER_OUT_NO_AB = "runner_out_ends_half_no_ab"


def is_runner_out_ends_half_no_ab(summary: str) -> bool:
    """
    実況要約から、二死走者ありのうち走者アウトで3アウト・打者結果なしと判断できるか。
    打席結果あり（安打・HR 等）の no_pitch_rows とは区別する（例: 2021038681 外崎 4回表6番）。
    """
    s = (summary or "").replace(" ", "")
    if not s:
        return False
    if re.search(
        r"ホームラン|本塁打|ランホームラン|[23]ラン|安打|単打|二塁打|三塁打|三振|ゴロ|飛|凡打|犠打|犠飛|四球|死球|申告敬遠",
        s,
    ):
        return False
    if "3アウト" not in s and "３アウト" not in s:
        return False
    if "二死" not in s and "2死" not in s:
        return False
    if (
        "盗塁失敗" in s
        or "タッチアウト" in s
        or "盗塁を試みるもアウト" in s
        or "誘い出され盗塁失敗" in s
        or ("けん制" in s and "盗塁" in s)
    ):
        return True
    return False


def _norm_play_line(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


def _batter_result_in_play_text(text: str) -> bool:
    s = _norm_play_line(text)
    return bool(
        re.search(
            r"ホームラン|本塁打|ランホームラン|[23]ラン|安打|単打|二塁打|三塁打|三振|ゴロ|飛|凡打|犠打|犠飛|四球|死球|申告敬遠",
            s,
        )
    )


def play_lines_for_pa_from_canonical(
    doc: dict, inning: str, top_bottom: str, pa_seq_in_half: str, yahoo_batter_id: str | None = None
) -> list[str]:
    heading = f"{int(inning)}回{top_bottom}"
    seq = int(pa_seq_in_half)
    roster = doc.get("game", {}).get("yahooPlayersMentioned") or {}
    batter_name = _norm_play_line(roster.get(yahoo_batter_id or "") or "")
    out: list[str] = []
    seen: set[str] = set()

    def push(s: str) -> None:
        if not s or s in seen:
            return
        seen.add(s)
        out.append(s)

    for sec in doc.get("game", {}).get("textPlayByPlay") or []:
        if sec.get("sectionTitle") != heading:
            continue
        for line in sec.get("lines") or []:
            s = str(line)
            norm = _norm_play_line(s)
            if batter_name and batter_name in norm:
                push(s)
            m = re.match(r"^(\d+)[：:]", s)
            if m and int(m.group(1)) == seq:
                push(s)
    return out


def play_text_for_pa_from_canonical(
    doc: dict, inning: str, top_bottom: str, pa_seq_in_half: str, yahoo_batter_id: str | None = None
) -> str:
    heading = f"{int(inning)}回{top_bottom}"
    seq = int(pa_seq_in_half)
    roster = doc.get("game", {}).get("yahooPlayersMentioned") or {}
    batter_name = _norm_play_line(roster.get(yahoo_batter_id or "") or "")
    by_prefix = ""
    for sec in doc.get("game", {}).get("textPlayByPlay") or []:
        if sec.get("sectionTitle") != heading:
            continue
        for line in sec.get("lines") or []:
            s = str(line)
            if batter_name and batter_name in _norm_play_line(s):
                return s
            m = re.match(r"^(\d+)[：:]", s)
            if m and int(m.group(1)) == seq and not by_prefix:
                by_prefix = s
    return by_prefix


def is_expected_no_pitch_events_pa(doc: dict, pa: dict, phase10_reason: str | None = None) -> bool:
    if phase10_reason and PHASE10_MISSING_RUNNER_OUT_NO_AB in phase10_reason:
        return True
    parsed = parse_pa_id(str(pa.get("paId") or ""))
    if not parsed:
        return False
    lines = play_lines_for_pa_from_canonical(
        doc, str(parsed.inning), parsed.half, str(parsed.pa_seq_in_half), pa.get("yahooBatterId")
    )
    if any(_batter_result_in_play_text(l) for l in lines):
        return False
    if any(is_runner_out_ends_half_no_ab(l) for l in lines):
        return True
    summary = str(pa.get("resultSummaryJa") or "")
    if summary and _batter_result_in_play_text(summary):
        return False
    return is_runner_out_ends_half_no_ab(summary)
