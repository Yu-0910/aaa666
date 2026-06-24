#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""平川 r1/r2 差分打席の score コンテキスト調査。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from diag_hirakawa_match_official import collect_all, extract_token, sit_key, token_bases  # noqa: E402

PLAY = json.loads((ROOT / "_data/diag_hirakawa_play_lines.json").read_text(encoding="utf-8"))
OFF = json.loads((ROOT / "_data/diag_hirakawa_best_assign.json").read_text(encoding="utf-8"))
CANONICAL = ROOT / "_data/scraped_games/canonical"

TARGETS = [
    "2021038752-7-裏-3",
    "2021038842-7-裏-2",
    "2021038842-8-裏-4",
    "2021038852-12-表-2",
    "2021038817-8-表-5",
    "2021038962-2-裏-4",
    "2021038962-10-裏-4",
    "2021038968-2-裏-4",
    "2021038852-10-表-3",
]


def bb(pa_id: str):
    gid = pa_id.split("-")[0]
    doc = json.loads((CANONICAL / f"{gid}.json").read_text(encoding="utf-8"))
    for pa in doc.get("domain", {}).get("plateAppearances") or []:
        if pa.get("paId") == pa_id:
            return pa.get("baseBefore")
    return None


def score_hybrid(row: dict) -> str | None:
    first = row.get("first")
    chain = row.get("chain")
    if first == "r1":
        return "r2"
    return chain or first


def main() -> None:
    per_pa = collect_all()
    print("paId\toff\ttext\tfirst\tchain\tlast\thybrid\tbb\ttoken\tresult")
    for pa_id in TARGETS:
        row = per_pa.get(pa_id, {})
        line = PLAY.get(pa_id, "")
        tok = extract_token(line)
        print(
            f"{pa_id}\t{OFF.get(pa_id, '?')}\t{row.get('text')}\t{row.get('first')}\t"
            f"{row.get('chain')}\t{row.get('last')}\t{score_hybrid(row)}\t{bb(pa_id)!r}\t"
            f"{tok}\t{row.get('result', '')}"
        )


if __name__ == "__main__":
    main()
