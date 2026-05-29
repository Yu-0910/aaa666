"""レイエス（Yahoo 1860140）日別打数 — 出場成績スロット（appearance_slots）集計"""
import json
import re
from pathlib import Path

Y = "1860140"
ROOT = Path(__file__).resolve().parent.parent
CANON = ROOT / "_data" / "scraped_games" / "canonical"
STATS_START = 14


def is_walk(s: str) -> bool:
    return bool(re.search(r"四球|敬遠|故意四|故意四球|申告敬遠|フォアボール|ボールフォー", s))


def is_hbp(s: str) -> bool:
    return bool(re.search(r"死球", s))


def is_sac_bunt(s: str) -> bool:
    return bool(re.search(r"犠打|送りバント|セーフティスクイズ|スクイズ|犠野", s))


def is_sac_fly(s: str) -> bool:
    return bool(re.search(r"犠飛|犠牲フライ|犠牲飛", s))


def is_at_bat(result: str) -> bool:
    if not result:
        return False
    if is_walk(result) or is_hbp(result) or is_sac_bunt(result) or is_sac_fly(result):
        return False
    if re.search(r"妨害", result):
        return False
    return True


def appearance_slots(doc: dict, yahoo_id: str) -> list[str]:
    bid = yahoo_id.strip()
    out: list[str] = []
    for line in (doc.get("domain") or {}).get("battingLines") or []:
        if str(line.get("yahooPlayerId") or "").strip() != bid:
            continue
        slots = line.get("appearancePaSlotsJa")
        if isinstance(slots, list) and any(str(x or "").strip() for x in slots):
            out.extend(str(x or "").strip() for x in slots)
            return out
    for row in (doc.get("game") or {}).get("statsPlayerLinkedRows") or []:
        if str(row.get("yahooPlayerId") or "").strip() != bid:
            continue
        cells = row.get("cells") or []
        if len(cells) <= STATS_START:
            return []
        return [str(c or "").strip() for c in cells[STATS_START:]]
    return []


def game_date_iso(doc: dict) -> str | None:
    meta = (doc.get("game") or {}).get("meta") or {}
    title = meta.get("documentTitle") or meta.get("ogTitle") or ""
    m = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", title)
    if not m:
        return None
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def ab_from_slots(slots: list[str]) -> int:
    ab = 0
    for raw in slots:
        t = str(raw or "").strip()
        if not t:
            continue
        if is_at_bat(t):
            ab += 1
    return ab


def main() -> None:
    by_date: dict[str, int] = {}
    detail: list[dict] = []
    for p in sorted(CANON.glob("*.json")):
        doc = json.loads(p.read_text(encoding="utf-8"))
        gid = doc.get("gameId") or p.stem
        slots = appearance_slots(doc, Y)
        if not any(str(s or "").strip() for s in slots):
            continue
        ab = ab_from_slots(slots)
        d = game_date_iso(doc)
        if not d:
            continue
        by_date[d] = by_date.get(d, 0) + ab
        detail.append({"gameId": gid, "date": d, "abInGame": ab, "paInGame": sum(1 for s in slots if str(s or "").strip())})
    rows = [{"日付": d, "打数": by_date[d]} for d in sorted(by_date)]
    total = sum(by_date.values())
    out = {
        "選手": "レイエス",
        "yahooBatterId": Y,
        "集計": "出場成績スロット（appearance_slots）",
        "日付別": rows,
        "打数合計": total,
        "試合別": sorted(detail, key=lambda x: (x["date"], x["gameId"])),
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
