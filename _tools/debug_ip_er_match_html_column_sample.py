import csv
from pathlib import Path
from collections import Counter

root = Path(".")
out_dir = root / "_reports/debug_era_missing"

suspicious_path = out_dir / "era_is_er_suspicious_rows.csv"
out_path = out_dir / "ip_er_value_matches_html_column_sample.csv"

LIMIT = 300

def norm_num(v):
    s = str(v).strip().replace(",", "")
    if s == "":
        return ""
    try:
        x = float(s)
        if x.is_integer():
            return str(int(x))
        return f"{x:.2f}".rstrip("0").rstrip(".")
    except Exception:
        return s

def read_csv_file(path):
    rows_by_line = {}
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=2):
            rows_by_line[str(i)] = row
    return rows_by_line

def find_year_rows_in_html(html_path, year):
    from bs4 import BeautifulSoup

    html = html_path.read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")

    hits = []

    for table_idx, table in enumerate(soup.find_all("table")):
        rows = table.find_all("tr")

        header_candidates = []
        for tr in rows:
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            if not cells:
                continue
            joined = "|".join(cells)
            if any(x in joined for x in ["防御率", "自責点", "投球回", "奪三振", "勝利", "敗北", "失点", "登板"]):
                header_candidates.append(cells)

        header = header_candidates[-1] if header_candidates else []

        for tr in rows:
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            if cells and str(year) in cells:
                hits.append((table_idx, header, cells))

    return hits

def pick_col(row, names):
    for n in names:
        if n in row:
            return n
    return None

with suspicious_path.open(encoding="utf-8-sig", newline="") as f:
    suspicious_all = [
        r for r in csv.DictReader(f)
        if r.get("layer") == "staging" and "era_too_high" in (r.get("flags") or "")
    ]

picked = []
seen_file_count = Counter()

for r in suspicious_all:
    key = r.get("file") or r.get("csv_file")
    if seen_file_count[key] >= 5:
        continue
    picked.append(r)
    seen_file_count[key] += 1
    if len(picked) >= LIMIT:
        break

csv_cache = {}
html_cache = {}

counter = Counter()
rows_out = []

for s in picked:
    year = s["year"]
    pid = s["player_id"]
    csv_path = Path(s.get("file") or s.get("csv_file"))
    line_no = s["line"]

    if csv_path not in csv_cache:
        csv_cache[csv_path] = read_csv_file(csv_path)

    row = csv_cache[csv_path].get(str(line_no))
    if not row:
        continue

    ip_col = pick_col(row, ["IP", "投球回", "innings_pitched"])
    er_col = pick_col(row, ["ER", "自責点", "earned_runs"])
    era_col = pick_col(row, ["ERA", "防御率", "era"])

    targets = []
    if ip_col:
        targets.append(("CSV_IP", ip_col, norm_num(row.get(ip_col, "")), row.get(ip_col, "")))
    if er_col:
        targets.append(("CSV_ER", er_col, norm_num(row.get(er_col, "")), row.get(er_col, "")))
    if era_col:
        targets.append(("CSV_ERA", era_col, norm_num(row.get(era_col, "")), row.get(era_col, "")))

    html_path = root / f"_data/cache/npb_player_page/{pid}.html"
    if not html_path.is_file():
        counter["HTML_CACHE_MISSING"] += 1
        continue

    html_key = (html_path, year)
    if html_key not in html_cache:
        html_cache[html_key] = find_year_rows_in_html(html_path, year)

    hits = html_cache[html_key]

    for target_name, csv_col, csv_norm, csv_raw in targets:
        if not csv_norm:
            counter[f"{target_name}:EMPTY"] += 1
            continue

        matched = False
        for table_idx, header, cells in hits:
            for i, cell in enumerate(cells):
                if norm_num(cell) == csv_norm:
                    h = header[i] if i < len(header) else f"index_{i}"
                    counter[f"{target_name} -> {h}"] += 1
                    matched = True
                    rows_out.append({
                        "target": target_name,
                        "csv_col": csv_col,
                        "csv_raw": csv_raw,
                        "csv_norm": csv_norm,
                        "matched_html_header": h,
                        "matched_html_index": i,
                        "matched_html_value": cell,
                        "year": year,
                        "player_id": pid,
                        "player_name": s.get("player_name", ""),
                        "html_header": "|".join(header),
                        "html_row": "|".join(cells),
                        "csv_file": str(csv_path),
                        "line": line_no,
                    })

        if not matched:
            counter[f"{target_name}:NO_MATCH"] += 1

with out_path.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=[
        "target", "csv_col", "csv_raw", "csv_norm",
        "matched_html_header", "matched_html_index", "matched_html_value",
        "year", "player_id", "player_name",
        "html_header", "html_row", "csv_file", "line"
    ])
    w.writeheader()
    w.writerows(rows_out)

print("=== IP / ER / ERA match sample ===")
for k, v in counter.most_common(60):
    print(v, k)

print()
print("Wrote:", out_path)
