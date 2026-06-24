#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""佐藤輝明: 塁=score HTML イラスト。結果=出場成績スロット。"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
YAHOO = "2000051"
SCORE_DIR = ROOT / "_data" / "scraped_games" / "raw_sportsnavi_score"
CANONICAL_DIR = ROOT / "_data" / "scraped_games" / "canonical"

REF = {
    "none": 123,
    "r1": 48,
    "r2": 20,
    "r3": 8,
    "r12": 14,
    "r13": 4,
    "r23": 3,
    "loaded": 5,
    "risp": 54,
}
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

RE_BASE = re.compile(r'id="base"\s+class="b(\d)(\d)(\d)"')
RE_RESULT_EM = re.compile(r'<div id="result"[\s\S]*?<em>([^<]*)</em>', re.I)
PAID_RE = re.compile(r"^(\d+)-(\d+)-(表|裏)-(\d+)$")


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
    return bool(int(m.group(1))), bool(int(m.group(2))), bool(int(m.group(3)))


def bases_from_em(html: str):
    m = RE_RESULT_EM.search(html or "")
    if not m:
        return None
    em = m.group(1).strip()
    if "ランナー" not in em:
        return None
    if re.search(r"1\s*,\s*2\s*,\s*3|1,2,3塁|満塁", em):
        return True, True, True
    if re.search(r"1\s*,\s*2|1,2塁|一二塁", em):
        return True, True, False
    if re.search(r"1\s*,\s*3|1,3塁|一三塁", em):
        return True, False, True
    if re.search(r"2\s*,\s*3|2,3塁|二三塁", em):
        return False, True, True
    if "3塁" in em:
        return False, False, True
    if "2塁" in em:
        return False, True, False
    if "1塁" in em:
        return True, False, False
    return None


def bases_from_html(html: str):
    return bases_from_em(html) or bases_from_class(html)


def sit_key(r1, r2, r3):
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


def load_score_for_prefixes(game_id: str, prefixes: set[str]) -> dict[str, dict]:
    d = SCORE_DIR / game_id
    if not d.is_dir():
        return {}
    by_prefix: dict[str, dict] = {}
    for name in d.iterdir():
        if not name.suffix == ".html":
            continue
        idx = name.stem
        if len(idx) != 7 or not idx.isdigit():
            continue
        prefix = idx[:5]
        if prefix not in prefixes:
            continue
        slot = by_prefix.setdefault(prefix, {})
        if "first_idx" not in slot or idx < slot["first_idx"]:
            slot["first_idx"] = idx
        if "last_idx" not in slot or idx > slot["last_idx"]:
            slot["last_idx"] = idx
    for prefix, slot in by_prefix.items():
        slot["first"] = (d / f"{slot['first_idx']}.html").read_text(
            encoding="utf-8", errors="replace"
        )
        slot["last"] = (d / f"{slot['last_idx']}.html").read_text(
            encoding="utf-8", errors="replace"
        )
    return by_prefix


def result_from_pa(_doc: dict, pa: dict) -> str:
    return (
        (pa.get("resultSummaryJa") or pa.get("resultJa") or pa.get("result") or "")
        .strip()
    )


def is_ab_result(r: str) -> bool:
    if not r:
        return False
    if any(x in r for x in ("四", "敬遠", "申告", "死球", "犠打", "犠飛", "妨")):
        return False
    return True


def is_hit(r: str) -> bool:
    return any(x in r for x in ("単打", "二塁打", "三塁打", "本塁打", "安打")) or (
        len(r) >= 2 and r[0] in "左右中" and "安" in r
    )


def is_bb(r: str) -> bool:
    return "四球" in r or "敬遠" in r or "申告" in r


def sato_game_ids() -> list[str]:
    out = []
    for p in CANONICAL_DIR.glob("*.json"):
        if f'"yahooBatterId": "{YAHOO}"' in p.read_text(encoding="utf-8", errors="ignore"):
            out.append(p.stem)
    return sorted(out)


