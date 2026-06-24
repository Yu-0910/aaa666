#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""平川: 正常値不一致の原因究明。"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from diag_hirakawa_match_official import (  # noqa: E402
    collect_all,
    hirakawa_game_ids,
    sit_key,
)
from diag_hirakawa_official_rule import pick_official  # noqa: E402

YAHOO = "2110164"
CANONICAL = ROOT / "_data" / "scraped_games" / "canonical"
PLAY_LINES = ROOT / "_data" / "diag_hirakawa_play_lines.json"

USER = {
    "none": dict(pa=51, ab=48, h=6, so=19, bb=2, hbp=1, sh=0, sf=0, rbi=0),
    "r1": dict(pa=18, ab=17, h=6, so=3, bb=0, hbp=0, sh=1, sf=0, rbi=0),
    "r12": dict(pa=8, ab=8, h=1, so=3, bb=0, hbp=0, sh=0, sf=0, rbi=2),
    "r13": dict(pa=1, ab=1, h=1, so=0, bb=0, hbp=0, sh=0, sf=0, rbi=2),
    "r2": dict(pa=8, ab=8, h=1, so=4, bb=0, hbp=0, sh=0, sf=0, rbi=1),
    "r23": dict(pa=2, ab=1, h=0, so=1, bb=1, hbp=0, sh=0, sf=0, rbi=0),
    "r3": dict(pa=3, ab=3, h=1, so=0, bb=0, hbp=0, sh=0, sf=0, rbi=2),
    "loaded": dict(pa=3, ab=2, h=1, so=0, bb=1, hbp=0, sh=0, sf=0, rbi=3),
}
KEYS = list(USER)
FIELDS = ["pa", "ab", "h", "so", "bb", "hbp", "sh"]

AB_EXCL = re.compile(r"四球|敬遠|申告|死球|犠打|犠飛|妨害|打撃妨害|走塁妨害|押出")
SO = re.compile(r"三振")
WALK = re.compile(r"四球|敬遠|申告")
HIT = re.compile(
    r"安|ヒット|本塁|ホームラン|左[２2]|中[２2]|右[２2]|左安|中安|右安|二塁打|三塁打|本塁打"
)


def stat_from_result(r: str) -> dict:
    r = (r or "").strip()
    o = {f: 0 for f in FIELDS}
    o["pa"] = 1
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


def dist(a: dict) -> int:
    return sum(abs(a[k][f] - USER[k][f]) for k in KEYS for f in FIELDS)


def agg(method_fn, result_fn):
    a = {k: {f: 0 for f in FIELDS} for k in KEYS}
    per_pa = collect_all()
    for pa_id, row in per_pa.items():
        sit = method_fn(row)
        if sit not in a:
            continue
        s = stat_from_result(result_fn(pa_id, row))
        for f in FIELDS:
            a[sit][f] += s[f]
    return a, per_pa


def load_appearance_result(pa_id: str) -> str:
    gid, _, _, _ = pa_id.split("-", 3)
    doc = json.loads((CANONICAL / f"{gid}.json").read_text(encoding="utf-8"))
    pas = doc.get("domain", {}).get("plateAppearances") or []
    pa = next((p for p in pas if p.get("paId") == pa_id), None)
    if not pa:
        return ""
    slots = pa.get("appearanceResultSlots") or []
    for s in slots:
        t = (s.get("resultTextJa") or s.get("resultJa") or "").strip()
        if t:
            return t
    return (pa.get("resultSummaryJa") or "").strip()


