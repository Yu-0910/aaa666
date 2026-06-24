#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""平川蓮: 結果球時点（score 最終スナップ #base）で状況別集計。"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
YAHOO = "2110164"
SCORE_DIR = ROOT / "_data" / "scraped_games" / "raw_sportsnavi_score"
CANONICAL_DIR = ROOT / "_data" / "scraped_games" / "canonical"
DERIVED = ROOT / "_data" / "derived" / "player_season_batting_splits" / "2026" / f"yahoo_{YAHOO}.json"

RE_BASE = re.compile(r'id="base"\s+class="b(\d)(\d)(\d)"')
PAID_RE = re.compile(r"^(\d+)-(\d+)-(表|裏)-(\d+)$")

LABEL = {
    "none": "無し",
    "r1": "1塁",
    "r2": "2塁",
    "r3": "3塁",
    "r12": "1・2塁",
    "r13": "1・3塁",
    "r23": "2・3塁",
    "loaded": "満塁",
    "risp": "得点圏",
}

KEYS = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded", "risp"]


def parse_pa_id(pa_id: str):
    m = PAID_RE.match((pa_id or "").strip())
    if not m:
        return None
    return int(m.group(2)), m.group(3), int(m.group(4))


def score_prefix(inning: int, half: str, pa_seq: int) -> str:
    tb = "1" if half == "表" else "2"
    return f"{inning:02d}{tb}{pa_seq:02d}"


def bases_from_class(html: str):
    m = RE_BASE.search(html or "")
    if not m:
        return None
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)))


def sit_key(t):
    r1, r2, r3 = (bool(x) for x in t)
    if not r1 and not r2 and not r3:
        return "none"
    if r1 and r2 and r3:
        return "loaded"
    if r1 and r2:
        return "r12"
    if r1 and r3:
        return "r13"
    if r2 and r3:
        return "r23"
    if r1:
        return "r1"
    if r2:
        return "r2"
    if r3:
        return "r3"
    return "none"


def is_risp(t):
    return bool(t[1]) or bool(t[2])


def count_pa(agg: dict, bases, r: str):
    sk = sit_key(bases)
    agg[sk]["pa"] += 1
    if is_risp(bases):
        agg["risp"]["pa"] += 1


def load_snap(gid: str, prefixes: set[str]) -> dict:
    d = SCORE_DIR / gid
    if not d.is_dir():
        return {}
    by: dict = {}
    for name in d.iterdir():
        if name.suffix != ".html":
            continue
        idx = name.stem
        if len(idx) != 7 or not idx.isdigit() or idx[:5] not in prefixes:
            continue
        slot = by.setdefault(idx[:5], {})
        if "first_idx" not in slot or idx < slot["first_idx"]:
            slot["first_idx"] = idx
        if "last_idx" not in slot or idx > slot["last_idx"]:
            slot["last_idx"] = idx
    for slot in by.values():
        slot["first"] = (d / f"{slot['first_idx']}.html").read_text(encoding="utf-8", errors="replace")
        slot["last"] = (d / f"{slot['last_idx']}.html").read_text(encoding="utf-8", errors="replace")
    return by


def empty_agg():
    return {k: {"pa": 0} for k in KEYS}


def load_ref_pa() -> dict[str, int]:
    if not DERIVED.is_file():
        return {}
    doc = json.loads(DERIVED.read_text(encoding="utf-8"))
    out = {}
    for row in doc.get("rows") or []:
        if row.get("split_type") != "base_sit":
            continue
        v = str(row.get("split_value") or "")
        pa = row.get("pa")
        if pa is not None:
            out[v] = int(pa)
    return out


def hirakawa_game_ids() -> list[str]:
    if DERIVED.is_file():
        doc = json.loads(DERIVED.read_text(encoding="utf-8"))
        ids = doc.get("source", {}).get("canonicalGames")
        if ids:
            return sorted(str(x) for x in ids)
    out = []
    for p in CANONICAL_DIR.glob("*.json"):
        if f'"yahooBatterId": "{YAHOO}"' in p.read_text(encoding="utf-8", errors="ignore"):
            out.append(p.stem)
    return sorted(out)


def main():
    start_agg = empty_agg()
    result_agg = empty_agg()
    total = 0
    no_snap = 0
    diff_n = 0

    for gid in hirakawa_game_ids():
        cp = CANONICAL_DIR / f"{gid}.json"
        if not cp.is_file():
            continue
        doc = json.loads(cp.read_text(encoding="utf-8"))
        pas = sorted(
            doc.get("domain", {}).get("plateAppearances") or [],
            key=lambda p: parse_pa_id(p.get("paId", "")) or (0, "", 0),
        )
        target = [p for p in pas if str(p.get("yahooBatterId") or "").strip() == YAHOO]
        prefixes = set()
        for pa in target:
            parsed = parse_pa_id(pa.get("paId", ""))
            if parsed:
                prefixes.add(score_prefix(*parsed))
        snap = load_snap(gid, prefixes)

        for pa in target:
            total += 1
            if not (pa.get("resultSummaryJa") or "").strip():
                continue
            parsed = parse_pa_id(pa.get("paId", ""))
            if not parsed:
                continue
            slot = snap.get(score_prefix(*parsed))
            if not slot:
                no_snap += 1
                continue
            bf = bases_from_class(slot.get("first") or "")
            bl = bases_from_class(slot.get("last") or "")
            if not bf or not bl:
                no_snap += 1
                continue
            count_pa(start_agg, bf, "")
            count_pa(result_agg, bl, "")
            if sit_key(bf) != sit_key(bl) or is_risp(bf) != is_risp(bl):
                diff_n += 1

    ref = load_ref_pa()

    print("平川 蓮 (yahoo_2110164)")
    print("結果球 = 同一打席 score index 最大の #base class（全状況に適用）\n")
    print(f"打席数: {total} | 解析不可: {no_snap} | 開始と終了で状況が違う打席: {diff_n}\n")
    print("状況     | 結果球PA | 開始PA | 派生PA | Δ(結果-派生)")
    print("---------|----------|--------|--------|-------------")
    for k in KEYS:
        ref_pa = ref.get(k)
        rp = result_agg[k]["pa"]
        sp = start_agg[k]["pa"]
        d = rp - ref_pa if ref_pa is not None else None
        dstr = f"{d:+d}" if d is not None else "—"
        print(f"{LABEL[k]:8} | {rp:8} | {sp:8} | {ref_pa or '—':>6} | {dstr:>11}")


if __name__ == "__main__":
    main()
