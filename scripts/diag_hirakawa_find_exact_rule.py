#!/usr/bin/env python3
"""平川: 公式PA/AB/Hに完全一致する塁定義を探索。"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT / "scripts"))
from diag_hirakawa_match_official import (  # noqa: E402
    REF_PA,
    collect_all,
    is_risp_t,
    sit_key,
    SIT_TO_T,
)

REF = {
    "none": {"pa": 47, "ab": 44, "h": 6, "so": 19, "bb": 2, "hbp": 1},
    "r1": {"pa": 15, "ab": 14, "h": 4, "so": 2},
    "r2": {"pa": 8, "ab": 8, "h": 1, "so": 4},
    "r3": {"pa": 2, "ab": 2, "h": 1},
    "r12": {"pa": 7, "ab": 7, "h": 1, "so": 3},
    "r13": {"pa": 1, "ab": 1, "h": 1},
    "r23": {"pa": 2, "ab": 1, "h": 0, "so": 1, "bb": 1},
    "loaded": {"pa": 3, "ab": 2, "h": 1, "so": 0, "bb": 1},
    "risp": {"pa": 23, "ab": 21, "h": 5, "so": 8, "bb": 2},
}

WALK = re.compile(r"四球|敬遠|申告")
SO = re.compile(r"三振")
HIT = re.compile(r"安|ヒット|ヒット|２|３|本塁打|ホームラン|左|中|右|二|三|一|投|捕|遊|三|一|内|外|走")
AB_EXCL = re.compile(r"四球|敬遠|申告|死球|犠打|犠飛|妨害|打撃妨害|走塁妨害|押出")


def stat_from_result(r: str) -> dict:
    r = (r or "").strip()
    ab = h = bb = so = hbp = 0
    if WALK.search(r):
        bb = 1
    if SO.search(r):
        so = 1
    if "死球" in r:
        hbp = 1
    if not AB_EXCL.search(r):
        ab = 1
        if re.search(r"安|ヒット|本塁|ホームラン|左[２2]|中[２2]|右[２2]|左安|中安|右安|二塁打|三塁打|本塁打", r):
            h = 1
    return {"ab": ab, "h": h, "bb": bb, "so": so, "hbp": hbp, "pa": 1}


def agg_pa(assign: dict[str, str]) -> dict[str, int]:
    out = {k: 0 for k in REF}
    for sit in assign.values():
        out[sit] += 1
    out["risp"] = sum(1 for s in assign.values() if is_risp_t(SIT_TO_T[s]))
    return out


def dist_pa(agg: dict[str, int]) -> int:
    return sum(abs(agg.get(k, 0) - REF[k]["pa"]) for k in REF)


def agg_full(assign: dict[str, str], results: dict[str, str]) -> dict:
    out = {k: {"pa": 0, "ab": 0, "h": 0, "so": 0, "bb": 0, "hbp": 0} for k in REF}
    for pa_id, sit in assign.items():
        out[sit]["pa"] += 1
        st = stat_from_result(results[pa_id])
        for k in ("ab", "h", "so", "bb", "hbp"):
            out[sit][k] += st[k]
        if is_risp_t(SIT_TO_T[sit]):
            out["risp"]["pa"] += 1
            for k in ("ab", "h", "so", "bb", "hbp"):
                out["risp"][k] += st[k]
    return out


def dist_full(agg: dict) -> int:
    d = 0
    for sit, want in REF.items():
        for k, v in want.items():
            d += abs(agg[sit].get(k, 0) - v)
    return d


def search():
    per_pa = collect_all()
    results = {p: "" for p in per_pa}
    for gid in {p.split("-")[0] for p in per_pa}:
        doc = json.loads((ROOT / "_data/scraped_games/canonical" / f"{gid}.json").read_text(encoding="utf-8"))
        for pa in doc.get("domain", {}).get("plateAppearances") or []:
            pid = pa.get("paId")
            if pid in per_pa:
                results[pid] = pa.get("resultSummaryJa") or ""

    choices: dict[str, list[str]] = {}
    fixed: dict[str, str] = {}
    for pa_id, row in per_pa.items():
        opts = []
        for k in ("text", "chain", "first", "last"):
            if row.get(k):
                opts.append(row[k])
        opts = list(dict.fromkeys(opts))
        if len(opts) == 1:
            fixed[pa_id] = opts[0]
        else:
            choices[pa_id] = opts

    print(f"固定 {len(fixed)} / 分岐 {len(choices)}")

    best = None
    best_d = 10**9
    keys = list(choices.keys())

    def rec(i: int, cur: dict[str, str]):
        nonlocal best, best_d
        if i == len(keys):
            full = {**fixed, **cur}
            pa = agg_pa(full)
            d = dist_pa(pa)
            if d < best_d:
                best_d = d
                best = (dict(full), pa, agg_full(full, results))
            return d == 0
        pa_id = keys[i]
        for sit in choices[pa_id]:
            cur[pa_id] = sit
            if rec(i + 1, cur):
                return True
        return False

    if rec(0, {}):
        print("完全一致!")
    else:
        print(f"最小距離 d={best_d}")
    if best:
        assign, pa_agg, full_agg = best
        print("\nPA: " + " | ".join(f"{k}={pa_agg[k]}" for k in REF))
        print("REF: " + " | ".join(f"{k}={REF[k]['pa']}" for k in REF))
        print(f"full stat dist={dist_full(full_agg)}")
        # 採用ソース
        src_count = {"text": 0, "chain": 0, "first": 0, "last": 0}
        for pa_id, sit in assign.items():
            row = per_pa[pa_id]
            for k in ("text", "chain", "first", "last"):
                if row.get(k) == sit:
                    src_count[k] += 1
                    break
        print("ソース内訳:", src_count)
        with open(ROOT / "_data/diag_hirakawa_best_assign.json", "w", encoding="utf-8") as f:
            json.dump(assign, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    search()
