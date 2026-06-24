#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""任意打者: canonical + score から打席別 first/chain を収集。"""
from __future__ import annotations

import json
from pathlib import Path

from diag_hirakawa_match_official import (
    build_chain_start_for_half,
    bases_parse,
    load_snap,
    parse_pa_id,
    score_prefix,
    sit_key,
)

CANONICAL_DIR = Path(__file__).resolve().parents[1] / "_data" / "scraped_games" / "canonical"


def game_ids_for_batter(yahoo: str) -> list[str]:
    out: list[str] = []
    needle = f'"yahooBatterId": "{yahoo}"'
    for path in sorted(CANONICAL_DIR.glob("*.json")):
        try:
            if needle in path.read_text(encoding="utf-8", errors="replace"):
                out.append(path.stem)
        except OSError:
            continue
    return out


def collect_batter_pa(yahoo: str) -> dict[str, dict]:
    per_pa: dict[str, dict] = {}
    for gid in game_ids_for_batter(yahoo):
        path = CANONICAL_DIR / f"{gid}.json"
        doc = json.loads(path.read_text(encoding="utf-8"))
        all_pas = sorted(
            doc.get("domain", {}).get("plateAppearances") or [],
            key=lambda p: parse_pa_id(p.get("paId", "")) or (0, "", 0),
        )
        target = [p for p in all_pas if str(p.get("yahooBatterId") or "").strip() == yahoo]
        if not target:
            continue

        batter_halfs: set[str] = set()
        for pa in target:
            parsed = parse_pa_id(pa.get("paId", ""))
            if parsed:
                batter_halfs.add(f"{parsed[0]}-{parsed[1]}")

        half_groups: dict[str, list[str]] = {}
        for pa in all_pas:
            parsed = parse_pa_id(pa.get("paId", ""))
            if not parsed:
                continue
            hk = f"{parsed[0]}-{parsed[1]}"
            if hk not in batter_halfs:
                continue
            half_groups.setdefault(hk, []).append(pa["paId"])

        prefixes = set()
        for pa_ids in half_groups.values():
            for pa_id in pa_ids:
                parsed = parse_pa_id(pa_id)
                if parsed:
                    prefixes.add(score_prefix(*parsed))
        snap = load_snap(gid, prefixes)

        chain_start: dict[str, tuple[int, int, int]] = {}
        for pa_ids in half_groups.values():
            chain_start.update(build_chain_start_for_half(pa_ids, snap))

        for pa in target:
            pa_id = pa["paId"]
            if not (pa.get("resultSummaryJa") or "").strip():
                continue
            parsed = parse_pa_id(pa_id)
            slot = snap.get(score_prefix(*parsed)) if parsed else None
            first_t = bases_parse(slot["first"], False) if slot else None
            chain_t = chain_start.get(pa_id)
            per_pa[pa_id] = {
                "result": pa.get("resultSummaryJa") or "",
                "first": sit_key(first_t) if first_t else None,
                "chain": sit_key(chain_t) if chain_t else None,
            }
    return per_pa
