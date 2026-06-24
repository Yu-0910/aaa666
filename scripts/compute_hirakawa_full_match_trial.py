#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""平川: 完全一致に向けた試算（ハイブリッド + 実況側微調整）。"""
from __future__ import annotations

import json
import re
import sys
from itertools import product
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from compute_hirakawa_no_line_hybrid import (  # noqa: E402
    KEYS,
    LABEL,
    REF,
    agg_hybrid,
    hybrid_sit,
    l1_pa_ab,
    load_rows,
    print_diff_table,
    stat,
    text_sit,
)
from diag_hirakawa_match_official import collect_all, token_bases, sit_key  # noqa: E402

RESIDUAL_CANDIDATES = [
    "2021038752-9-裏-5",
    "2021038817-8-表-5",
    "2021038823-7-表-4",
]

MID_PA_BASES_RE = re.compile(r"(一二塁|一三塁|二三塁|一二三塁|満塁|一塁|二塁|三塁|走者なし)")


def sit_from_play_line_mid_pa(play_line: str) -> str | None:
    """実況行内の塁表記を先頭トークン以外から拾う（盗塁後の二三塁等）。"""
    s = (play_line or "").strip()
    if not s:
        return None
    head = re.match(r"^\d+[：:]\s*\d+番\s+(.+)$", s)
    if not head:
        return None
    body = head.group(1)
    # 先頭の状況トークン以降の塁表記
    parts = body.split()
    start = 0
    if len(parts) >= 2 and not re.match(r"^(無死|一死|二死|三死)", parts[0]):
        start = 2
    for i, t in enumerate(parts):
        if i < start:
            continue
        if re.match(r"^(無死|一死|二死|三死)", t):
            continue
        m = MID_PA_BASES_RE.search(t)
        if m:
            tb = token_bases("二死" + m.group(1))  # 死活は sit_key に不要
            if tb:
                return sit_key(tb)
    # 「二三塁」が文中に独立して現れるケース（8752）
    for pat, bases in [
        ("二三塁", (0, 1, 1)),
        ("一三塁", (1, 0, 1)),
        ("一二塁", (1, 1, 0)),
    ]:
        if pat in body and pat not in (extract_entry_bases_token(body) or ""):
            return sit_key(bases)
    return None


def extract_entry_bases_token(body: str) -> str | None:
    parts = body.split()
    start = 2 if len(parts) >= 2 and not re.match(r"^(無死|一死|二死|三死)", parts[0]) else 0
    for i in range(start, len(parts)):
        if re.match(r"^(無死|一死|二死|三死)", parts[i]):
            return parts[i]
    return None


def hybrid_sit_v2(play_line: str, row: dict) -> str | None:
    """hybrid + 実況行に塁変化があれば結果前塁（文中トークン）を優先。"""
    sit = hybrid_sit(play_line, row)
    if not play_line.strip():
        return sit
    mid = sit_from_play_line_mid_pa(play_line)
    if mid and mid != sit:
        return mid
    return sit


def hybrid_sit_v3(play_line: str, row: dict) -> str | None:
    """hybrid + score last（実況ありのみ last が text と異なるとき last）。"""
    sit = hybrid_sit(play_line, row)
    if not play_line.strip():
        return sit
    last = row.get("last")
    if last and last != sit:
        return last
    return sit


def agg_with_assign(
    play: dict,
    per_pa: dict,
    sit_fn,
    overrides: dict[str, str] | None = None,
) -> dict[str, list[int]]:
    overrides = overrides or {}
    agg = {k: [0, 0] for k in KEYS}
    for pa_id, row in per_pa.items():
        line = play.get(pa_id, "")
        sit = overrides.get(pa_id) or sit_fn(line, row)
        if not sit or sit not in agg:
            continue
        pa, ab = stat(row.get("result", ""))
        agg[sit][0] += pa
        agg[sit][1] += ab
    return agg