def main() -> None:
    print("=== 1. 通算の正（出場成績 battingLines） vs 打席結果 ===\n")
    bl_ab = bl_h = bl_so = bl_bb = bl_hbp = bl_sh = 0
    bl_g = 0
    for gid in hirakawa_game_ids({}):
        doc = json.loads((CANONICAL / f"{gid}.json").read_text(encoding="utf-8"))
        for line in doc.get("domain", {}).get("battingLines") or []:
            if str(line.get("yahooPlayerId") or "").strip() != YAHOO:
                continue
            bl_g += 1
            bl_ab += line.get("ab") or 0
            bl_h += line.get("h") or line.get("hits") or 0
            bl_so += line.get("so") or line.get("k") or 0
            bl_bb += line.get("bb") or 0
            bl_hbp += line.get("hbp") or 0
            bl_sh += line.get("sh") or 0

    per_pa = collect_all()
    rs = [stat_from_result(r.get("result")) for r in per_pa.values()]
    ap = [stat_from_result(load_appearance_result(pa_id)) for pa_id in per_pa]

    def tot(xs):
        return {f: sum(x[f] for x in xs) for f in FIELDS}

    t_rs, t_ap = tot(rs), tot(ap)
    print(f"player page (正):     PA 94 AB 88 H 17 SO 30 BB 4")
    print(f"battingLines 合算:    AB {bl_ab} H {bl_h} SO {bl_so} BB {bl_bb} HBP {bl_hbp} SH {bl_sh} (出場行 {bl_g})")
    print(
        f"resultSummaryJa:      PA {t_rs['pa']} AB {t_rs['ab']} H {t_rs['h']} "
        f"SO {t_rs['so']} BB {t_rs['bb']} HBP {t_rs['hbp']} SH {t_rs['sh']}"
    )
    print(
        f"appearance slots:     PA {t_ap['pa']} AB {t_ap['ab']} H {t_ap['h']} "
        f"SO {t_ap['so']} BB {t_ap['bb']} HBP {t_ap['hbp']} SH {t_ap['sh']}"
    )

    print("\n--- resultSummaryJa vs appearance で食い違う打席 ---")
    for pa_id, row in sorted(per_pa.items()):
        a = stat_from_result(load_appearance_result(pa_id))
        s = stat_from_result(row.get("result"))
        if a != s:
            print(f"  {pa_id}")
            print(f"    summary: {row.get('result')}")
            print(f"    appear : {load_appearance_result(pa_id)}")
            print(f"    stat diff summary={s} appear={a}")

    print("\n=== 2. 塁状況ソース別 × 成績ソース別 ===\n")
    base_methods = {
        "text": lambda r: r.get("text"),
        "first": lambda r: r.get("first"),
        "last": lambda r: r.get("last"),
        "chain": lambda r: r.get("chain"),
        "pick_official": pick_official,
    }
    result_methods = {
        "resultSummaryJa": lambda _id, row: row.get("result") or "",
        "appearance_slot": lambda pa_id, _row: load_appearance_result(pa_id),
    }

    combos = []
    for bn, bf in base_methods.items():
        for rn, rf in result_methods.items():
            a, _ = agg(bf, rf)
            combos.append((dist(a), bn, rn, a))
    combos.sort(key=lambda x: x[0])
    for d, bn, rn, a in combos[:8]:
        print(f"{bn:14} × {rn:16} dist={d}")
    best_d, best_b, best_r, best_a = combos[0]
    print(f"\n最小 dist={best_d} ({best_b} × {best_r})")
    if best_d:
        print("行別差分 (got - user):")
        for k in KEYS:
            diffs = []
            for f in FIELDS:
                d = best_a[k][f] - USER[k][f]
                if d:
                    diffs.append(f"{f}{d:+d}")
            if diffs:
                print(f"  {k:7} " + " ".join(diffs))

    print("\n=== 3. データ欠損（Phase15 が集計から落とす要因）===\n")
    play_lines = json.loads(PLAY_LINES.read_text(encoding="utf-8")) if PLAY_LINES.is_file() else {}
    no_line = no_text_token = no_base_before = 0
    samples = []
    for gid in hirakawa_game_ids(play_lines):
        doc = json.loads((CANONICAL / f"{gid}.json").read_text(encoding="utf-8"))
        for pa in doc.get("domain", {}).get("plateAppearances") or []:
            if str(pa.get("yahooBatterId") or "").strip() != YAHOO:
                continue
            pa_id = pa.get("paId")
            line = play_lines.get(pa_id, "")
            bb = pa.get("baseBefore")
            if not line.strip():
                no_line += 1
                if len(samples) < 5:
                    samples.append((pa_id, "no_play_line", pa.get("resultSummaryJa", "")[:40]))
            elif not re.match(r"^\d+[：:]\s*\d+番", line.strip()):
                no_text_token += 1
            if bb is None:
                no_base_before += 1
    print(f"平川打席 {len(per_pa)}")
    print(f"  実況行なし: {no_line}")
    print(f"  baseBefore 未設定: {no_base_before}")
    if samples:
        print("  例:", samples[0])

    print("\n=== 4. 打席中走者変動（text≠last）===\n")
    diff_rows = []
    for pa_id, row in sorted(per_pa.items()):
        t, l = row.get("text"), row.get("last")
        if t and l and t != l:
            diff_rows.append((pa_id, t, l, row.get("result", "")[:50]))
    print(f"text≠last: {len(diff_rows)} 打席")
    by_pattern = Counter((t, l) for _, t, l, _ in diff_rows)
    for (t, l), n in by_pattern.most_common(5):
        print(f"  {t} → {l}: {n}打席")

    print("\n=== 5. 正常値行合計 vs 通算 ===\n")
    u_pa = sum(USER[k]["pa"] for k in KEYS)
    u_ab = sum(USER[k]["ab"] for k in KEYS)
    u_h = sum(USER[k]["h"] for k in KEYS)
    print(f"正常値 行合計: PA {u_pa} AB {u_ab} H {u_h}")
    print(f"個人ページ:   PA 94 AB 88 H 17")
    print("→ 正常値の行合計は通算と一致（塁分類の問題であり、打席数自体の欠落ではない）")


def diff_basebefore_vs_text() -> None:
    print("\n=== 6. baseBefore（Phase15）≠ 実況 text の打席 ===\n")
    play_lines = json.loads(PLAY_LINES.read_text(encoding="utf-8")) if PLAY_LINES.is_file() else {}
    per_pa = collect_all()
    n = 0
    for pa_id, row in sorted(per_pa.items()):
        gid = pa_id.split("-")[0]
        doc = json.loads((CANONICAL / f"{gid}.json").read_text(encoding="utf-8"))
        pa = next(p for p in doc["domain"]["plateAppearances"] if p["paId"] == pa_id)
        text_sit = row.get("text")
        bb = pa.get("baseBefore")
        if bb is None:
            continue
        r1 = bool(bb.get("r1"))
        r2 = bool(bb.get("r2"))
        r3 = bool(bb.get("r3"))
        phase15_sit = sit_key((int(r1), int(r2), int(r3)))
        if text_sit and phase15_sit != text_sit:
            n += 1
            print(f"  {pa_id} text={text_sit} baseBefore={phase15_sit} first={row.get('first')}")
            print(f"    {play_lines.get(pa_id, '')[:100]}")
    print(f"計 {n} 打席")


if __name__ == "__main__":
    main()
    diff_basebefore_vs_text()
