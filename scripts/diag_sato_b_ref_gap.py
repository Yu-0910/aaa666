#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""参照との差: score[B] vs text 塁一致のうえ、結果フィルタ・公式差を分解。"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
YAHOO = "2000051"
CANONICAL_DIR = ROOT / "_data" / "scraped_games" / "canonical"
SCORE_DIR = ROOT / "_data" / "scraped_games" / "raw_sportsnavi_score"
TEXT_DIR = ROOT / "_data" / "scraped_games" / "raw_sportsnavi_text"

RE_BASE = re.compile(r'id="base"\s+class="b(\d)(\d)(\d)"')
PAID_RE = re.compile(r"^(\d+)-(\d+)-(表|裏)-(\d+)$")


def parse_pa_id(pa_id):
    m = PAID_RE.match((pa_id or "").strip())
    if not m:
        return None
    return int(m.group(2)), m.group(3), int(m.group(4))


def score_prefix(inning, half, seq):
    return f"{inning:02d}{'1' if half == '表' else '2'}{seq:02d}"


def bases_from_class(html):
    m = RE_BASE.search(html or "")
    if not m:
        return None
    return tuple(int(m.group(i)) for i in range(1, 4))


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


def token_from_line(line):
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


def bases_from_token(token):
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


def load_first_html(game_id, prefix):
    d = SCORE_DIR / game_id
    if not d.is_dir():
        return None
    best = None
    for name in d.iterdir():
        if name.suffix != ".html":
            continue
        idx = name.stem
        if len(idx) == 7 and idx.isdigit() and idx[:5] == prefix:
            if best is None or idx < best:
                best = idx
    if not best:
        return None
    return (d / f"{best}.html").read_text(encoding="utf-8", errors="replace")


# minimal play line map: invoke node for buildPaIdToSportsnaviPlayLineMap is heavy; read from text via subprocess output file
# Instead: use canonical only + run ts once to export lines
PLAY_LINES_CACHE = ROOT / "_data" / "diag_sato_play_lines.json"


def main():
    import subprocess
    if not PLAY_LINES_CACHE.is_file():
        subprocess.run(
            [
                "npx",
                "tsx",
                "-e",
                """
import { writeFileSync } from 'fs';
import { join } from 'path';
import { buildPaIdToSportsnaviPlayLineMap } from './lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay';
const root = process.cwd();
const Y = '2000051';
const out = {};
for (const f of require('fs').readdirSync(join(root,'_data/scraped_games/canonical'))) {
  if (!f.endsWith('.json')) continue;
  const raw = require('fs').readFileSync(join(root,'_data/scraped_games/canonical',f),'utf8');
  if (!raw.includes('"yahooBatterId": "'+Y+'"')) continue;
  const doc = JSON.parse(raw);
  const m = buildPaIdToSportsnaviPlayLineMap(doc);
  for (const pa of doc.domain?.plateAppearances ?? []) {
    if (String(pa.yahooBatterId).trim() !== Y) continue;
    const line = m.get(pa.paId);
    if (line) out[pa.paId] = line;
  }
}
writeFileSync(join(root,'_data/diag_sato_play_lines.json'), JSON.stringify(out));
console.log('lines', Object.keys(out).length);
""",
            ],
            cwd=str(ROOT),
            check=True,
            timeout=120000,
        )

    play_lines = json.loads(PLAY_LINES_CACHE.read_text(encoding="utf-8"))

    by_sit_b = {}
    by_sit_text_all = {}
    by_sit_text_with_result = {}

    no_result_pas = []

    for cp in sorted(CANONICAL_DIR.glob("*.json")):
        if f'"yahooBatterId": "{YAHOO}"' not in cp.read_text(encoding="utf-8", errors="ignore"):
            continue
        doc = json.loads(cp.read_text(encoding="utf-8"))
        gid = doc.get("gameId") or cp.stem
        for pa in doc.get("domain", {}).get("plateAppearances") or []:
            if str(pa.get("yahooBatterId") or "").strip() != YAHOO:
                continue
            parsed = parse_pa_id(pa.get("paId", ""))
            if not parsed:
                continue
            inn, half, seq = parsed
            prefix = score_prefix(inn, half, seq)
            html = load_first_html(gid, prefix)
            sb = bases_from_class(html or "")
            if not sb:
                continue
            sk = sit_key(sb)
            by_sit_b[sk] = by_sit_b.get(sk, 0) + 1

            line = play_lines.get(pa["paId"], "")
            tok = token_from_line(line)
            tb = bases_from_token(tok)
            if tb is None:
                continue
            tk = sit_key(tb)
            by_sit_text_all[tk] = by_sit_text_all.get(tk, 0) + 1

            result = (pa.get("resultSummaryJa") or "").strip()
            if not result:
                no_result_pas.append(
                    {"paId": pa["paId"], "text_sit": tk, "score_sit": sk, "line": line[:80]}
                )
                continue
            by_sit_text_with_result[tk] = by_sit_text_with_result.get(tk, 0) + 1

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

    def risp_keys(sk):
        return sk in ("r2", "r3", "r12", "r13", "r23", "loaded")

    def risp_count(d):
        return sum(d.get(k, 0) for k in d if risp_keys(k))

    print("PA buckets (bases source):")
    print("  score[B] first class:", dict(sorted(by_sit_b.items())))
    print("  text token (all 225):", dict(sorted(by_sit_text_all.items())))
    print("  text token (result non-empty only):", dict(sorted(by_sit_text_with_result.items())))
    print(f"\nno resultSummaryJa: {len(no_result_pas)}")
    for x in no_result_pas:
        print(f"  {x['paId']} text={x['text_sit']} score={x['score_sit']} | {x['line']!r}")

    print("\nvs REF (dPA):")
    for label, d in [
        ("score[B]", by_sit_b),
        ("text+result", by_sit_text_with_result),
        ("text all", by_sit_text_all),
    ]:
        print(f"  {label}:")
        for k in REF:
            if k == "risp":
                c = risp_count(d)
            else:
                c = d.get(k, 0)
            print(f"    {k}: {c} (ref {REF[k]}, d {c-REF[k]:+d})")


if __name__ == "__main__":
    main()
