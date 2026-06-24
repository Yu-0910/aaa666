#!/usr/bin/env python3
"""平川: 公式一致ルールの検証。"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from diag_hirakawa_match_official import REF_PA, collect_all, SIT_TO_T, is_risp_t  # noqa: E402

ASSIGN = ROOT / "_data" / "diag_hirakawa_best_assign.json"


def pick_official(row: dict) -> str | None:
    t, c, f, l = row.get("text"), row.get("chain"), row.get("first"), row.get("last")
    res = (row.get("result") or "").strip()
    # 実況行なし → score 半回チェーン
    if not t:
        return c or f or l
    if t == "r13" and c == "r23":
        return c
    if t == "r12" and c == "r13":
        return c
    if t == "r13" and c == "r2":
        return c
    # 打席内盗塁で2塁化: 三振・ゴロ等（併殺で走者消滅は除く）
    if t == "r1" and c == "r2" and c and not re.search(r"併|ダブルプレー|ＧＯ|ゴロ.*併", res):
        return c
    if t == "r1" and c == "r12":
        return c
    return t


def main():
    per_pa = collect_all()
    want = json.loads(ASSIGN.read_text(encoding="utf-8"))
    ok = 0
    bad = []
    for pa_id, row in per_pa.items():
        got = pick_official(row)
        if got == want.get(pa_id):
            ok += 1
        else:
            bad.append((pa_id, got, want.get(pa_id), row))
    print(f"公式一致 {ok}/{len(per_pa)}")
    if bad:
        print("不一致:")
        for b in bad[:20]:
            print(" ", b[0], "got", b[1], "want", b[2], "text", b[3].get("text"), "chain", b[3].get("chain"))


if __name__ == "__main__":
    main()
