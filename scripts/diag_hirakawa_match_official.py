#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""平川蓮: 公式ランナー別PAと各集計法の突合。"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
YAHOO = "2110164"
SCORE_DIR = ROOT / "_data" / "scraped_games" / "raw_sportsnavi_score"
CANONICAL_DIR = ROOT / "_data" / "scraped_games" / "canonical"
PLAY_LINES = ROOT / "_data" / "diag_hirakawa_play_lines.json"
DERIVED = ROOT / "_data" / "derived" / "player_season_batting_splits" / "2026" / f"yahoo_{YAHOO}.json"

RE_BASE = re.compile(r'id="base"\s+class="b(\d)(\d)(\d)"')
RE_RESULT_EM = re.compile(r'<div id="result"[\s\S]*?<em>([^<]*)</em>', re.I)
PAID_RE = re.compile(r"^(\d+)-(\d+)-(表|裏)-(\d+)$")

REF_PA = {
    "none": 47,
    "r1": 15,
    "r2": 8,
    "r3": 2,
    "r12": 7,
    "r13": 1,
    "r23": 2,
    "loaded": 3,
    "risp": 23,
}

LABEL = {
    "none": "無し",
    "r1": "1塁",
    "r2": "2塁",
    "r3": "3塁",
    "r12": "1-2塁",
    "r13": "1-3塁",
    "r23": "2-3塁",
    "loaded": "満塁",
    "risp": "得点圏",
}

SIT_TO_T = {
    "none": (0, 0, 0),
    "r1": (1, 0, 0),
    "r2": (0, 1, 0),
    "r3": (0, 0, 1),
    "r12": (1, 1, 0),
    "r13": (1, 0, 1),
    "r23": (0, 1, 1),
    "loaded": (1, 1, 1),
}


def parse_pa_id(pa_id: str):
    m = PAID_RE.match((pa_id or "").strip())
    if not m:
        return None
    return int(m.group(2)), m.group(3), int(m.group(4))


def score_prefix(inning: int, half: str, pa_seq: int) -> str:
    return f"{inning:02d}{'1' if half == '表' else '2'}{pa_seq:02d}"


def bases_from_em(html: str):
    m = RE_RESULT_EM.search(html or "")
    if not m or "ランナー" not in m.group(1):
        return None
    em = m.group(1).strip()
    if re.search(r"1\s*,\s*2\s*,\s*3|1,2,3塁|満塁", em):
        return (1, 1, 1)
    if re.search(r"1\s*,\s*2|1,2塁|一二塁", em):
        return (1, 1, 0)
    if re.search(r"1\s*,\s*3|1,3塁|一三塁", em):
        return (1, 0, 1)
    if re.search(r"2\s*,\s*3|2,3塁|二三塁", em):
        return (0, 1, 1)
    if "3塁" in em:
        return (0, 0, 1)
    if "2塁" in em:
        return (0, 1, 0)
    if "1塁" in em:
        return (1, 0, 0)
    return None


def bases_from_class(html: str):
    m = RE_BASE.search(html or "")
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def bases_parse(html: str, em_first: bool):
    if em_first:
        return bases_from_em(html) or bases_from_class(html)
    return bases_from_class(html) or bases_from_em(html)


def token_bases(token: str | None):
    if not token:
        return None
    tail = re.sub(r"^(無死|一死|二死|三死)", "", token)
    if "走者なし" in tail or tail == "":
        return (0, 0, 0)
    if "一二三塁" in tail or "満塁" in tail:
        return (1, 1, 1)
    if "一二塁" in tail:
        return (1, 1, 0)
    if "一三塁" in tail:
        return (1, 0, 1)
    if "二三塁" in tail:
        return (0, 1, 1)
    if "三塁" in tail:
        return (0, 0, 1)
    if "二塁" in tail:
        return (0, 1, 0)
    if "一塁" in tail:
        return (1, 0, 0)
    return (0, 0, 0)


