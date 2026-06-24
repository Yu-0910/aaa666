#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""平川: 4点修正相当 + H/SO 差分の高速診断（平川試合のみ）。"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from diag_hirakawa_match_official import (  # noqa: E402
    collect_all,
    extract_token,
    sit_key,
    token_bases,
)
from compute_hirakawa_no_line_hybrid import (  # noqa: E402
    KEYS,
    LABEL,
    REF,
    hybrid_sit,
    l1_pa_ab,
    load_rows,
    stat,
    text_sit,
)

PLAY = ROOT / "_data/diag_hirakawa_play_lines.json"
CANONICAL = ROOT / "_data/scraped_games/canonical"
OFFICIAL = json.loads((ROOT / "_data/diag_hirakawa_best_assign.json").read_text(encoding="utf-8"))

REF_HS = {
    "none": dict(h=6, so=19),
    "r1": dict(h=6, so=3),
    "r2": dict(h=1, so=4),
    "r3": dict(h=1, so=0),
    "r12": dict(h=1, so=3),
    "r13": dict(h=1, so=0),
    "r23": dict(h=0, so=1),
    "loaded": dict(h=1, so=0),
}

H_RE = re.compile(
    r"本塁打|ホームラン|三塁打|二塁打|内安|内野安打|二安|三安|"
    r"[一二三遊左中右投捕]安|安打|ヒット|左安|中安|右安|遊安|投安|一安|"
    r"(左|中|右)(前|線)打|前打|単打|ポテンヒット|"
    r"(タイムリー|適時打)(?!.*(?:失策|エラー|野選))|"
    r"で出塁(?!.*(?:四球|申告敬遠|敬遠|死球|失策|エラー|野選))"
)
SO_RE = re.compile(r"三振|見逃し|空振り|三振打|振り逃げ")


def strip_brackets(s: str) -> str:
    return re.sub(r"\[[^\]]*\]", "", s or "")


def hs_stat(result: str) -> tuple[int, int]:
    r = strip_brackets((result or "").strip())
    return (1 if H_RE.search(r) else 0, 1 if SO_RE.search(r) else 0)


def score_hybrid_sit(row: dict) -> str | None:
    first = row.get("first")
    chain = row.get("chain")
    if first == "r1":
        return "r2"
    if chain:
        return chain
    if first:
        return first
    return None


def load_base_before(pa_id: str) -> bool:
    gid = pa_id.split("-")[0]
    p = CANONICAL / f"{gid}.json"
    if not p.is_file():
        return False
    doc = json.loads(p.read_text(encoding="utf-8"))
    for pa in doc.get("domain", {}).get("plateAppearances") or []:
        if pa.get("paId") == pa_id:
            return pa.get("baseBefore") is not None
    return False


def hybrid_sit_v4(play_line: str, row: dict, pa_id: str) -> str | None:
    """TS 4点修正: 代打パース + text/score 競合解決 + 盗塁補正。"""
    sit = text_sit(play_line)
    if sit:
        if sit == "r13" and row.get("chain") == "r23":
            return "r23"
        if sit == "r1":
            score = score_hybrid_sit(row)
            if score == "r2" and (load_base_before(pa_id) or "代打" in (play_line or "")):
                return "r2"
        return sit
    return score_hybrid_sit(row)


def agg_hs(play: dict, per_pa: dict, sit_fn) -> dict[str, list[int]]:
    agg = {k: [0, 0, 0, 0] for k in KEYS}  # pa, ab, h, so
    for pa_id, row in per_pa.items():
        line = play.get(pa_id, "")
        sit = sit_fn(line, row, pa_id) if sit_fn.__code__.co_argcount >= 3 else sit_fn(line, row)
        if not sit or sit not in agg:
            continue
        pa, ab = stat(row.get("result", ""))
        h, so = hs_stat(row.get("result", ""))
        agg[sit][0] += pa
        agg[sit][1] += ab
        agg[sit][2] += h
        agg[sit][3] += so
    return agg


def print_hs(title: str, agg: dict[str, list[int]]) -> int:
    l1 = 0
    print(f"\n{title}")
    for k in KEYS:
        g = agg[k]
        r = REF_HS[k]
        dh, dso = g[2] - r["h"], g[3] - r["so"]
        l1 += abs(dh) + abs(dso)
        mark = "" if not dh and not dso else f"  H{dso and ''}{'+' if dh > 0 else ''}{dh if dh else ''} SO{'+' if dso > 0 else ''}{dso if dso else ''}"
        if dh or dso:
            print(f"  {LABEL[k]}: got H={g[2]} SO={g[3]} ref H={r['h']} SO={r['so']}  ({dh:+d}/{dso:+d})")
    print(f"  L1(H+SO)={l1}, L1(PA+AB)={l1_pa_ab({k: v[:2] for k, v in agg.items()})}")
    return l1


def main() -> None:
    play, per_pa, _ = load_rows()

    def old_fn(line, row):
        return hybrid_sit(line, row)

    def v4_fn(line, row, pa_id):
        return hybrid_sit_v4(line, row, pa_id)

    agg_old = agg_hs(play, per_pa, old_fn)
    agg_v4 = agg_hs(play, per_pa, v4_fn)

    print_hs("旧 hybrid (resultSummaryJa)", agg_old)
    print_hs("v4 相当 (resultSummaryJa)", agg_v4)

    mism = []
    for pa_id in sorted(per_pa):
        line = play.get(pa_id, "")
        got = hybrid_sit_v4(line, per_pa[pa_id], pa_id)
        off = OFFICIAL.get(pa_id)
        if off and got != off:
            r = per_pa[pa_id].get("result", "")
            h, so = hs_stat(r)
            pa, ab = stat(r)
            mism.append(
                f"{pa_id} off={off} got={got} h={h} so={so} ab={ab} tok={extract_token(line)} bb={load_base_before(pa_id)} | {r}"
            )
    print(f"\n公式 best_assign 不一致: {len(mism)}")
    for m in mism:
        print(m)

    print("\n--- r1/r2 で got!=off または H/SO 寄与 ---")
    for pa_id in sorted(per_pa):
        line = play.get(pa_id, "")
        got = hybrid_sit_v4(line, per_pa[pa_id], pa_id)
        off = OFFICIAL.get(pa_id, "?")
        if got not in ("r1", "r2") and off not in ("r1", "r2"):
            continue
        r = per_pa[pa_id].get("result", "")
        h, so = hs_stat(r)
        if got != off or h or so:
            print(f"{pa_id}\toff={off}\tgot={got}\th={h}\tso={so}\t{r}")


if __name__ == "__main__":
    main()
