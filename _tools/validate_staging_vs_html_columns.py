import csv
import re
from pathlib import Path
from collections import Counter

from bs4 import BeautifulSoup

root = Path(".")
staging = root / "_data/master_csv__rescrape_staging"
cache = root / "_data/cache/npb_player_page"
out = root / "_reports/debug_era_missing/staging_vs_html_column_validation.csv"
out.parent.mkdir(parents=True, exist_ok=True)

LIMIT_PER_FILE = 10

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

def norm_ip(v):
    s = norm(v)
    s = re.sub(r"^(\d+)\s+\.(\d)$", r"\1.\2", s)

    if s == "":
        return ""

    # 85 と 85.0 を同一扱いにする
    try:
        x = float(s)
        if x.is_integer():
            return f"{int(x)}.0"
        return f"{x:.3f}".rstrip("0").rstrip(".")
    except Exception:
        return s

def norm_era(v):
    s = norm(v)
    if s == "----":
        return "----"
    try:
        return str(float(s))
    except Exception:
        return s

player_cache = {}

def get_pitching_rows(pid):
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
            if len(cells) < 24:
                continue
            year = norm(cells[0])
            if re.match(r"^\d{4}$", year):
                by_year.setdefault(year, []).append(cells)

    player_cache[pid] = by_year
    return by_year

def choose_cells(pid, year, row):
    candidates = get_pitching_rows(pid).get(str(year), [])
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

def is_split_ip(cells):
    return (
        cells is not None
        and len(cells) >= 26
        and re.match(r"^\d+\s+\.[12]$", norm(cells[13])) is not None
        and re.match(r"^\d+$", norm(cells[14])) is not None
        and re.match(r"^\.[12]$", norm(cells[15])) is not None
    )


def is_integer_ip_duplicate(cells):
    return (
        cells is not None
        and len(cells) >= 26
        and re.match(r"^\d+$", norm(cells[13])) is not None
        and norm(cells[14]) == norm(cells[13])
        and norm(cells[15]) == ""
    )


def is_plus_ip(cells):
    return (
        cells is not None
        and len(cells) >= 26
        and norm(cells[13]) == "+"
        and norm(cells[15]) == "+"
    )

def expected_from_html(cells):
    if is_split_ip(cells):
        return {
            "BF": norm_num(cells[12]),
            "IP": norm_ip(cells[13]),
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

    if is_integer_ip_duplicate(cells):
        return {
            "BF": norm_num(cells[12]),
            "IP": norm_ip(cells[13]),
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

    if is_plus_ip(cells):
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

    # 通常行。末尾側を優先
    return {
        "BF": norm_num(cells[-12]),
        "IP": norm_ip(cells[-11]),
        "H": norm_num(cells[-10]),
        "HR": norm_num(cells[-9]),
        "BB": norm_num(cells[-8]),
        "HBP": norm_num(cells[-7]),
        "SO": norm_num(cells[-6]),
        "WP": norm_num(cells[-5]),
        "BK": norm_num(cells[-4]),
        "R": norm_num(cells[-3]),
        "ER": norm_num(cells[-2]),
        "ERA": norm_era(cells[-1]),
    }

def csv_norm(col, v):
    if col == "IP":
        return norm_ip(v)
    if col == "ERA":
        return norm_era(v)
    return norm_num(v)

rows_out = []
counter = Counter()

for path in sorted(staging.glob("pitching_*_from_master.csv")):
    checked_in_file = 0

    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if checked_in_file >= LIMIT_PER_FILE:
                break

            pid = norm(row.get("player_id"))
            year = norm(row.get("year"))

            cells = choose_cells(pid, year, row)
            if not cells:
                counter["no_html_row"] += 1
                continue

            exp = expected_from_html(cells)

            checked_in_file += 1
            counter["checked_rows"] += 1

            for col, expected in exp.items():
                actual = csv_norm(col, row.get(col))
                ok = actual == expected

                counter[f"{col}_ok" if ok else f"{col}_ng"] += 1

                if not ok:
                    rows_out.append({
                        "file": str(path),
                        "year": year,
                        "league": row.get("league"),
                        "player_id": pid,
                        "player_name_ja": row.get("player_name_ja"),
                        "col": col,
                        "csv_value": row.get(col),
                        "csv_norm": actual,
                        "html_expected": expected,
                        "is_split_ip": is_split_ip(cells),
                        "html_cells": "|".join(cells),
                    })

with out.open("w", encoding="utf-8-sig", newline="") as f:
    fields = [
        "file", "year", "league", "player_id", "player_name_ja",
        "col", "csv_value", "csv_norm", "html_expected",
        "is_split_ip", "html_cells",
    ]
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(rows_out)

print("=== staging vs HTML column validation ===")
for k, v in counter.most_common():
    print(f"{k}: {v}")

print()
print("ng rows:", len(rows_out))
print("Wrote:", out)
