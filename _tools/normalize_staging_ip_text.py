import csv
import re
import shutil
import datetime as dt
from pathlib import Path
from collections import Counter

root = Path(".")
staging = root / "_data/master_csv__rescrape_staging"

run_id = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
backup = root / f"_data/master_csv__rescrape_staging__backup_ipnorm_{run_id}"

print("Creating backup:", backup)
shutil.copytree(staging, backup)

def normalize_ip_text(v):
    s = str(v or "").strip()
    if not s:
        return s

    # 194 .1 / 194 .2 / 194. 1 などを 194.1 / 194.2 に寄せる
    s2 = re.sub(r"^(\d+)\s*\.\s*([12])$", r"\1.\2", s)

    # 194 1/3, 194+1/3 などへの保険
    s2 = re.sub(r"^(\d+)\s*(?:\+|\s)\s*1/3$", r"\1.1", s2)
    s2 = re.sub(r"^(\d+)\s*(?:\+|\s)\s*2/3$", r"\1.2", s2)

    return s2

counter = Counter()

for p in sorted(staging.glob("pitching_*_from_master.csv")):
    with p.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        rows = list(reader)

    changed = False

    for row in rows:
        old = row.get("IP", "")
        new = normalize_ip_text(old)
        if old != new:
            row["IP"] = new
            changed = True
            counter["changed_ip"] += 1

    if changed:
        tmp = p.with_suffix(p.suffix + ".tmp")
        with tmp.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        tmp.replace(p)
        counter["files_rewritten"] += 1

print(dict(counter))
print("backup:", backup)
