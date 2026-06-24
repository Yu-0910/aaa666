#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""佐藤輝明: 実況行なし打席の paId diff とハイブリッド試算（平川と同型）。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from compute_hirakawa_no_line_hybrid import (  # noqa: E402
    KEYS,
    LABEL,
    REF as HIRAKAWA_REF,
    agg_hybrid,
    hybrid_sit,
    load_rows as _unused,
    print_diff_table,
    score_hybrid_sit,
    stat,
    text_sit,
)
from diag_batter_collect import collect_batter_pa  # noqa: E402

YAHOO = "2000051"
PLAY = ROOT / "_data/diag_sato_play_lines.json"

REF = {
    "none": dict(pa=123, ab=113),
    "r1": dict(pa=48, ab=43),
    "r2": dict(pa=20, ab=12),
    "r3": dict(pa=8, ab=7),
    "r12": dict(pa=14, ab=11),
    "r13": dict(pa=4, ab=3),
    "r23": dict(pa=3, ab=3),
    "loaded": dict(pa=5, ab=4),
}


def l1_pa_ab(agg: dict[str, list[int]]) -> int:
    return sum(abs(agg[k][0] - REF[k]["pa"]) + abs(agg[k][1] - REF[k]["ab"]) for k in KEYS)


def load_sato() -> tuple[dict, dict, list[dict]]:
    play = json.loads(PLAY.read_text(encoding="utf-8"))
    per_pa = collect_batter_pa(YAHOO)
    no_line: list[dict] = []
    for pa_id, row in sorted(per_pa.items()):
        line = play.get(pa_id, "")
        if line.strip():
            continue
        pa, ab = stat(row.get("result", ""))
        no_line.append(
            {
                "pa_id": pa_id,
                "result": (row.get("result") or "")[:55],
                "pa": pa,
                "ab": ab,
                "first": row.get("first"),
                "chain": row.get("chain"),
                "hybrid": score_hybrid_sit(row),
            }
        )
    return play, per_pa, no_line


def agg_from_per_pa(play: dict, per_pa: dict) -> dict[str, list[int]]:
    return agg_hybrid(play, per_pa)


def main() -> None:
    play, per_pa, no_line = load_sato()
    print(f"=== 佐藤輝明 PA={len(per_pa)}  実況行なし={len(no_line)} ===\n")

    if no_line:
        print("paId | AB | first | chain | hybrid | 結果")
        print("-----|----|-------|-------|--------|------")
        for r in no_line:
            print(
                f"{r['pa_id']} | {r['ab']} | {r['first'] or '-':5} | "
                f"{r['chain'] or '-':5} | {r['hybrid'] or '-':6} | {r['result']}"
            )

    print("\n=== hybrid + steal（全打席）===")
    agg = agg_from_per_pa(play, per_pa)
    d = l1_pa_ab(agg)
    print(f"L1(PA+AB)={d}")
    print("条件   | PA ref got dPA | AB ref got dAB")
    for k in KEYS:
        r = REF[k]
        g = agg[k]
        dp, da = g[0] - r["pa"], g[1] - r["ab"]
        if dp or da:
            print(
                f"{LABEL[k]:6} | {r['pa']:3} {g[0]:3} {dp:+3} | "
                f"{r['ab']:3} {g[1]:3} {da:+3}"
            )
        else:
            print(f"{LABEL[k]:6} | {r['pa']:3} {g[0]:3} {dp:+3} | {r['ab']:3} {g[1]:3} {da:+3} OK")


if __name__ == "__main__":
    main()
