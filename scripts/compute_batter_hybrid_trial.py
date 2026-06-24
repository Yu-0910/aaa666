#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""任意打者: ハイブリッド + 盗塁補正の状況別 PA/AB 試算。"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from compute_hirakawa_no_line_hybrid import (  # noqa: E402
    KEYS,
    LABEL,
    hybrid_sit,
    stat,
    text_sit,
)
from diag_batter_collect import collect_batter_pa  # noqa: E402
PLAY_LINES: dict[str, Path] = {
    "2110164": ROOT / "_data/diag_hirakawa_play_lines.json",
    "2000051": ROOT / "_data/diag_sato_play_lines.json",
}

REF: dict[str, dict[str, dict[str, int]]] = {
    "2110164": {
        "none": dict(pa=51, ab=48),
        "r1": dict(pa=18, ab=17),
        "r2": dict(pa=8, ab=8),
        "r3": dict(pa=3, ab=3),
        "r12": dict(pa=8, ab=8),
        "r13": dict(pa=1, ab=1),
        "r23": dict(pa=2, ab=1),
        "loaded": dict(pa=3, ab=2),
    },
    "2000051": {
        "none": dict(pa=123, ab=113),
        "r1": dict(pa=48, ab=43),
        "r2": dict(pa=20, ab=12),
        "r3": dict(pa=8, ab=7),
        "r12": dict(pa=14, ab=11),
        "r13": dict(pa=4, ab=3),
        "r23": dict(pa=3, ab=3),
        "loaded": dict(pa=5, ab=4),
    },
}


def collect_batter(yahoo: str, _play_lines: dict[str, str]) -> dict[str, dict]:
    return collect_batter_pa(yahoo)


def agg(per_pa: dict, play: dict) -> dict[str, list[int]]:
    agg = {k: [0, 0] for k in KEYS}
    for pa_id, row in per_pa.items():
        line = play.get(pa_id, "")
        sit = hybrid_sit(line, row)
        if not sit or sit not in agg:
            continue
        pa, ab = stat(row.get("result", ""))
        agg[sit][0] += pa
        agg[sit][1] += ab
    return agg


def l1_for_ref(got: dict[str, list[int]], ref: dict[str, dict[str, int]]) -> int:
    return sum(
        abs(got[k][0] - ref[k]["pa"]) + abs(got[k][1] - ref[k]["ab"])
        for k in KEYS
    )


def print_table(yahoo: str, title: str, got: dict[str, list[int]]) -> int:
    ref = REF[yahoo]
    d = l1_for_ref(got, ref)
    print(f"\n{title}  L1(PA+AB)={d}")
    print("条件   | PA ref got dPA | AB ref got dAB")
    for k in KEYS:
        r = ref[k]
        g = got[k]
        dp, da = g[0] - r["pa"], g[1] - r["ab"]
        mark = " OK" if not dp and not da else ""
        print(
            f"{LABEL[k]:6} | {r['pa']:3} {g[0]:3} {dp:+3} | "
            f"{r['ab']:3} {g[1]:3} {da:+3}{mark}"
        )
    return d


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("yahoo", nargs="?", default="all")
    args = ap.parse_args()
    ids = list(REF.keys()) if args.yahoo == "all" else [args.yahoo]

    for yahoo in ids:
        play_path = PLAY_LINES.get(yahoo)
        if not play_path or not play_path.is_file():
            print(f"\n=== yahoo_{yahoo}: play lines missing ({play_path}) ===")
            continue
        play = json.loads(play_path.read_text(encoding="utf-8"))
        per_pa = collect_batter(yahoo, play)
        print(f"\n=== yahoo_{yahoo} PA={len(per_pa)} ===")
        print_table(yahoo, "hybrid + steal override", agg(per_pa, play))

        overrides = [
            (pa_id, row)
            for pa_id, row in per_pa.items()
            if text_sit(play.get(pa_id, "")) == "r13" and row.get("chain") == "r23"
        ]
        if overrides:
            print("\n  text=r13 & chain=r23 打席:")
            for pa_id, row in overrides:
                print(f"    {pa_id} | {(row.get('result') or '')[:50]}")


if __name__ == "__main__":
    main()