def extract_token(line: str):
    m = re.match(r"^\d+[：:]\s*\d+番\s+(.+)$", (line or "").strip())
    if not m:
        return None
    parts = m.group(1).split()
    start = 2 if len(parts) >= 2 and not re.match(r"^(無死|一死|二死|三死)", parts[0]) else 0
    for t in parts[start:]:
        if re.match(r"^(無死|一死|二死|三死)", t):
            return t
    return None


def sit_key(t: tuple[int, int, int]) -> str:
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
    return "r3"


def is_risp_t(t: tuple[int, int, int]) -> bool:
    return bool(t[1]) or bool(t[2])


def agg_from_pairs(pairs: list[tuple[str, str]], risp_mode: str) -> dict[str, int]:
    """risp_mode: overlap | from_detail_only"""
    agg = {k: 0 for k in REF_PA}
    for detail, pa_id in pairs:
        agg[detail] += 1
    if risp_mode == "overlap":
        for detail, _ in pairs:
            if is_risp_t(SIT_TO_T[detail]):
                agg["risp"] += 1
    return agg


def end_bases(html: str):
    return bases_parse(html, True)


def build_chain_start_for_half(pa_ids: list[str], snap: dict) -> dict[str, tuple[int, int, int]]:
    """半回内全打席: 入口 em → なければ前打席終了 em+class。"""
    out: dict[str, tuple[int, int, int]] = {}
    prev = (0, 0, 0)
    for pa_id in pa_ids:
        parsed = parse_pa_id(pa_id)
        if not parsed:
            continue
        slot = snap.get(score_prefix(*parsed))
        first_html = (slot or {}).get("first") or ""
        em = bases_from_em(first_html)
        start = em if em is not None else prev
        out[pa_id] = start
        last_html = (slot or {}).get("last") or ""
        end = end_bases(last_html) if last_html else None
        if end is not None:
            prev = end
    return out


def load_snap(gid: str, prefixes: set[str]) -> dict:
    d = SCORE_DIR / gid
    if not d.is_dir():
        return {}
    by = {}
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


def l1_dist(agg: dict[str, int]) -> int:
    return sum(abs(agg.get(k, 0) - REF_PA[k]) for k in REF_PA)


def hirakawa_game_ids(play_lines: dict) -> list[str]:
    if DERIVED.is_file():
        doc = json.loads(DERIVED.read_text(encoding="utf-8"))
        ids = doc.get("source", {}).get("canonicalGames")
        if ids:
            return sorted(str(x) for x in ids)
    return sorted({p.split("-")[0] for p in play_lines})


def collect_all():
    if not PLAY_LINES.is_file():
        subprocess.run(["npx", "tsx", "scripts/export_hirakawa_play_lines.ts"], cwd=str(ROOT), check=True)
    play_lines = json.loads(PLAY_LINES.read_text(encoding="utf-8"))
    game_ids = hirakawa_game_ids(play_lines)

    per_pa: dict[str, dict] = {}

    for gid in game_ids:
        doc = json.loads((CANONICAL_DIR / f"{gid}.json").read_text(encoding="utf-8"))
        all_pas = sorted(
            doc.get("domain", {}).get("plateAppearances") or [],
            key=lambda p: parse_pa_id(p.get("paId", "")) or (0, "", 0),
        )
        target = [p for p in all_pas if str(p.get("yahooBatterId") or "").strip() == YAHOO]
        hirakawa_halfs: set[str] = set()
        for pa in target:
            parsed = parse_pa_id(pa.get("paId", ""))
            if parsed:
                hirakawa_halfs.add(f"{parsed[0]}-{parsed[1]}")

        half_groups: dict[str, list[str]] = {}
        for pa in all_pas:
            parsed = parse_pa_id(pa.get("paId", ""))
            if not parsed:
                continue
            hk = f"{parsed[0]}-{parsed[1]}"
            if hk not in hirakawa_halfs:
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
            line = play_lines.get(pa_id, "")
            tok = extract_token(line)
            tb = token_bases(tok)
            text_sit = sit_key(tb) if tb else None

            parsed = parse_pa_id(pa_id)
            slot = snap.get(score_prefix(*parsed)) if parsed else None
            first_t = last_t = None
            first_em = last_em = None
            if slot:
                first_t = bases_parse(slot["first"], False)
                last_t = bases_parse(slot["last"], False)
                first_em = bases_parse(slot["first"], True)
                last_em = bases_parse(slot["last"], True)

            cs = chain_start.get(pa_id)
            per_pa[pa_id] = {
                "result": (pa.get("resultSummaryJa") or "")[:30],
                "text": text_sit,
                "chain": sit_key(cs) if cs else None,
                "first": sit_key(first_t) if first_t else None,
                "last": sit_key(last_t) if last_t else None,
                "first_em": sit_key(first_em) if first_em else None,
                "last_em": sit_key(last_em) if last_em else None,
                "last_t": last_t,
                "text_t": tb,
                "chain_t": cs,
            }
    return per_pa


