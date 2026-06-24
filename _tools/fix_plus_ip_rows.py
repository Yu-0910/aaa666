import csv
import datetime as dt
import re
import shutil
from pathlib import Path
from collections import Counter

from bs4 import BeautifulSoup

root = Path(".")
staging = root / "_data/master_csv__rescrape_staging"
cache = root / "_data/cache/npb_player_page"
report_dir = root / "_reports/debug_era_missing"
report_dir.mkdir(parents=True, exist_ok=True)

run_id = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
backup = root / f"_data/master_csv__rescrape_staging__backup_plusip_{run_id}"
print("Creating backup:", backup)
shutil.copytree(staging, backup)

def norm(v):
    return str(v or "").strip().replace(",", "")

def norm_num(v):
    s = norm(v)
    if s == "":
        return ""
    if s.startswith("."):
        s = "0" + s
    try:
        x = float(s)
        if x.is_integer():
            return str(int(x))
        return f"{x:.3f}".rstrip("0").rstrip(".")
    except Exception:
        return s

def norm_era(v):
    s = norm(v)
    if s == "":
        return ""
    if s == "----":
        return "----"
    try:
        return str(float(s))
    except Exception:
        return s

def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        return r.fieldnames or [], list(r)

def write_csv(path, headers, rows):
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    tmp.replace(path)

player_cache = {}

def get_rows(pid):
    if pid in player_cache:
        return player_cache[pid]

    html_path = cache / f"{pid}.html"
    if not html_path.is_file():
        player_cache[pid] = {}
        return {}

    soup = BeautifulSoup(html_path.read_text(encoding="utf-8", errors="ignore"), "html.parser")
    by_year = {}

    for table in soup.find_all("table"):
        text = table.get_text(" ", strip=True)
        if not all(x in text for x in ["投球回", "自責点", "防御率"]):
            continue

        for tr in table.find_all("tr"):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            if len(cells) < 26:
                continue
            year = norm(cells[0])
            if re.match(r"^\d{4}$", year):
                by_year.setdefault(year, []).append(cells)

    player_cache[pid] = by_year
    return by_year

def choose_cells(pid, year, row):
    candidates = get_rows(pid).get(str(year), [])
    if not candidates:
        return None

    scored = []
    for cells in candidates:
        score = 0
        for col, idx in {"G": 2, "W": 3, "L": 4, "SV": 5}.items():
            if idx < len(cells) and norm_num(row.get(col)) and norm_num(row.get(col)) == norm_num(cells[idx]):
                score += 10
        scored.append((score, cells))

    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]

def is_plus_ip_row(cells):
    return (
        cells is not None
        and len(cells) >= 26
        and norm(cells[13]) == "+"
        and norm(cells[15]) == "+"
    )

def fixed_plus_ip(cells):
    return {
        "BF": norm_num(cells[12]),
        "IP": "+",
        "H": norm_num(cells[16]),
        "HR": norm_num(cells[17]),
        "BB": norm_num(cells[18]),
        "HBP": norm_num(cells[19]),
        "SO": norm_num(cells[20]),
        "WP": norm_num(cells[21]),
        "BK": norm_num(cells[22]),
        "R": norm_num(cells[23]),
        "ER": norm_num(cells[24]),
        "ERA": norm_era(cells[25]),
    }

counter = Counter()
report_rows = []

for path in sorted(staging.glob("pitching_*_from_master.csv")):
    headers, rows = read_csv(path)
    new_rows = []
    changed_file = False

    for row in rows:
        pid = norm(row.get("player_id"))
        year = norm(row.get("year"))

        if not pid or not year:
            new_rows.append(row)
            continue

        cells = choose_cells(pid, year, row)

        if not is_plus_ip_row(cells):
            new_rows.append(row)
            continue

        fixed = fixed_plus_ip(cells)
        new_row = dict(row)
        changed = []

        for col, nv in fixed.items():
            if col not in new_row:
                continue
            old = str(new_row.get(col, "")).strip()
            if old != str(nv).strip():
                new_row[col] = nv
                changed.append(col)
                counter[f"changed_{col}"] += 1

        if changed:
            changed_file = True
            counter["changed_rows"] += 1

        counter["plus_ip_rows"] += 1

        report_rows.append({
            "year": year,
            "league": row.get("league"),
            "player_id": pid,
            "player_name_ja": row.get("player_name_ja"),
            "changed_cols": "|".join(changed),
            "old": "|".join(str(row.get(k, "")) for k in ["BF","IP","H","HR","BB","HBP","SO","WP","BK","R","ER","ERA"]),
            "new": "|".join(str(new_row.get(k, "")) for k in ["BF","IP","H","HR","BB","HBP","SO","WP","BK","R","ER","ERA"]),
            "html": "|".join(cells),
            "csv_file": str(path),
        })

        new_rows.append(new_row)

    if changed_file:
        write_csv(path, headers, new_rows)
        counter["files_rewritten"] += 1

report_path = report_dir / f"fix_plus_ip_rows_report_{run_id}.csv"
with report_path.open("w", encoding="utf-8-sig", newline="") as f:
    fields = ["year","league","player_id","player_name_ja","changed_cols","old","new","html","csv_file"]
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(report_rows)

print("=== plus-IP row fix ===")
print("backup:", backup)
for k, v in counter.most_common():
    print(f"{k}: {v}")
print("report:", report_path)
print()
for r in report_rows:
    if r["changed_cols"]:
        print(r["year"], r["league"], r["player_name_ja"], r["changed_cols"])
        print("old:", r["old"])
        print("new:", r["new"])
