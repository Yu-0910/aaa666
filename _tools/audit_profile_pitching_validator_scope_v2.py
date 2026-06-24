import csv
import json
import re
from pathlib import Path
from collections import defaultdict

ROOT = Path(".")
NUM_RE = re.compile(r"^\d{5,10}$")

PROFILE_DIR = ROOT / "_data/derived/player_profile/profile_npb"
RANKING_DIRS = [
    ROOT / "public/data/rankings/pitching",
    ROOT / "public/data/rankings",
]
MASTER_DIR = ROOT / "_data/master_csv"
OUT = ROOT / "_reports/validate_profile_vs_pitching_scope_audit_v2.csv"

YAHOO_HINT_RE = re.compile(r"(yahoo|sportsnavi|sports_navi|sports-navi)", re.I)

DIRECT_ID_KEYS = {
    "yahoo_player_id",
    "yahooPlayerId",
    "yahoo_id",
    "yahooId",
    "sportsnavi_player_id",
    "sportsNaviPlayerId",
    "sports_navi_player_id",
    "sportsNaviId",
}

ID_VALUE_KEYS = {
    "id",
    "value",
    "player_id",
    "playerId",
    "yahoo_id",
    "yahooId",
    "sportsnavi_player_id",
    "sportsNaviPlayerId",
}

HINT_KEYS = {
    "source",
    "provider",
    "type",
    "kind",
    "service",
    "site",
    "platform",
}

NAME_KEYS = {
    "name",
    "name_ja",
    "player_name",
    "player_name_ja",
    "playerName",
    "playerNameJa",
    "display_name",
}

def load_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))

def walk(obj):
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from walk(v)
    elif isinstance(obj, list):
        for x in obj:
            yield from walk(x)

def as_id(v):
    if v is None:
        return ""
    s = str(v).strip()
    return s if NUM_RE.match(s) else ""

def dict_has_yahoo_hint(d):
    for k, v in d.items():
        if YAHOO_HINT_RE.search(str(k)) or YAHOO_HINT_RE.search(str(v)):
            return True
    return False

def pick_yahoo_ids_from_json(data):
    ids = []

    for d in walk(data):
        # 1. key名そのものが yahoo / sportsnavi 系
        for k, v in d.items():
            if k in DIRECT_ID_KEYS or YAHOO_HINT_RE.search(str(k)):
                pid = as_id(v)
                if pid:
                    ids.append(pid)

        # 2. 同じdict内に source/provider: yahoo があり、id/value に数値がある
        if dict_has_yahoo_hint(d):
            for k in ID_VALUE_KEYS:
                pid = as_id(d.get(k))
                if pid:
                    ids.append(pid)

        # 3. ids / sourceIds / externalIds 的な入れ子に対応
        for k, v in d.items():
            if YAHOO_HINT_RE.search(str(k)):
                if isinstance(v, str):
                    pid = as_id(v)
                    if pid:
                        ids.append(pid)
                elif isinstance(v, dict):
                    for kk in ID_VALUE_KEYS:
                        pid = as_id(v.get(kk))
                        if pid:
                            ids.append(pid)

    # 重複除去
    out = []
    seen = set()
    for x in ids:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out

def pick_name(data):
    for d in walk(data):
        for k in NAME_KEYS:
            v = d.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return ""

def collect_profile_rows():
    rows = []

    if not PROFILE_DIR.exists():
        print(f"[WARN] missing: {PROFILE_DIR}")
        return rows

    for p in sorted(PROFILE_DIR.glob("*.json")):
        try:
            data = load_json(p)
        except Exception as e:
            print(f"[WARN] failed to read {p}: {e}")
            continue

        yahoo_ids = pick_yahoo_ids_from_json(data)
        npb_id = p.stem.replace("npb_", "")
        name = pick_name(data)

        for yahoo_id in yahoo_ids:
            rows.append({
                "profile_file": p.name,
                "npb_id": npb_id,
                "yahoo_id": yahoo_id,
                "name": name,
            })

    return rows

