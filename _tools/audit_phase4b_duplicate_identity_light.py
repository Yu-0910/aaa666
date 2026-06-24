import json
import re
from collections import defaultdict
from pathlib import Path

root = Path(".")
merged_dir = root / "_data/derived/player_profile/merged"
out_dir = root / "_reports"
out_dir.mkdir(parents=True, exist_ok=True)

def norm_name(s):
    s = str(s or "")
    s = s.replace("\u3000", " ")
    s = re.sub(r"\s+", "", s)
    return s.strip()

def clean(s):
    return str(s or "").strip()

rows = []

for p in sorted(merged_dir.glob("npb_*.json")):
    pid = p.stem.removeprefix("npb_")
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        continue

    profile = data.get("profile") or {}
    rows.append({
        "player_id": pid,
        "name_ja": clean(data.get("name_ja")),
        "name_norm": norm_name(data.get("name_ja")),
        "birth_date_raw": clean(profile.get("birth_date_raw")),
        "pro_debut_raw": clean(profile.get("pro_debut_raw")),
        "career_raw": clean(profile.get("career_raw")),
        "path": str(p),
    })

groups = defaultdict(list)
for r in rows:
    if r["name_norm"] and r["birth_date_raw"]:
        groups[(r["name_norm"], r["birth_date_raw"])].append(r)

dups = {
    key: items
    for key, items in groups.items()
    if len({x["player_id"] for x in items}) >= 2
}

print("=== Duplicate identity audit light ===")
print("merged rows:", len(rows))
print("duplicate groups by name + birth:", len(dups))
print()

print("=== Sasaki related ===")
sasaki = [
    r for r in rows
    if "佐々木健" in r["name_norm"] or r["player_id"] in {"01005153", "1005153", "1005153"}
]
if not sasaki:
    print("No Sasaki rows found")
else:
    for r in sorted(sasaki, key=lambda x: x["player_id"]):
        print(
            f'{r["player_id"]} | {r["name_ja"]} | birth={r["birth_date_raw"]} | '
            f'debut={r["pro_debut_raw"]} | career={r["career_raw"]}'
        )
print()

print("=== Duplicate groups sample ===")
count = 0
for (name, birth), items in sorted(dups.items(), key=lambda x: x[0][0]):
    if count >= 50:
        break
    print(f"{name} / {birth}")
    for r in sorted(items, key=lambda x: x["player_id"]):
        print(f'  {r["player_id"]} | {r["name_ja"]} | debut={r["pro_debut_raw"]}')
    print()
    count += 1

csv_path = out_dir / "phase4b_duplicate_identity_light.csv"
with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
    f.write("name_norm,birth_date_raw,player_id,name_ja,pro_debut_raw,career_raw,path\n")
    for (name, birth), items in sorted(dups.items(), key=lambda x: x[0][0]):
        for r in sorted(items, key=lambda x: x["player_id"]):
            line = [
                name,
                birth,
                r["player_id"],
                r["name_ja"],
                r["pro_debut_raw"],
                r["career_raw"],
                r["path"],
            ]
            f.write(",".join('"' + str(x).replace('"', '""') + '"' for x in line) + "\n")

print("Wrote:", csv_path)
