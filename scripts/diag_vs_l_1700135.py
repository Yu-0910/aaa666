"""List vs-LHP plate appearances for a Yahoo batter (canonical + bridge + roster)."""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_throw_by_npb() -> dict[str, str]:
    p = ROOT / "_data" / "npb_roster_2026.csv"
    m: dict[str, str] = {}
    lines = p.read_text(encoding="utf-8").splitlines()
    header = lines[0].split(",")
    idx_id = header.index("npb_player_id")
    idx_th = header.index("throw_hand")
    for line in lines[1:]:
        c = line.split(",")
        if len(c) <= idx_th:
            continue
        pid = c[idx_id].strip()
        th = c[idx_th].strip().upper()
        if th in ("R", "L"):
            m[pid] = th
    return m


def last_result(pa: dict) -> str:
    pe = pa.get("pitchEvents") or []
    last = pe[-1] if pe else None
    a = (pa.get("resultSummaryJa") or "").strip()
    b = (last.get("resultJa") or "").strip() if last else ""
    return a or b


def yahoo_pitcher_last(pa: dict) -> str:
    for e in reversed(pa.get("pitchEvents") or []):
        i = str(e.get("yahooPitcherId") or "").strip()
        if i:
            return i
    return str(pa.get("yahooPitcherId") or "").strip()


def is_walk(s: str) -> bool:
    return bool(re.search(r"四球|敬遠|故意四球|申告敬遠|フォアボール|ボールフォー", s))


def is_hbp(s: str) -> bool:
    return "死球" in s


def is_sac_bunt(s: str) -> bool:
    return bool(re.search(r"犠打|送りバント", s))


def is_sac_fly(s: str) -> bool:
    return bool(re.search(r"犠飛|犠牲フライ|犠牲飛", s))


def is_at_bat(s: str) -> bool:
    if not s:
        return False
    if is_walk(s) or is_hbp(s) or is_sac_bunt(s) or is_sac_fly(s):
        return False
    return True


def main() -> None:
    bid = (sys.argv[1] if len(sys.argv) > 1 else "1700135").strip()
    want = (sys.argv[2] if len(sys.argv) > 2 else "L").strip().upper()
    bridge_path = ROOT / "_data" / "scraped_games" / "derived" / "yahoo_pitcher_to_npb.json"
    bridge: dict[str, str] = json.loads(bridge_path.read_text(encoding="utf-8"))
    throw = load_throw_by_npb()
    splits_path = ROOT / "_data" / "derived" / "player_season_batting_splits" / "2026" / f"yahoo_{bid}.json"
    games = json.loads(splits_path.read_text(encoding="utf-8"))["source"]["canonicalGames"]
    canonical_dir = ROOT / "_data" / "scraped_games" / "canonical"
    rows: list[dict] = []
    pa = ab = sh = sf = bb = hbp = 0
    for gid in games:
        fp = canonical_dir / f"{gid}.json"
        if not fp.is_file():
            continue
        doc = json.loads(fp.read_text(encoding="utf-8"))
        for p in doc.get("domain", {}).get("plateAppearances", []):
            if str(p.get("yahooBatterId") or "").strip() != bid:
                continue
            rt = last_result(p)
            if not rt:
                continue
            ypid = yahoo_pitcher_last(p)
            npb = str(bridge.get(ypid) or "").strip()
            th = throw.get(npb, "") if npb else ""
            if th != want:
                continue
            pa += 1
            if is_walk(rt):
                bb += 1
            if is_hbp(rt):
                hbp += 1
            if is_sac_bunt(rt):
                sh += 1
            if is_sac_fly(rt):
                sf += 1
            if is_at_bat(rt):
                ab += 1
            rows.append(
                {
                    "game": gid,
                    "paId": p.get("paId"),
                    "pitcherYahoo": ypid,
                    "pitcherNpb": npb or None,
                    "resultSummaryJa": rt,
                    "ab": 1 if is_at_bat(rt) else 0,
                    "sh": 1 if is_sac_bunt(rt) else 0,
                    "sf": 1 if is_sac_fly(rt) else 0,
                }
            )
    rows.sort(key=lambda x: str(x.get("paId") or ""))
    out = {
        "batter": bid,
        "pitcherThrow": want,
        "totals": {"pa": pa, "ab": ab, "sh": sh, "sf": sf, "bb": bb, "hbp": hbp},
        "rows": rows,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
