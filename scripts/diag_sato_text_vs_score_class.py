#!/usr/bin/env python3
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
lines = json.loads((ROOT / "_data/diag_sato_play_lines.json").read_text(encoding="utf-8"))
RE_BASE = re.compile(r'id="base"\s+class="b(\d)(\d)(\d)"')
PAID = re.compile(r"^(\d+)-(\d+)-(表|裏)-(\d+)$")


def sit(t):
    r1, r2, r3 = bool(t[0]), bool(t[1]), bool(t[2])
    if not (r1 or r2 or r3):
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


def tok_bases(token):
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


def load_html(g, p):
    d = ROOT / "_data/scraped_games/raw_sportsnavi_score" / g
    best = None
    for f in d.glob("*.html"):
        if f.stem[:5] == p and (best is None or f.stem < best):
            best = f.stem
    return (d / f"{best}.html").read_text(encoding="utf-8", errors="replace") if best else ""


for pa_id, line in sorted(lines.items()):
    m = PAID.match(pa_id)
    if not m:
        continue
    gid, inn, half, seq = m.group(1), int(m.group(2)), m.group(3), int(m.group(4))
    p = f"{inn:02d}{'1' if half == '表' else '2'}{seq:02d}"
    html = load_html(gid, p)
    bm = RE_BASE.search(html)
    if not bm:
        continue
    bc = tuple(int(bm.group(i)) for i in range(1, 4))
    tm = re.match(r"^\d+[：:]\s*\d+番\s+(.+)$", line.strip())
    if not tm:
        continue
    parts = tm.group(1).split()
    start = 2 if len(parts) >= 2 and not re.match(r"^(無死|一死|二死|三死)", parts[0]) else 0
    tkn = None
    for t in parts[start:]:
        if re.match(r"^(無死|一死|二死|三死)", t):
            tkn = t
            break
    if not tkn:
        continue
    tb = tok_bases(tkn)
    if sit(tb) != sit(bc):
        print(pa_id, tkn, sit(tb), f"b{bc[0]}{bc[1]}{bc[2]}", sit(bc))
print("mismatch count done")
