#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""佐藤: 【B】score入口 vs テキスト実況の塁不一致を列挙。"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
YAHOO = "2000051"
SCORE_DIR = ROOT / "_data" / "scraped_games" / "raw_sportsnavi_score"
CANONICAL_DIR = ROOT / "_data" / "scraped_games" / "canonical"
TEXT_DIR = ROOT / "_data" / "scraped_games" / "raw_sportsnavi_text"

RE_BASE = re.compile(r'id="base"\s+class="b(\d)(\d)(\d)"')
RE_RESULT_SPAN = re.compile(r'<div id="result">\s*<span>([^<]*)</span>', re.I)
PAID_RE = re.compile(r"^(\d+)-(\d+)-(表|裏)-(\d+)$")

SIT_LABEL = {
    "none": "無し",
    "r1": "1塁",
    "r2": "2塁",
    "r3": "3塁",
    "r12": "1-2塁",
    "r13": "1-3塁",
    "r23": "2-3塁",
    "loaded": "満塁",
}


def parse_pa_id(pa_id: str):
    m = PAID_RE.match((pa_id or "").strip())
    if not m:
        return None
    return m.group(1), int(m.group(2)), m.group(3), int(m.group(4))


def score_prefix(inning: int, half: str, pa_seq: int) -> str:
    tb = "1" if half == "表" else "2"
    return f"{inning:02d}{tb}{pa_seq:02d}"


def bases_from_class(html: str):
    m = RE_BASE.search(html or "")
    if not m:
        return None
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)))


def sit_key(t):
    if not t:
        return None
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


def bases_from_text_token(token: str):
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


def extract_token_from_play_line(line: str):
    line = (line or "").strip()
    m = re.match(r"^\d+[：:]\s*\d+番\s+(.+)$", line)
    if not m:
        return None
    tokens = m.group(1).split()
    start = 0
    if len(tokens) >= 2 and not re.match(r"^(無死|一死|二死|三死)", tokens[0]):
        start = 2
    for t in tokens[start:]:
        if re.match(r"^(無死|一死|二死|三死)", t):
            return t
    return None


def load_play_lines(game_id: str) -> dict[str, str]:
    p = TEXT_DIR / f"{game_id}.html"
    if not p.is_file():
        return {}
    html = p.read_text(encoding="utf-8", errors="replace")
    out: dict[str, str] = {}
    # bb-liveText 行から pa 番号と状況を拾う（簡易）
    for m in re.finditer(
        r"(\d+)[：:]\s*(\d+)番[^<]*<[^>]*>([^<]{0,80})",
        html,
    ):
        pass
    # canonical 補完と同様: 数字：数字番 で始まるプレーンテキスト塊
    plain = re.sub(r"<[^>]+>", " ", html)
    for m in re.finditer(
        r"(\d+)\s*[：:]\s*(\d+)番\s+((?:無死|一死|二死|三死)[^\n]{0,40})",
        plain,
    ):
        seq = int(m.group(1))
        snippet = m.group(3).strip()
        token = extract_token_from_play_line(f"{seq}： {m.group(2)}番 {snippet}")
        if not token:
            continue
        # half はファイルから取れないので paId マッチは canonical 側で行う
        out[str(seq)] = token
    return out


def first_last_html(game_id: str, prefix: str):
    d = SCORE_DIR / game_id
    if not d.is_dir():
        return None, None, None, None
    first_idx = last_idx = None
    for name in d.iterdir():
        if not name.name.endswith(".html"):
            continue
        idx = name.stem
        if len(idx) != 7 or not idx.isdigit() or idx[:5] != prefix:
            continue
        if first_idx is None or idx < first_idx:
            first_idx = idx
        if last_idx is None or idx > last_idx:
            last_idx = idx
    if not first_idx:
        return None, None, None, None
    fhtml = (d / f"{first_idx}.html").read_text(encoding="utf-8", errors="replace")
    lhtml = (d / f"{last_idx}.html").read_text(encoding="utf-8", errors="replace")
    fspan = RE_RESULT_SPAN.search(fhtml)
    lspan = RE_RESULT_SPAN.search(lhtml)
    return first_idx, fhtml, last_idx, (fspan.group(1) if fspan else ""), (lspan.group(1) if lspan else "")