def print_all_rows(title: str, agg: dict[str, list[int]]) -> int:
    d = l1_pa_ab(agg)
    print(f"\n{title}  L1(PA+AB)={d}")
    print("条件   | PA ref got dPA | AB ref got dAB")
    for k in KEYS:
        r = REF[k]
        g = agg[k]
        dp, da = g[0] - r["pa"], g[1] - r["ab"]
        mark = " OK" if not dp and not da else ""
        print(
            f"{LABEL[k]:6} | {r['pa']:3} {g[0]:3} {dp:+3} | "
            f"{r['ab']:3} {g[1]:3} {da:+3}{mark}"
        )
    return d


def main() -> None:
    play, per_pa, _no_line = load_rows()

    print("=== 平川蓮 完全一致試算 ===\n")
    print_all_rows("1. hybrid_code（現行）", agg_hybrid(play, per_pa))

    print("\n--- 残差3打席の score/text/last ---")
    for pa_id in RESIDUAL_CANDIDATES:
        row = per_pa[pa_id]
        line = play.get(pa_id, "")
        print(f"\n{pa_id}")
        print(f"  結果: {row.get('result','')}")
        print(f"  text入口: {text_sit(line)} | hybrid: {hybrid_sit(line, row)}")
        print(f"  score first/chain/last: {row.get('first')} / {row.get('chain')} / {row.get('last')}")
        print(f"  文中塁(v2): {sit_from_play_line_mid_pa(line)}")
        print(f"  実況: {line[:120]}...")

    d2 = print_all_rows(
        "2. hybrid + 文中塁変化優先(v2)",
        agg_with_assign(play, per_pa, hybrid_sit_v2),
    )

    d3 = print_all_rows(
        "3. hybrid + score last 上書き(v3)",
        agg_with_assign(play, per_pa, hybrid_sit_v3),
    )

    d4 = print_all_rows(
        "4. hybrid + 8752のみ r23 固定",
        agg_with_assign(
            play,
            per_pa,
            hybrid_sit,
            {"2021038752-9-裏-5": "r23"},
        ),
    )

    # 3打席の sit 候補を総当たり（hybrid ベース）
    choices: list[list[str]] = []
    for pa_id in RESIDUAL_CANDIDATES:
        row = per_pa[pa_id]
        line = play.get(pa_id, "")
        opts = list(
            dict.fromkeys(
                x
                for x in [
                    hybrid_sit(line, row),
                    text_sit(line),
                    sit_from_play_line_mid_pa(line),
                    row.get("last"),
                    row.get("first"),
                    row.get("chain"),
                ]
                if x in KEYS
            )
        )
        choices.append(opts or ["r13"])
        print(f"  候補 {pa_id}: {opts}")

    best = None
    for combo in product(*choices):
        ov = dict(zip(RESIDUAL_CANDIDATES, combo, strict=True))
        agg = agg_with_assign(play, per_pa, hybrid_sit, ov)
        d = l1_pa_ab(agg)
        if best is None or d < best[0]:
            best = (d, ov, agg)

    assert best
    d_best, ov_best, agg_best = best
    print(f"\n=== 5. 残差3打席 候補総当たり（最良 L1={d_best}）===")
    for pa_id, sit in ov_best.items():
        row = per_pa[pa_id]
        base = hybrid_sit(play.get(pa_id, ""), row)
        tag = " *override" if sit != base else ""
        print(f"  {pa_id} → {LABEL.get(sit, sit)}{tag}")
    print_all_rows("残差3打席 最良", agg_best)

    if d_best == 0:
        print("\n→ 正常値 PA/AB 完全一致の割当を発見")
        print("  ルール化候補:")
        for pa_id, sit in ov_best.items():
            row = per_pa[pa_id]
            print(f"    {pa_id}: {hybrid_sit(play.get(pa_id,''), row)} → {sit}")
    else:
        print(f"\n→ 3打席調整のみでは L1={d_best} が下限")


if __name__ == "__main__":
    main()
