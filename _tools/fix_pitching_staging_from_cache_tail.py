import argparse
import csv
import datetime as dt
import shutil
from pathlib import Path
from collections import Counter

from bs4 import BeautifulSoup

ROOT = Path(".")
STAGING_DIR = ROOT / "_data/master_csv__rescrape_staging"
CACHE_DIR = ROOT / "_data/cache/npb_player_page"
REPORT_DIR = ROOT / "_reports/debug_era_missing"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

YEARS = range(1950, 2005)
LEAGUES = ("CL", "PL")

LEFT_MAP = {
    "G": 2,
    "W": 3,
    "L": 4,
    "SV": 5,
}

TAIL_MAP = {
    "BF": -14,
    "IP": -13,
    "H": -12,
    "HR": -11,
    "BB": -10,
    "HBP": -9,
    "SO": -8,
    "WP": -7,
    "BK": -6,
    "R": -3,
    "ER": -2,
    "ERA": -1,
    "WPCT": -15,
    "SHO": -17,
    "CG": -18,
}

def cell(cells, idx):
    try:
        return str(cells[idx]).strip()
    except Exception:
        return ""

def norm_num(s):
    s = str(s or "").strip().replace(",", "")
    if not s:
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

def norm_ip(s):
    s = str(s or "").strip().replace(",", "")
    if not s:
        return ""
    s = s.replace("⅓", ".1").replace("⅔", ".2")
    s = s.replace(" 1/3", ".1").replace(" 2/3", ".2")
    s = s.replace("+1/3", ".1").replace("+2/3", ".2")
    if s.isdigit():
        return f"{int(s)}.0"
    return s

def norm_era(s):
    s = str(s or "").strip()
    if not s:
        return ""
    try:
        return str(float(s))
    except Exception:
        return s

def norm_wpct(s):
    s = str(s or "").strip()
    if not s:
        return ""
    if s.startswith("."):
        s = "0" + s
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

_html_year_cache = {}

def get_pitching_year_rows(pid, year):
    key = (pid, int(year))
    if key in _html_year_cache:
        return _html_year_cache[key]

    html_path = CACHE_DIR / f"{pid}.html"
    if not html_path.is_file():
        _html_year_cache[key] = []
        return []

    soup = BeautifulSoup(html_path.read_text(encoding="utf-8", errors="ignore"), "html.parser")
    hits = []

    for table_idx, table in enumerate(soup.find_all("table")):
        text = table.get_text(" ", strip=True)
        if not all(x in text for x in ["投球回", "自責点", "防御率"]):
            continue

        for tr_idx, tr in enumerate(table.find_all("tr")):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            if len(cells) < 20:
                continue
            if str(cells[0]).strip() == str(year):
                hits.append({
                    "table_idx": table_idx,
                    "tr_idx": tr_idx,
                    "cells": cells,
                })

    _html_year_cache[key] = hits
    return hits

def score_candidate(cells, row):
    score = 0
    for col, idx in LEFT_MAP.items():
        if norm_num(row.get(col, "")) and norm_num(row.get(col, "")) == norm_num(cell(cells, idx)):
            score += 10

    # 江川1984のような古い表は末尾が R, ER, ERA になる
    old_era = norm_era(row.get("ERA", ""))
    tail_era = norm_era(cell(cells, -1))
    if old_era and old_era == tail_era:
        score += 3

    return score

def choose_candidate(cands, row):
    if not cands:
        return None, "no_candidate"

    scored = [(score_candidate(c["cells"], row), c) for c in cands]
    scored.sort(key=lambda x: x[0], reverse=True)

    if len(scored) >= 2 and scored[0][0] == scored[1][0]:
        return scored[0][1], "ambiguous"

    return scored[0][1], "ok"

