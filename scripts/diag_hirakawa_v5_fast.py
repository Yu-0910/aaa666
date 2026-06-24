#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""新ルール適用後の平川 PA/AB 差分。"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from diag_hirakawa_match_official import collect_all, extract_token, sit_key, token_bases  # noqa: E402

PLAY = json.loads((ROOT / "_data/diag_hirakawa_play_lines.json").read_text(encoding="utf-8"))
OFF = json.loads((ROOT / "_data/diag_hirakawa_best_assign.json").read_text(encoding="utf-8"))
REF = {
    "none": dict(pa=51, ab=48),
    "r1": dict(pa=18, ab=17),
    "r2": dict(pa=8, ab=8),
    "r3": dict(pa=3, ab=3),
    "r12": dict(pa=8, ab=8),
    "r13": dict(pa=1, ab=1),
    "r23": dict(pa=2, ab=1),
    "loaded": dict(pa=3, ab=2),
}
AB_EXCL = re.compile(r"四球|敬遠|申告|死球|犠打|犠飛|妨害|打撃妨害|走塁妨害|押出")


def tb(token):
    b = token_bases(token)
    return b if b else None


def is_r1(b):
    return b == (1, 0, 0)


def is_r2(b):
    return b == (0, 1, 0)


def is_r13(b):
    return b == (1, 0, 1)


def text_sit(line):
    t = extract_token(line or "")
    return sit_key(tb(t)) if t and tb(t) else None


def is_r12(b):
    return b == (1, 1, 0)


def hybrid_v5(line, row):
    sit = text_sit(line)
    if sit:
        t = tb(extract_token(line))
        chain_t = row.get("chain_t")
        last_t = row.get("last_t")
        token = extract_token(line) or ""
        # steal
        if t == (1, 0, 1) and chain_t == (0, 1, 1):
            return "r23"
        # conflict r2
        if (
            t == (1, 0, 0)
            and chain_t
            and is_r2(chain_t)
            and last_t
            and is_r2(last_t)
            and (token.startswith("無死一塁") or "代打" in (line or ""))
        ):
            return "r2"
        if t == (1, 0, 1) and last_t and is_r2(last_t):
            return "r2"
        # conflict r12
        if (
            t == (1, 0, 0)
            and chain_t
            and is_r12(chain_t)
            and last_t
            and is_r1(last_t)
            and token.startswith("二死一塁")
        ):
            return "r12"
        return sit
    first = row.get("first")
    chain = row.get("chain")
    if first == "r1":
        return "r2"
    return chain or first


def stat(r):
    ab = 0 if AB_EXCL.search(r or "") else 1
    return 1, ab


def main():
    per_pa = collect_all()
    agg = {k: [0, 0] for k in REF}
    flips = []
    for pa_id, row in sorted(per_pa.items()):
        line = PLAY.get(pa_id, "")
        got = hybrid_v5(line, row)
        off = OFF.get(pa_id)
        pa, ab = stat(row.get("result", ""))
        if got in agg:
            agg[got][0] += pa
            agg[got][1] += ab
        if off and got != off and (off in ("r1", "r2") or got in ("r1", "r2")):
            flips.append(
                f"{pa_id} off={off} got={got} text={row.get('text')} chain={row.get('chain')} last={row.get('last')} | {row.get('result','')}"
            )

    print("PA/AB vs REF:")
    for k, r in REF.items():
        g = agg[k]
        print(f"  {k}: PA {g[0]}/{r['pa']} ({g[0]-r['pa']:+d})  AB {g[1]}/{r['ab']} ({g[1]-r['ab']:+d})")

    print(f"\nr1/r2 flips vs best_assign ({len(flips)}):")
    for x in flips:
        print(x)


if __name__ == "__main__":
    main()
