import csv
from collections import defaultdict
from pathlib import Path

root = Path(".")
dup_csv = root / "_reports/phase4b_duplicate_identity_light.csv"
roster_csv = root / "_data/npb_roster_2026.csv"

if not dup_csv.is_file():
    raise FileNotFoundError(f"missing: {dup_csv}")
if not roster_csv.is_file():
    raise FileNotFoundError(f"missing: {roster_csv}")

roster_ids = set()
with roster_csv.open(encoding="utf-8-sig", newline="") as f:
    for row in csv.DictReader(f):
        pid = str(row.get("npb_player_id", "")).strip()
        if pid:
            roster_ids.add(pid)

rows = list(csv.DictReader(dup_csv.open(encoding="utf-8-sig")))

groups = defaultdict(list)
for r in rows:
    name = r.get("name_norm", "")
    birth = r.get("birth_date_raw", "")
    pid = str(r.get("player_id", "")).strip()
    if name and birth and pid:
        groups[(name, birth)].append(r)

both_non_roster = []
mixed = []
both_roster = []

for key, items in groups.items():
    ids = sorted({str(r.get("player_id", "")).strip() for r in items})
    if len(ids) < 2:
        continue

    in_roster = [pid for pid in ids if pid in roster_ids]
    out_roster = [pid for pid in ids if pid not in roster_ids]

    if len(out_roster) == len(ids):
        both_non_roster.append((key, items))
    elif len(in_roster) == len(ids):
        both_roster.append((key, items))
    else:
        mixed.append((key, items))

print("=== duplicate ID category summary light ===")
print("both_non_roster:", len(both_non_roster))
print("mixed_roster_non_roster:", len(mixed))
print("both_roster:", len(both_roster))
print()

print("=== both_non_roster sample first 50 groups ===")
for idx, ((name, birth), items) in enumerate(sorted(both_non_roster, key=lambda x: x[0][0])[:50], start=1):
    print()
    print(f"{idx}. {name} / {birth}")
    for r in sorted(items, key=lambda x: str(x.get("player_id", ""))):
        print(
            f"  {r.get('player_id')} | {r.get('name_ja')} | "
            f"{r.get('pro_debut_raw')} | {r.get('career_raw')}"
        )
