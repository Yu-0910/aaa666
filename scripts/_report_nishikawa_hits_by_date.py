"""西川龍馬（Yahoo 1500096）日別安打集計 — canonical plateAppearances"""
import json
import re
from pathlib import Path

Y = "1500096"
ROOT = Path(__file__).resolve().parent.parent
CANON = ROOT / "_data" / "scraped_games" / "canonical"


def is_walk(s: str) -> bool:
    return bool(re.search(r"四球|敬遠|故意四|故意四球|申告敬遠|フォアボール|ボールフォー", s))


def is_hbp(s: str) -> bool:
    return bool(re.search(r"死球", s))


def is_sac_bunt(s: str) -> bool:
    return bool(re.search(r"犠打|送りバント", s))


def is_sac_fly(s: str) -> bool:
    return bool(re.search(r"犠飛", s))


def last_pitch_result(pa: dict) -> str:
    pe = pa.get("pitchEvents") or []
    last = pe[-1] if pe else None
    r = (pa.get("resultSummaryJa") or "").strip()
    if r:
        return r
    return str((last or {}).get("resultJa") or "").strip()


def hit_bases(result: str) -> int:
    if re.search(r"本塁打|ホームラン|HR", result):
        return 4
    if re.search(r"左中本|右中本|左本|右本|中本(?:\[|$)", result):
        return 4
    if re.search(r"三塁打|左３|中３|右３|左3|中3|右3", result):
        return 3
    if re.search(r"二塁打|左２|中２|右２|左2|中2|右2", result):
        return 2
    if re.search(r"内安|内野安打", result):
        return 1
    if re.search(r"二安", result):
        return 1
    if re.search(r"三安", result):
        return 1
    if re.search(r"安打|ヒット|左安|中安|右安|遊安|投安", result):
        return 1
    return 0


def is_at_bat(result: str) -> bool:
    if not result:
        return False
    if is_walk(result) or is_hbp(result) or is_sac_bunt(result) or is_sac_fly(result):
        return False
    if re.search(r"妨害", result):
        return False
    return True


def is_hit_pa(pa: dict) -> bool:
    r = last_pitch_result(pa)
    return is_at_bat(r) and hit_bases(r) > 0


def game_date_iso(doc: dict) -> str | None:
    meta = (doc.get("game") or {}).get("meta") or {}
    title = meta.get("documentTitle") or meta.get("ogTitle") or ""
    m = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", title)
    if not m:
        return None
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def main() -> None:
    by_date: dict[str, int] = {}
    detail: list[dict] = []
    for p in sorted(CANON.glob("*.json")):
        doc = json.loads(p.read_text(encoding="utf-8"))
        gid = doc.get("gameId") or p.stem
        pas = (doc.get("domain") or {}).get("plateAppearances") or []
        hits = 0
        for pa in pas:
            if str(pa.get("yahooBatterId") or "").strip() != Y:
                continue
            if is_hit_pa(pa):
                hits += 1
        if hits == 0:
            continue
        d = game_date_iso(doc)
        if not d:
            continue
        by_date[d] = by_date.get(d, 0) + hits
        detail.append({"gameId": gid, "date": d, "hitsInGame": hits})
    rows = [{"日付": d, "安打数": by_date[d]} for d in sorted(by_date)]
    total = sum(by_date.values())
    out = {
        "選手": "西川 龍馬",
        "球団": "オリックス",
        "yahooBatterId": Y,
        "日付別": rows,
        "安打合計": total,
        "試合別": sorted(detail, key=lambda x: (x["date"], x["gameId"])),
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
