import argparse
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

def norm(v):
    return str(v or "").strip().replace(",", "")

def norm_num(v):
    s = norm(v)
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

def norm_ip(v):
    s = norm(v)
    if not s:
        return ""
    if s.isdigit():
        return f"{int(s)}.0"
    return s

def norm_era(v):
    s = norm(v)
    if not s:
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

def parse_player_html(pid):
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
    candidates = parse_player_html(pid).get(str(year), [])
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

def is_integer_ip_duplicate_row(cells):
    if not cells or len(cells) < 26:
        return False

    # 大友工1950型:
    # [13] 85
    # [14] 85
    # [15] 空
    return (
        re.match(r"^\d+$", norm(cells[13])) is not None
        and norm(cells[14]) == norm(cells[13])
        and norm(cells[15]) == ""
    )

def fixed_from_integer_ip_duplicate(cells):
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

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    run_id = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = report_dir / f"fix_integer_ip_duplicate_columns_report_{run_id}.csv"

    backup = None
    if args.apply:
        backup = root / f"_data/master_csv__rescrape_staging__backup_integerip_{run_id}"
        print("Creating backup:", backup)
        shutil.copytree(staging, backup)

    counters = Counter()
    report_rows = []

    for path in sorted(staging.glob("pitching_*_from_master.csv")):
        headers, rows = read_csv(path)
        new_rows = []
        file_changed = False

        for row in rows:
            counters["rows"] += 1
            if counters["rows"] % 1000 == 0:
                print("processed rows:", counters["rows"])

            pid = norm(row.get("player_id"))
            year = norm(row.get("year"))

            if not pid or not year:
                new_rows.append(row)
                continue

            cells = choose_cells(pid, year, row)

            if not cells:
                counters["no_html_row"] += 1
                new_rows.append(row)
                continue

            if not is_integer_ip_duplicate_row(cells):
                counters["non_integer_ip_duplicate_row"] += 1
                new_rows.append(row)
                continue

            counters["integer_ip_duplicate_row"] += 1

            fixed = fixed_from_integer_ip_duplicate(cells)
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

            report_rows.append({
                "year": year,
                "league": row.get("league"),
                "team": row.get("team"),
                "player_id": pid,
                "player_name_ja": row.get("player_name_ja"),
                "changed_cols": "|".join(changed),
                "old_BF": row.get("BF"),
                "new_BF": new_row.get("BF"),
                "old_IP": row.get("IP"),
                "new_IP": new_row.get("IP"),
                "old_H": row.get("H"),
                "new_H": new_row.get("H"),
                "old_HR": row.get("HR"),
                "new_HR": new_row.get("HR"),
                "old_BB": row.get("BB"),
                "new_BB": new_row.get("BB"),
                "old_HBP": row.get("HBP"),
                "new_HBP": new_row.get("HBP"),
                "old_SO": row.get("SO"),
                "new_SO": new_row.get("SO"),
                "old_WP": row.get("WP"),
                "new_WP": new_row.get("WP"),
                "old_BK": row.get("BK"),
                "new_BK": new_row.get("BK"),
                "old_R": row.get("R"),
                "new_R": new_row.get("R"),
                "old_ER": row.get("ER"),
                "new_ER": new_row.get("ER"),
                "old_ERA": row.get("ERA"),
                "new_ERA": new_row.get("ERA"),
                "html_cells": "|".join(cells),
                "csv_file": str(path),
            })

            new_rows.append(new_row)

        if args.apply and file_changed:
            write_csv(path, headers, new_rows)
            counters["files_rewritten"] += 1

    with report_path.open("w", encoding="utf-8-sig", newline="") as f:
        fields = [
            "year", "league", "team", "player_id", "player_name_ja", "changed_cols",
            "old_BF", "new_BF", "old_IP", "new_IP", "old_H", "new_H",
            "old_HR", "new_HR", "old_BB", "new_BB", "old_HBP", "new_HBP",
            "old_SO", "new_SO", "old_WP", "new_WP", "old_BK", "new_BK",
            "old_R", "new_R", "old_ER", "new_ER", "old_ERA", "new_ERA",
            "html_cells", "csv_file",
        ]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(report_rows)

    print()
    print("=== Integer-IP duplicate column fix ===")
    print("mode:", "APPLY" if args.apply else "DRY-RUN")
    if backup:
        print("backup:", backup)

    for k, v in counters.most_common():
        print(f"{k}: {v}")

    print("report:", report_path)

    print()
    print("=== Sample changed rows ===")
    shown = 0
    for r in report_rows:
        if r["changed_cols"]:
            print(
                r["year"],
                r["league"],
                r["player_name_ja"],
                "changed=" + r["changed_cols"],
                "IP", r["old_IP"], "->", r["new_IP"],
                "H", r["old_H"], "->", r["new_H"],
                "HR", r["old_HR"], "->", r["new_HR"],
                "BB", r["old_BB"], "->", r["new_BB"],
                "SO", r["old_SO"], "->", r["new_SO"],
            )
            shown += 1
            if shown >= 20:
                break

    if not args.apply:
        print()
        print("DRY-RUN only. To rewrite staging CSVs:")
        print("python _tools/fix_pitching_staging_integer_ip_duplicate.py --apply")

if __name__ == "__main__":
    main()
