import csv
import json
import re
from pathlib import Path

root = Path(".")
merged_dir = root / "_data/derived/player_profile/merged"
roster_csv = root / "_data/npb_roster_2026.csv"

TARGET_NAME = "中谷仁"

def norm_name(s):
    s = str(s or "")
    s = s.replace("\u3000", " ")
    s = re.sub(r"\s+", "", s)
    return s.strip()

def clean(s):
    return str(s or "").strip()

roster_ids = set()
if roster_csv.is_file():
    with roster_csv.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            pid = clean(row.get("npb_player_id"))
            if pid:
                roster_ids.add(pid)

rows = []
for p in sorted(merged_dir.glob("npb_*.json")):
    pid = p.stem.removeprefix("npb_")
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        continue

    profile = data.get("profile") or {}
    name_ja = clean(data.get("name_ja"))
    name_norm = norm_name(name_ja)

    if TARGET_NAME not in name_norm:
        continue

    rows.append({
        "player_id": pid,
        "name_ja": name_ja,
        "name_norm": name_norm,
        "birth_date_raw": clean(profile.get("birth_date_raw")),
        "pro_debut_raw": clean(profile.get("pro_debut_raw")),
        "career_raw": clean(profile.get("career_raw")),
        "in_2026_roster": "yes" if pid in roster_ids else "no",
        "path": str(p),
    })

print("=== Target duplicate check ===")
print("target:", TARGET_NAME)
print("matched rows:", len(rows))
print()

for r in rows:
    print(
        f'{r["player_id"]} | {r["name_ja"]} | birth={r["birth_date_raw"]} | '
        f'debut={r["pro_debut_raw"]} | roster2026={r["in_2026_roster"]}'
    )
    print(f'  career={r["career_raw"]}')
    print(f'  path={r["path"]}')

print()
if len(rows) >= 2:
    keys = {(r["name_norm"], r["birth_date_raw"]) for r in rows}
    print("same name+birth duplicate:", "yes" if len(keys) == 1 else "mixed")
else:
    print("same name+birth duplicate: no")
