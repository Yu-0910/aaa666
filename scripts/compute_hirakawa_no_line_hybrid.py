#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""平川: 実況行なし11打席の paId diff とハイブリッド試算。"""
from __future__ import annotations

import json
import re
import sys
from itertools import product
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from diag_hirakawa_match_official import collect_all, extract_token, token_bases, sit_key  # noqa: E402

PLAY = ROOT / "_data/diag_hirakawa_play_lines.json"

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


def strip_brackets(r: str) -> str:
    return re.sub(r"\[[^\]]*\]", "", r or "")


def stat(result: str) -> tuple[int, int]:
    r = strip_brackets((result or "").strip())
    pa = 1
    ab = 0 if AB_EXCL.search(r) else 1
    return pa, ab


def l1_pa_ab(agg: dict[str, list[int]]) -> int:
    return sum(abs(agg[k][0] - REF[k]["pa"]) + abs(agg[k][1] - REF[k]["ab"]) for k in KEYS)


def text_sit(play_line: str) -> str | None:
    tok = extract_token(play_line or "")
    if not tok:
        return None
    tb = token_bases(tok)
    return sit_key(tb) if tb else None


def load_rows() -> tuple[dict, dict, list[dict]]:
    play = json.loads(PLAY.read_text(encoding="utf-8"))
    per_pa = collect_all()
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
                "last": row.get("last"),
            }
        )
    return play, per_pa, no_line


def score_hybrid_sit(row: dict) -> str | None:
    """TS `basesBeforeFromScoreHybrid` と同型: 入口 r1 のみ → r2、他は chain → first。"""
    first = row.get("first")
    chain = row.get("chain")
    if first == "r1":
        return "r2"
    if chain:
        return chain
    if first:
        return first
    return None


def hybrid_sit(play_line: str, row: dict) -> str | None:
    sit = text_sit(play_line)
    if sit:
        if sit == "r13" and row.get("chain") == "r23":
            return "r23"
        return sit
    return score_hybrid_sit(row)


def agg_hybrid(play: dict, per_pa: dict) -> dict[str, list[int]]:
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


def agg_text_plus(no_line_assign: dict[str, str], play: dict, per_pa: dict) -> dict[str, list[int]]:
    agg = {k: [0, 0] for k in KEYS}
    for pa_id, row in per_pa.items():
        line = play.get(pa_id, "")
        sit = text_sit(line)
        if sit is None:
            sit = no_line_assign.get(pa_id)
        if not sit or sit not in agg:
            continue
        pa, ab = stat(row.get("result", ""))
        agg[sit][0] += pa
        agg[sit][1] += ab
    return agg


def print_diff_table(title: str, agg: dict[str, list[int]]) -> int:
    d = l1_pa_ab(agg)
    print(f"\n{title}  L1(PA+AB)={d}")
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
    return d


def no_line_rules(no_line: list[dict]) -> dict[str, dict[str, str]]:
    rows = {r["pa_id"]: r for r in no_line}
    return {
        "11->first": {pid: rows[pid]["first"] for pid in rows if rows[pid].get("first")},
        "11->chain": {pid: rows[pid]["chain"] for pid in rows if rows[pid].get("chain")},
        "11->chain_if_diff": {
            pid: (rows[pid]["chain"] if rows[pid]["chain"] != rows[pid]["first"] else rows[pid]["first"])
            for pid in rows
            if rows[pid].get("first") or rows[pid].get("chain")
        },
    }


def main() -> None:
    play, per_pa, no_line = load_rows()
    print("=== 実況行なし 11打席（paId 単位）===\n")
    print("paId | AB | first | chain | last | 結果")
    print("-----|----|-------|-------|------|------")
    for r in no_line:
        print(
            f"{r['pa_id']} | {r['ab']} | {r['first'] or '-':5} | "
            f"{r['chain'] or '-':5} | {r['last'] or '-':4} | {r['result']}"
        )

    text_only = agg_text_plus({}, play, per_pa)
    hybrid = agg_hybrid(play, per_pa)
    print("\n=== ベースライン: 実況トークン打席のみ（11打席除外）===")
    print_diff_table("text_only", text_only)
    print("  不足: 無し AB -4, 2塁 AB -4 ← 11打席で埋める必要")

    print("\n=== Phase15 ハイブリッド（実況 → score r1→r2 → chain）===")
    print_diff_table("hybrid_code", hybrid)

    print("\n=== 残差行: 1・3塁 / 2・3塁 の paId（hybrid_code）===")
    for pa_id, row in sorted(per_pa.items()):
        line = play.get(pa_id, "")
        sit = hybrid_sit(line, row)
        if sit not in ("r13", "r23"):
            continue
        ref = REF[sit]
        print(f"  {pa_id} → {LABEL[sit]} | {row.get('result','')[:40]} | text={text_sit(line) or '-'}")

    for name, assign in no_line_rules(no_line).items():
        agg = agg_text_plus(assign, play, per_pa)
        print_diff_table(f"text + {name}", agg)

    ids = [r["pa_id"] for r in no_line]
    choices = []
    for r in no_line:
        opts = []
        if r.get("first"):
            opts.append(r["first"])
        if r.get("chain") and r["chain"] not in opts:
            opts.append(r["chain"])
        if not opts:
            opts = ["none"]
        choices.append(opts)

    best = None
    for combo in product(*choices):
        assign = dict(zip(ids, combo, strict=True))
        agg = agg_text_plus(assign, play, per_pa)
        d = l1_pa_ab(agg)
        if best is None or d < best[0]:
            best = (d, assign, agg)

    assert best
    d, assign, agg = best
    print(f"\n=== 11打席 first/chain 2択全探索（最良 L1={d}）===")
    for pa_id in ids:
        r = next(x for x in no_line if x["pa_id"] == pa_id)
        pick = assign[pa_id]
        tag = " *chain" if pick == r.get("chain") and pick != r.get("first") else ""
        print(f"  {pa_id} → {pick:6} AB={r['ab']}  first={r['first']} chain={r['chain']}{tag}")
    print_diff_table("text + 探索最良", agg)

    choices2 = []
    for r in no_line:
        opts = list(
            dict.fromkeys(x for x in [r.get("first"), r.get("chain"), r.get("last")] if x in KEYS)
        )
        if not opts:
            opts = ["none"]
        choices2.append(opts)

    best2 = None
    for combo in product(*choices2):
        assign = dict(zip(ids, combo, strict=True))
        agg = agg_text_plus(assign, play, per_pa)
        d = l1_pa_ab(agg)
        if best2 is None or d < best2[0]:
            best2 = (d, assign, agg)

    d2, assign2, agg2 = best2
    print(f"\n=== 11打席 first/chain/last 候補探索（最良 L1={d2}）===")
    for pa_id in ids:
        print(f"  {pa_id} → {assign2[pa_id]}")
    print_diff_table("text + 拡張探索最良", agg2)

    if d2 == 0:
        print("\n→ 正常値と完全一致する11打席割当が存在")
    else:
        print(f"\n→ first/chain/last だけでは L1={d2} が下限。83打席側にも残差あり")


if __name__ == "__main__":
    main()