def build_text_map_from_canonical(doc: dict) -> dict[str, str]:
    """game text html から paId キーで実況行を引く（supplement と同ロジック簡略）"""
    gid = doc.get("gameId") or ""
    p = TEXT_DIR / f"{gid}.html"
    if not p.is_file():
        return {}
    html = p.read_text(encoding="utf-8", errors="replace")
    plain = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    plain = re.sub(r"<style[\s\S]*?</style>", " ", plain, flags=re.I)
    plain = re.sub(r"<[^>]+>", "\n", plain)
    lines = [ln.strip() for ln in plain.splitlines() if ln.strip()]

    # paId -> line: 半回ごとに seq でマッチ
    pas = sorted(
        doc.get("domain", {}).get("plateAppearances") or [],
        key=lambda x: parse_pa_id(x.get("paId", "")) or ("", 0, "", 0),
    )
    by_half: dict[str, list] = {}
    for pa in pas:
        parsed = parse_pa_id(pa.get("paId", ""))
        if not parsed:
            continue
        _, inn, half, seq = parsed
        by_half.setdefault(f"{inn}-{half}", []).append((seq, pa["paId"]))

    out: dict[str, str] = {}
    half_line_buckets: dict[str, list[str]] = {}
    for ln in lines:
        m = re.match(r"^(\d+)\s*[：:]\s*(\d+)番\s+(.+)$", ln)
        if not m:
            continue
        seq = int(m.group(1))
        rest = m.group(3)
        # 半回は直前の見出しが無いので canonical の seq 順で割当
        for hk, plist in by_half.items():
            seqs = [s for s, _ in plist]
            if seq in seqs:
                half_line_buckets.setdefault(hk, []).append((seq, ln))
                break

    for hk, items in by_half.items():
        items_sorted = sorted(items)
        play_lines = sorted(half_line_buckets.get(hk, []))
        for i, (_, pa_id) in enumerate(items_sorted):
            if i < len(play_lines):
                out[pa_id] = play_lines[i][1]
    return out


def main():
    mismatches: list[dict] = []
    agree = 0
    total = 0
    drift = Counter()  # (text, score) -> count

    for cp in sorted(CANONICAL_DIR.glob("*.json")):
        raw = cp.read_text(encoding="utf-8", errors="ignore")
        if f'"yahooBatterId": "{YAHOO}"' not in raw:
            continue
        doc = json.loads(cp.read_text(encoding="utf-8"))
        gid = doc.get("gameId") or cp.stem
        text_map = build_text_map_from_canonical(doc)

        for pa in doc.get("domain", {}).get("plateAppearances") or []:
            if str(pa.get("yahooBatterId") or "").strip() != YAHOO:
                continue
            parsed = parse_pa_id(pa.get("paId", ""))
            if not parsed:
                continue
            _, inn, half, seq = parsed
            prefix = score_prefix(inn, half, seq)
            total += 1

            play_line = text_map.get(pa["paId"], "")
            token = extract_token_from_play_line(play_line)
            tb = bases_from_text_token(token) if token else None
            text_sit = sit_key(tb) if tb is not None else None

            fi, fhtml, li, fresult, lresult = first_last_html(gid, prefix)
            sb = bases_from_class(fhtml or "")
            score_sit = sit_key(sb) if sb else None
            lb = bases_from_class((SCORE_DIR / gid / f"{li}.html").read_text(encoding="utf-8", errors="replace") if li else "")

            if text_sit and score_sit:
                if text_sit == score_sit:
                    agree += 1
                else:
                    drift[(text_sit, score_sit)] += 1
                    mismatches.append(
                        {
                            "paId": pa["paId"],
                            "gameId": gid,
                            "index_first": fi,
                            "index_last": li,
                            "result": pa.get("resultSummaryJa"),
                            "text_token": token,
                            "text_sit": text_sit,
                            "score_sit": score_sit,
                            "score_class": f"b{sb[0]}{sb[1]}{sb[2]}" if sb else None,
                            "last_class": f"b{lb[0]}{lb[1]}{lb[2]}" if lb else None,
                            "first_result_span": fresult[:40],
                            "last_result_span": lresult[:40],
                        }
                    )

    print(f"Sato PA with both text+score sit: {total}")
    print(f"Agree: {agree} | Mismatch: {len(mismatches)}")
    print("\nDrift matrix (text -> score):")
    for (t, s), c in drift.most_common(20):
        print(f"  {SIT_LABEL.get(t,t)} -> {SIT_LABEL.get(s,s)}: {c}")

    print("\nSample mismatches (up to 15):")
    for m in mismatches[:15]:
        print(
            f"  {m['paId']} | text={m['text_token']}({m['text_sit']}) "
            f"score={m['score_class']}({m['score_sit']}) "
            f"idx {m['index_first']} span={m['first_result_span']!r} "
            f"| last={m['last_class']} {m['last_result_span']!r}"
        )

    # 参照との差: text が 1塁で score が 無し / 逆
    print("\nLikely causes:")
    r1_to_none = drift.get(("r1", "none"), 0)
    none_to_r1 = drift.get(("none", "r1"), 0)
    risp_text_r1 = sum(c for (t, s), c in drift.items() if t in ("r2", "r3", "r12", "r13", "r23", "loaded") and s == "r1")
    print(f"  text 1塁 -> score 無し: {r1_to_none}")
    print(f"  text 無し -> score 1塁: {none_to_r1}")
    print(f"  text 得点圏系 -> score 1塁のみ: {risp_text_r1}")


if __name__ == "__main__":
    main()