def main():
    game_ids = sato_game_ids()
    chain_agg = {k: {"pa": 0, "ab": 0, "h": 0, "bb": 0} for k in REF}
    first_agg = {k: {"pa": 0, "ab": 0, "h": 0, "bb": 0} for k in REF}
    total_pa = 0
    chain_miss = first_miss = no_snap = 0

    for gid in game_ids:
        doc = json.loads((CANONICAL_DIR / f"{gid}.json").read_text(encoding="utf-8"))
        pas = sorted(
            doc.get("domain", {}).get("plateAppearances") or [],
            key=lambda p: parse_pa_id(p.get("paId", "")) or (0, "", 0),
        )
        sato = [p for p in pas if str(p.get("yahooBatterId") or "").strip() == YAHOO]
        if not sato:
            continue

        prefixes = set()
        for pa in pas:
            parsed = parse_pa_id(pa.get("paId", ""))
            if parsed:
                prefixes.add(score_prefix(*parsed))

        snap = load_score_for_prefixes(gid, prefixes)

        half_groups: dict[str, list] = {}
        for pa in pas:
            parsed = parse_pa_id(pa.get("paId", ""))
            if not parsed:
                continue
            half_groups.setdefault(f"{parsed[0]}-{parsed[1]}", []).append(pa)

        start_bases: dict[str, tuple[bool, bool, bool] | None] = {}
        for group in half_groups.values():
            prev = (False, False, False)
            for pa in group:
                parsed = parse_pa_id(pa.get("paId", ""))
                if not parsed:
                    continue
                prefix = score_prefix(*parsed)
                slot = snap.get(prefix)
                first_html = slot.get("first") if slot else None
                before = bases_from_em(first_html or "") if first_html else None
                if not before:
                    before = prev
                start_bases[pa["paId"]] = before
                last_html = slot.get("last") if slot else None
                end_b = bases_from_html(last_html or "") if last_html else None
                if end_b:
                    prev = end_b

        for pa in sato:
            total_pa += 1
            r = result_from_pa(doc, pa)
            if not r:
                continue

            chain_b = start_bases.get(pa["paId"])
            parsed = parse_pa_id(pa["paId"])
            prefix = score_prefix(*parsed) if parsed else ""
            slot = snap.get(prefix) if prefix else None
            if not slot:
                no_snap += 1
            first_b = bases_from_class((slot or {}).get("first") or "")

            if not chain_b:
                chain_miss += 1
            else:
                r1, r2, r3 = chain_b
                keys = [sit_key(r1, r2, r3)]
                if r2 or r3:
                    keys.append("risp")
                for k in keys:
                    a = chain_agg[k]
                    a["pa"] += 1
                    if is_ab_result(r):
                        a["ab"] += 1
                    if is_hit(r):
                        a["h"] += 1
                    if is_bb(r):
                        a["bb"] += 1

            if not first_b:
                first_miss += 1
            else:
                r1, r2, r3 = first_b
                keys = [sit_key(r1, r2, r3)]
                if r2 or r3:
                    keys.append("risp")
                for k in keys:
                    a = first_agg[k]
                    a["pa"] += 1
                    if is_ab_result(r):
                        a["ab"] += 1
                    if is_hit(r):
                        a["h"] += 1
                    if is_bb(r):
                        a["bb"] += 1

    print("Sato Teruaki - bases: score HTML / result: appearance")
    print(f"games: {len(game_ids)} | PA: {total_pa} | missing score: {no_snap}\n")
    for title, agg, miss in (
        ("[A] chain + em runner text", chain_agg, chain_miss),
        ("[B] first snapshot #base class only", first_agg, first_miss),
    ):
        print(title, f"| unknown bases: {miss}")
        print("sit      |  PA |  AB |   H |  BB | refPA | dPA")
        print("---------|-----|-----|-----|-----|--------|------")
        for k in ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded", "risp"]:
            a = agg[k]
            print(
                f"{LABEL[k]:8} | {a['pa']:3} | {a['ab']:3} | {a['h']:3} | {a['bb']:3} | {REF[k]:6} | {a['pa'] - REF[k]:+4}"
            )
        print()


if __name__ == "__main__":
    main()
