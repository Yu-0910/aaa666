#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""平川 r13 関連打席の score/text 調査。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from diag_hirakawa_match_official import collect_all, extract_token  # noqa: E402

PLAY = json.loads((ROOT / "_data/diag_hirakawa_play_lines.json").read_text(encoding="utf-8"))
OFF = json.loads((ROOT / "_data/diag_hirakawa_best_assign.json").read_text(encoding="utf-8"))
CANONICAL = ROOT / "_data/scraped_games/canonical"

TARGETS = [
    "2021038817-2-表-3",
    "2021038817-8-表-5",
    "2021038817-2-表-3",
]


def main() -> None:
    per_pa = collect_all()
    print("paId\toff\ttext\tfirst\tchain\tlast\tfirst_em\tlast_em\tresult")
    for pa_id in sorted(set(TARGETS)):
        row = per_pa.get(pa_id, {})
        line = PLAY.get(pa_id, "")
        tok = extract_token(line)
        print(
            f"{pa_id}\t{OFF.get(pa_id, '?')}\t{row.get('text')}\t{row.get('first')}\t"
            f"{row.get('chain')}\t{row.get('last')}\t{row.get('first_em')}\t{row.get('last_em')}\t"
            f"{row.get('result', '')}\t# {tok}"
        )
        gid = pa_id.split("-")[0]
        doc = json.loads((CANONICAL / f"{gid}.json").read_text(encoding="utf-8"))
        for pa in doc.get("domain", {}).get("plateAppearances") or []:
            if pa.get("paId") == pa_id:
                print("  summary:", pa.get("resultSummaryJa", "")[:60])
                print("  baseBefore:", pa.get("baseBefore"))
                break


if __name__ == "__main__":
    main()
