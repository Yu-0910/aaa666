import csv
import re
from pathlib import Path
from collections import Counter

root = Path(".")
staging = root / "_data/master_csv__rescrape_staging"
out = root / "_reports/npb_rescrape_phase3_1_staging_validation.txt"
out.parent.mkdir(parents=True, exist_ok=True)

def parse_ip(v):
    import re
    import math

    s = str(v or "").strip().replace(",", "")
    if not s or s == "+":
        return None

    s = s.replace("⅓", ".1").replace("⅔", ".2")
    s = re.sub(r"^(\d+)\s*\.\s*([12])$", r"\1.\2", s)
    s = re.sub(r"^(\d+)\s*(?:\+|\s)\s*1/3$", r"\1.1", s)
    s = re.sub(r"^(\d+)\s*(?:\+|\s)\s*2/3$", r"\1.2", s)

    m = re.match(r"^(\d+)\.([12])$", s)
    if m:
        # NPB公式ERAとの整合用。
        # 例: 3.1, 3.2 は ERA計算上 4.0 扱い。
        return float(int(m.group(1)) + 1)

    try:
        return float(s)
    except Exception:
        return None

def parse_float(v):
    s = str(v or "").strip().replace(",", "")
    if not s or s in {"----", "-", "—", "+"}:
        return None
    if s.startswith("."):
        s = "0" + s
    try:
        return float(s)
    except Exception:
        return None

files = sorted(staging.glob("pitching_*_from_master.csv"))

total_rows = 0
missing_era = 0
invalid_era = Counter()
calc_mismatch = []
era_too_high = []
egawa = None

for p in files:
    with p.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            total_rows += 1

            era_raw = str(row.get("ERA") or "").strip()

            if era_raw == "":
                missing_era += 1
                continue

            era = parse_float(era_raw)

            if era is None:
                invalid_era[era_raw] += 1
                continue

            ip = parse_ip(row.get("IP"))
            er = parse_float(row.get("ER"))

            if ip and er is not None:
                calc = round(er * 9 / ip, 2)
                if abs(era - calc) > 0.03:
                    calc_mismatch.append((
                        p.name,
                        row.get("player_id"),
                        row.get("player_name_ja"),
                        row.get("IP"),
                        row.get("ER"),
                        row.get("ERA"),
                        calc,
                    ))

            if era >= 20:
                era_too_high.append((
                    p.name,
                    row.get("player_id"),
                    row.get("player_name_ja"),
                    row.get("IP"),
                    row.get("ER"),
                    row.get("ERA"),
                ))

            if row.get("player_id") == "91193848" and row.get("year") == "1984":
                egawa = dict(row)

backups = sorted(root.glob("_data/master_csv__rescrape_staging__backup_*"))

lines = []
lines.append("NPB rescrape Phase 3-1 staging validation")
lines.append("=" * 60)
lines.append("")
lines.append(f"staging files: {len(files)}")
lines.append(f"total rows: {total_rows}")
lines.append(f"missing ERA: {missing_era}")
lines.append(f"invalid ERA values: {dict(invalid_era)}")
lines.append(f"ERA calc mismatch: {len(calc_mismatch)}")
lines.append(f"ERA >= 20: {len(era_too_high)}")
lines.append(f"latest backup: {backups[-1] if backups else ''}")
lines.append("")

lines.append("Egawa 1984")
lines.append("-" * 60)
if egawa:
    for k in [
        "year", "league", "team", "player_id", "player_name_ja",
        "G", "W", "L", "BF", "IP", "H", "R", "ER", "ERA"
    ]:
        lines.append(f"{k}: {egawa.get(k)}")
else:
    lines.append("not found")

lines.append("")
lines.append("Invalid ERA values")
lines.append("-" * 60)
for k, v in invalid_era.items():
    lines.append(f"{k}: {v}")

lines.append("")
lines.append("Sample ERA >= 20")
lines.append("-" * 60)
for x in era_too_high[:20]:
    lines.append(str(x))

lines.append("")
lines.append("Sample calc mismatch")
lines.append("-" * 60)
for x in calc_mismatch[:20]:
    lines.append(str(x))

out.write_text("\n".join(lines), encoding="utf-8")

print("Wrote:", out)
print()
print("\n".join(lines[:25]))