def main():
    per_pa = collect_all()
    n = len(per_pa)
    print(f"平川蓮 打席数: {n}\n")

    methods: dict[str, list[tuple[str, str]]] = {}
    for pa_id, row in per_pa.items():
        for key in ("text", "chain", "first", "last", "first_em", "last_em"):
            sit = row.get(key)
            if sit:
                methods.setdefault(key, []).append((sit, pa_id))

    # hybrid: text detail, risp if text or last has risp
    hybrid_te_risp = []
    for pa_id, row in per_pa.items():
        if not row.get("text"):
            continue
        hybrid_te_risp.append((row["text"], pa_id))

    agg_hybrid_risp = {k: 0 for k in REF_PA}
    for detail, _ in hybrid_te_risp:
        agg_hybrid_risp[detail] += 1
    agg_hybrid_risp["risp"] = sum(
        1
        for pa_id, row in per_pa.items()
        if row.get("text")
        and (
            is_risp_t(row["text_t"])
            or (row.get("last_t") and is_risp_t(row["last_t"]))
        )
    )

    # hybrid2: last detail, risp overlap from last
    hybrid2 = [(row["last"], pa_id) for pa_id, row in per_pa.items() if row.get("last")]

    # hybrid3: text for none/r1/loaded?, last for r2/risp? - skip brute

    print("公式REF | " + " | ".join(str(REF_PA[k]) for k in REF_PA))
    rows = [
        ("text_start", methods.get("text", [])),
        ("score_chain_start", methods.get("chain", [])),
        ("score_first_class", methods.get("first", [])),
        ("score_last_class", methods.get("last", [])),
        ("score_first_em+class", methods.get("first_em", [])),
        ("score_last_em+class", methods.get("last_em", [])),
    ]
    for name, pairs in rows:
        if not pairs:
            continue
        agg = agg_from_pairs(pairs, "overlap")
        print(f"{name:22} | " + " | ".join(str(agg[k]) for k in REF_PA) + f"  L1={l1_dist(agg)}")

    print(f"{'hybrid_text+risp_or_last':22} | " + " | ".join(str(agg_hybrid_risp[k]) for k in REF_PA) + f"  L1={l1_dist(agg_hybrid_risp)}")

    agg2 = agg_from_pairs(hybrid2, "overlap")
    print(f"{'last_class_only':22} | " + " | ".join(str(agg2[k]) for k in REF_PA) + f"  L1={l1_dist(agg2)}")

    if DERIVED.is_file():
        doc = json.loads(DERIVED.read_text(encoding="utf-8"))
        dagg = {k: 0 for k in REF_PA}
        for row in doc.get("rows") or []:
            if row.get("split_type") == "base_sit" and row.get("split_value") in REF_PA:
                dagg[row["split_value"]] = int(row.get("pa") or 0)
        print(f"{'derived_pitch_pbp':22} | " + " | ".join(str(dagg[k]) for k in REF_PA) + f"  L1={l1_dist(dagg)}")

    # Fix gaps for last_class vs ref
    last_map = {p: per_pa[p]["last"] for p in per_pa if per_pa[p].get("last")}
    text_map = {p: per_pa[p]["text"] for p in per_pa if per_pa[p].get("text")}

    print("\n=== 公式に合わせる差分分析 (REF vs score_last_class) ===")
    for k in REF_PA:
        cnt = sum(1 for s in last_map.values() if s == k)
        if cnt != REF_PA[k]:
            print(f"  {LABEL[k]}: last={cnt} REF={REF_PA[k]} Δ{cnt-REF_PA[k]}")

    print("\n1塁が足りない(REF15 > last13): text=1塁だがlast≠1塁")
    for pa_id in sorted(per_pa):
        if text_map.get(pa_id) == "r1" and last_map.get(pa_id) != "r1":
            r = per_pa[pa_id]
            print(f"  {pa_id} last={r.get('last')} text={r.get('text')} {r.get('result')}")

    print("\n1塁が多い(last>REF): last=1塁だがtext≠1塁")
    for pa_id in sorted(per_pa):
        if last_map.get(pa_id) == "r1" and text_map.get(pa_id) != "r1":
            r = per_pa[pa_id]
            print(f"  {pa_id} last={r.get('last')} text={r.get('text')} {r.get('result')}")

    print("\n無し: REF47 last48 → last=無しでtext≠無し")
    for pa_id in sorted(per_pa):
        if last_map.get(pa_id) == "none" and text_map.get(pa_id) != "none":
            r = per_pa[pa_id]
            print(f"  {pa_id} last=無し text={r.get('text')} {r.get('result')}")

    print("\n2塁: REF8 last11 → last=2塁でtextが別")
    for pa_id in sorted(per_pa):
        if last_map.get(pa_id) == "r2" and text_map.get(pa_id) != "r2":
            r = per_pa[pa_id]
            print(f"  {pa_id} last=2塁 text={r.get('text')} {r.get('result')}")

    print("\n満塁: REF3 last2")
    for pa_id in sorted(per_pa):
        if text_map.get(pa_id) == "loaded" and last_map.get(pa_id) != "loaded":
            print(f"  {pa_id} last={last_map.get(pa_id)} text=満塁")

    # 打席中進塁: text≠last のとき公式はどちらか
    for rule_name, pick in [
        ("pick_text_if_diff", lambda t, l, c: t if t and l and t != l else (l or t)),
        ("pick_chain_if_diff", lambda t, l, c: c if c and l and c != l else (l or c or t)),
        ("pick_last_if_diff", lambda t, l, c: l or t or c),
        ("detail=text risp=OR", None),
    ]:
        pairs = []
        for pa_id, row in per_pa.items():
            t, l, c = row.get("text"), row.get("last"), row.get("chain")
            if rule_name == "detail=text risp=OR":
                if not t:
                    continue
                pairs.append((t, pa_id))
            elif not (t or l or c):
                continue
            else:
                sit = pick(t, l, c)
                if sit:
                    pairs.append((sit, pa_id))
        if rule_name == "detail=text risp=OR":
            agg_r = agg_from_pairs(pairs, "overlap")
            agg_r["risp"] = sum(
                1
                for pa_id, row in per_pa.items()
                if row.get("text")
                and (
                    is_risp_t(row["text_t"])
                    or (row.get("last_t") and is_risp_t(row["last_t"]))
                    or (row.get("chain_t") and is_risp_t(row["chain_t"]))
                )
            )
            print(f"{rule_name:22} | " + " | ".join(str(agg_r[k]) for k in REF_PA) + f"  L1={l1_dist(agg_r)}")
        else:
            agg_r = agg_from_pairs(pairs, "overlap")
            print(f"{rule_name:22} | " + " | ".join(str(agg_r[k]) for k in REF_PA) + f"  L1={l1_dist(agg_r)}")

    # 完全一致探索: 各打席で {text,chain,first,last} から1つ選ぶ（4^84 は無理 → 差分打席のみ分岐）
    diff_pas = [
        pa_id
        for pa_id, row in per_pa.items()
        if len({row.get(k) for k in ("text", "chain", "first", "last") if row.get(k)}) > 1
    ]
    print(f"\n候補が複数ある打席: {len(diff_pas)} / {len(per_pa)}")


if __name__ == "__main__":
    main()