def collect_ranking_ids():
    ids = set()

    for base in RANKING_DIRS:
        if not base.exists():
            continue

        for p in base.rglob("*.json"):
            try:
                data = load_json(p)
            except Exception:
                continue

            for d in walk(data):
                # 1. 明示的な yahoo / sportsnavi key
                for k, v in d.items():
                    if k in DIRECT_ID_KEYS or YAHOO_HINT_RE.search(str(k)):
                        pid = as_id(v)
                        if pid:
                            ids.add(pid)

                # 2. 選手オブジェクトっぽい dict の id/playerId
                has_name = any(isinstance(d.get(k), str) and d.get(k).strip() for k in NAME_KEYS)
                if has_name:
                    for k in ID_VALUE_KEYS:
                        pid = as_id(d.get(k))
                        if pid:
                            ids.add(pid)

    return ids

def collect_master_ids(kind):
    result = defaultdict(list)

    for p in sorted(MASTER_DIR.glob(f"{kind}_*_from_master.csv")):
        m = re.search(rf"{kind}_(\d{{4}})_(CL|PL)_from_master\.csv$", p.name)
        year = m.group(1) if m else ""
        league = m.group(2) if m else ""

        with p.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                pid = (
                    row.get("player_id")
                    or row.get("yahoo_player_id")
                    or row.get("yahoo_id")
                    or ""
                ).strip()

                if not pid:
                    continue

                result[pid].append({
                    "file": p.name,
                    "year": year,
                    "league": league,
                    "name": (
                        row.get("player_name_ja")
                        or row.get("name_ja")
                        or row.get("player_name")
                        or ""
                    ).strip(),
                })

    return result

profile_rows = collect_profile_rows()
profile_ids = {r["yahoo_id"] for r in profile_rows}
ranking_ids = collect_ranking_ids()
pitching_master = collect_master_ids("pitching")
batting_master = collect_master_ids("batting")

missing_from_ranking = sorted(profile_ids - ranking_ids)
ranking_missing_profile = sorted(ranking_ids - profile_ids)

OUT.parent.mkdir(parents=True, exist_ok=True)

with OUT.open("w", encoding="utf-8-sig", newline="") as f:
    fieldnames = [
        "category",
        "profile_file",
        "npb_id",
        "yahoo_id",
        "name",
        "pitching_master_rows",
        "batting_master_rows",
        "sample_pitching_files",
        "sample_batting_files",
    ]
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()

    profile_by_yahoo = {r["yahoo_id"]: r for r in profile_rows}

    for yahoo_id in missing_from_ranking:
        r = profile_by_yahoo.get(yahoo_id, {})
        p_rows = pitching_master.get(yahoo_id, [])
        b_rows = batting_master.get(yahoo_id, [])

        if p_rows:
            category = "MISSING_FROM_RANKING_BUT_IN_PITCHING_MASTER"
        elif b_rows:
            category = "PROFILE_ONLY_OR_BATTER_SAFE"
        else:
            category = "PROFILE_ONLY_OR_ROSTER_SAFE"

        writer.writerow({
            "category": category,
            "profile_file": r.get("profile_file", ""),
            "npb_id": r.get("npb_id", ""),
            "yahoo_id": yahoo_id,
            "name": r.get("name", ""),
            "pitching_master_rows": len(p_rows),
            "batting_master_rows": len(b_rows),
            "sample_pitching_files": ";".join(x["file"] for x in p_rows[:5]),
            "sample_batting_files": ";".join(x["file"] for x in b_rows[:5]),
        })

print("=== validate_profile_vs_pitching scope audit v2 ===")
print(f"profile rows with yahoo id: {len(profile_rows)}")
print(f"profile yahoo ids: {len(profile_ids)}")
print(f"pitching ranking ids: {len(ranking_ids)}")
print(f"profile ids not in pitching ranking: {len(missing_from_ranking)}")
print(f"ranking ids without profile: {len(ranking_missing_profile)}")
print()
print("breakdown:")

counts = defaultdict(int)
for yahoo_id in missing_from_ranking:
    if pitching_master.get(yahoo_id):
        counts["MISSING_FROM_RANKING_BUT_IN_PITCHING_MASTER"] += 1
    elif batting_master.get(yahoo_id):
        counts["PROFILE_ONLY_OR_BATTER_SAFE"] += 1
    else:
        counts["PROFILE_ONLY_OR_ROSTER_SAFE"] += 1

for k, v in sorted(counts.items()):
    print(f"  {k}: {v}")

print()
print(f"Wrote: {OUT}")

if ranking_missing_profile:
    sample = ranking_missing_profile[:30]
    print()
    print("sample ranking ids without profile:")
    for x in sample:
        print(f"  {x}")