def fixed_values(cells):
    out = {}

    for col, idx in LEFT_MAP.items():
        out[col] = norm_num(cell(cells, idx))

    for col, idx in TAIL_MAP.items():
        v = cell(cells, idx)
        if col == "IP":
            out[col] = norm_ip(v)
        elif col == "ERA":
            out[col] = norm_era(v)
        elif col == "WPCT":
            out[col] = norm_wpct(v)
        else:
            out[col] = norm_num(v)

    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--years", default="1950-2004")
    args = ap.parse_args()

    if args.years == "1950-2004":
        years = list(YEARS)
    else:
        years = []
        for part in args.years.split(","):
            part = part.strip()
            if "-" in part:
                a, b = part.split("-", 1)
                years.extend(range(int(a), int(b) + 1))
            elif part:
                years.append(int(part))

    run_id = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = REPORT_DIR / f"fix_pitching_staging_tail_parse_report_{run_id}.csv"

    backup_dir = None
    if args.apply:
        backup_dir = ROOT / f"_data/master_csv__rescrape_staging__backup_tailfix_{run_id}"
        print("Creating backup:", backup_dir)
        shutil.copytree(STAGING_DIR, backup_dir)

    counters = Counter()
    report = []

    for year in years:
        for league in LEAGUES:
            path = STAGING_DIR / f"pitching_{year}_{league}_from_master.csv"
            if not path.is_file():
                counters["missing_file"] += 1
                continue

            headers, rows = read_csv(path)
            new_rows = []
            file_changed = False

            for row in rows:
                counters["rows"] += 1

                if counters["rows"] % 1000 == 0:
                    print("processed rows:", counters["rows"])

                pid = (row.get("player_id") or "").strip()
                if not pid:
                    new_rows.append(row)
                    counters["missing_pid"] += 1
                    continue

                cands = get_pitching_year_rows(pid, year)
                selected, status = choose_candidate(cands, row)

                if not selected:
                    new_rows.append(row)
                    counters["no_candidate"] += 1
                    continue

                cells = selected["cells"]
                fixed = fixed_values(cells)
                new_row = dict(row)
                changed = []

                for col, nv in fixed.items():
                    if col not in new_row:
                        continue
                    ov = str(new_row.get(col, "")).strip()
                    if ov != str(nv).strip():
                        new_row[col] = nv
                        changed.append(col)
                        counters[f"changed_{col}"] += 1

                if changed:
                    file_changed = True
                    counters["changed_rows"] += 1

                if status == "ambiguous":
                    counters["ambiguous"] += 1

                report.append({
                    "status": status,
                    "year": year,
                    "league": league,
                    "player_id": pid,
                    "player_name_ja": row.get("player_name_ja", ""),
                    "old_IP": row.get("IP", ""),
                    "new_IP": new_row.get("IP", ""),
                    "old_R": row.get("R", ""),
                    "new_R": new_row.get("R", ""),
                    "old_ER": row.get("ER", ""),
                    "new_ER": new_row.get("ER", ""),
                    "old_ERA": row.get("ERA", ""),
                    "new_ERA": new_row.get("ERA", ""),
                    "changed_cols": "|".join(changed),
                    "html_cells": "|".join(cells),
                    "csv_file": str(path),
                })

                new_rows.append(new_row)

            if args.apply and file_changed:
                write_csv(path, headers, new_rows)
                counters["files_rewritten"] += 1

    with report_path.open("w", encoding="utf-8-sig", newline="") as f:
        fields = [
            "status", "year", "league", "player_id", "player_name_ja",
            "old_IP", "new_IP", "old_R", "new_R", "old_ER", "new_ER",
            "old_ERA", "new_ERA", "changed_cols", "html_cells", "csv_file",
        ]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(report)

    print()
    print("=== Tail-parse staging fix v2 ===")
    print("mode:", "APPLY" if args.apply else "DRY-RUN")
    if backup_dir:
        print("backup:", backup_dir)

    for k, v in counters.most_common():
        print(f"{k}: {v}")

    print("report:", report_path)

    print()
    print("=== Egawa 1984 check ===")
    for r in report:
        if str(r["year"]) == "1984" and r["league"] == "CL" and "江川" in r["player_name_ja"]:
            print("player:", r["player_name_ja"], r["player_id"])
            print("old_IP :", r["old_IP"], "-> new_IP :", r["new_IP"])
            print("old_R  :", r["old_R"], "-> new_R  :", r["new_R"])
            print("old_ER :", r["old_ER"], "-> new_ER :", r["new_ER"])
            print("old_ERA:", r["old_ERA"], "-> new_ERA:", r["new_ERA"])
            print("changed:", r["changed_cols"])
            print("html:", r["html_cells"])
            break

    if not args.apply:
        print()
        print("DRY-RUN only. To rewrite staging CSVs:")
        print("python _tools/fix_pitching_staging_from_cache_tail.py --apply")

if __name__ == "__main__":
    main()
