import csv
import json
import subprocess
from pathlib import Path

root = Path(".")
targets = json.loads((root / "_data/npb_rescrape/targets_profile_roman.json").read_text(encoding="utf-8"))

roster = set()
with (root / "_data/npb_roster_2026.csv").open(encoding="utf-8-sig", newline="") as f:
    for row in csv.DictReader(f):
        pid = str(row.get("npb_player_id", "")).strip()
        if pid:
            roster.add(pid)

non_roster = [
    str(r.get("player_id", "")).strip()
    for r in targets
    if str(r.get("player_id", "")).strip() and str(r.get("player_id", "")).strip() not in roster
]

print("non_roster sample:")
for pid in non_roster[:20]:
    print(pid)
