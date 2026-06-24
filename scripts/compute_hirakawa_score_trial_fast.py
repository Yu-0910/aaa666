#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""平川: score 塁定義試算（平川出場試合のみ・高速）。"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from diag_hirakawa_match_official import (  # noqa: E402
    collect_all,
    hirakawa_game_ids,
    load_snap,
    parse_pa_id,
    score_prefix,
    sit_key,
    SIT_TO_T,
    is_risp_t,
    bases_from_class,
    bases_parse,
    build_chain_start_for_half,
    extract_token,
    token_bases,
)

CAN = ROOT / "_data/scraped_games/canonical"
PLAY = ROOT / "_data/diag_hirakawa_play_lines.json"

REF = {
    "none": dict(pa=51, ab=48, h=6, so=19, bb=2, hbp=1, sh=0),
    "r1": dict(pa=18, ab=17, h=6, so=3, bb=0, hbp=0, sh=1),
    "r2": dict(pa=8, ab=8, h=1, so=4, bb=0, hbp=0, sh=0),
    "r3": dict(pa=3, ab=3, h=1, so=0, bb=0, hbp=0, sh=0),
    "r12": dict(pa=8, ab=8, h=1, so=3, bb=0, hbp=0, sh=0),
    "r13": dict(pa=1, ab=1, h=1, so=0, bb=0, hbp=0, sh=0),
    "r23": dict(pa=2, ab=1, h=0, so=1, bb=1, hbp=0, sh=0),
    "loaded": dict(pa=3, ab=2, h=1, so=0, bb=1, hbp=0, sh=0),
}
KEYS = list(REF)
LABEL = {
    "none": "無し",
    "r1": "1塁",
    "r2": "2塁",
    "r3": "3塁",
    "r12": "1・2塁",
    "r13": "1・3塁",
    "r23": "2・3塁",
    "loaded": "満塁",
}

AB_EXCL = re.compile(r"四球|敬遠|申告|死球|犠打|犠飛|妨害|打撃妨害|走塁妨害|押出")
SO = re.compile(r"三振")
WALK = re.compile(r"四球|敬遠|申告")
HIT = re.compile(
    r"安|ヒット|本塁|ホームラン|左[２2]|中[２2]|右[２2]|左安|中安|右安|二塁打|三塁打|本塁打"
)


def strip_brackets(r: str) -> str:
    return re.sub(r"\[[^\]]*\]", "", r or "")


def stat(result: str) -> dict:
    r = strip_brackets((result or "").strip())
    o = dict(pa=1, ab=0, h=0, so=0, bb=0, hbp=0, sh=0)
    if WALK.search(r):
        o["bb"] = 1
    if SO.search(r):
        o["so"] = 1
    if "死球" in r:
        o["hbp"] = 1
    if re.search(r"犠打|送り", r):
        o["sh"] = 1
    if not AB_EXCL.search(r):
        o["ab"] = 1
        if HIT.search(r):
            o["h"] = 1
    return o


def bases_from_pa_field(bb) -> str | None:
    if bb is None:
        return None
    r1 = bool(bb.get("r1"))
    r2 = bool(bb.get("r2"))
    r3 = bool(bb.get("r3"))
    return sit_key((int(r1), int(r2), int(r3)))


def load_context():
    play = json.loads(PLAY.read_text(encoding="utf-8")) if PLAY.is_file() else {}
    per_pa = collect_all()
    # chain per pa from collect_all already has chain key
    return play, per_pa


def pick_modes(row: dict, pa, play_line: str) -> dict[str, str | None]:
    tok = extract_token(play_line or "")
    tb = token_bases(tok) if tok else None
    text_sit = sit_key(tb) if tb else None
    bb = pa.get("baseBefore")
    phase15 = bases_from_pa_field(bb)
    if phase15 is None:
        phase15 = text_sit
    return {
        "phase15_text": phase15,
        "score_first": row.get("first"),
        "score_first_em": row.get("first_em"),
        "score_chain": row.get("chain"),
        "text_token": text_sit,
        "text_or_first": text_sit or row.get("first"),
        "text_then_first": text_sit if text_sit else row.get("first"),
    }


def aggregate(mode: str, per_pa: dict, play: dict) -> tuple[dict, int, int]:
    agg = {k: {x: 0 for x in ["pa", "ab", "h", "so", "bb", "hbp", "sh"]} for k in KEYS}
    no_bases = no_result = 0
    for pa_id, row in per_pa.items():
        gid = pa_id.split("-")[0]
        doc = json.loads((CAN / f"{gid}.json").read_text(encoding="utf-8"))
        pa = next(p for p in doc["domain"]["plateAppearances"] if p["paId"] == pa_id)
        result = (row.get("result") or "").strip()
        if not result:
            no_result += 1
            continue
        sit = pick_modes(row, pa, play.get(pa_id, "")).get(mode)
        if not sit or sit not in agg:
            no_bases += 1
            continue
        s = stat(result)
        for f in s:
            agg[sit][f] += s[f]
    return agg, no_bases, no_result


def l1(agg: dict) -> int:
    return sum(
        abs(agg[k]["pa"] - REF[k]["pa"])
        + abs(agg[k]["ab"] - REF[k]["ab"])
        + abs(agg[k]["h"] - REF[k]["h"])
        for k in KEYS
    )


def main():
    play, per_pa = load_context()
    modes = [
        "phase15_text",
        "score_first",
        "score_first_em",
        "score_chain",
        "text_token",
        "text_or_first",
        "text_then_first",
    ]
    print("平川蓮 — score 試算 vs 正常値（平川試合のみ・結果=resultSummaryJa+括弧除去）\n")
    rows = []
    for m in modes:
        agg, nb, nr = aggregate(m, per_pa, play)
        rows.append((l1(agg), m, agg, nb, nr))
    rows.sort(key=lambda x: x[0])

    print("mode                  L1   noBases  PA合計")
    for d, m, agg, nb, nr in rows:
        pa_sum = sum(agg[k]["pa"] for k in KEYS)
        print(f"{m:22} {d:4} {nb:8} {pa_sum:7}")

    d, best, agg, nb, nr = rows[0]
    print(f"\n=== 最良: {best} (L1={d}) ===\n")
    print("条件   | PA ref  got  | AB ref  got  | H ref got | SO ref got")
    for k in KEYS:
        a, r = agg[k], REF[k]
        print(
            f"{LABEL[k]:6} | {r['pa']:3} {a['pa']:3} | {r['ab']:3} {a['ab']:3} | "
            f"{r['h']:2} {a['h']:2} | {r['so']:2} {a['so']:2}"
        )

    _, p15n, p15, _, _ = next(x for x in rows if x[1] == "phase15_text")
    print(f"\n=== 現行 Phase15 相当 (phase15_text) L1={l1(p15)} ===")
    for k in KEYS:
        if p15[k]["pa"] != REF[k]["pa"] or p15[k]["ab"] != REF[k]["ab"]:
            print(f"  {LABEL[k]}: PA {p15[k]['pa']}→{REF[k]['pa']}  AB {p15[k]['ab']}→{REF[k]['ab']}")


if __name__ == "__main__":
    main()
