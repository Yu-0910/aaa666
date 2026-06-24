import csv
from pathlib import Path
from collections import Counter, defaultdict

root = Path(".")
out_dir = root / "_reports/debug_era_missing"

suspicious_path = out_dir / "era_is_er_suspicious_rows.csv"
out_path = out_dir / "era_value_matches_html_column_sample.csv"

LIMIT = 300

def norm(v):
    return str(v).strip().replace(",", "")

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
            if any(x in joined for x in ["防御率", "自責点", "投球回", "奪三振", "勝利", "敗北", "失点"]):
                header_candidates.append(cells)

        header = header_candidates[-1] if header_candidates else []

        for tr in rows:
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            if cells and str(year) in cells:
                hits.append((table_idx, header, cells))

    return hits

with suspicious_path.open(encoding="utf-8-sig", newline="") as f:
    suspicious_all = [
        r for r in csv.DictReader(f)
        if r.get("layer") == "staging" and "era_too_high" in (r.get("flags") or "")
    ]

# 年度・リーグが偏らないように間引く
picked = []
seen_file_count = Counter()

for r in suspicious_all:
    key = r.get("csv_file")
    if seen_file_count[key] >= 5:
        continue
    picked.append(r)
    seen_file_count[key] += 1
    if len(picked) >= LIMIT:
        break

print(f"staging suspicious total: {len(suspicious_all)}")
print(f"sample checked: {len(picked)}")

csv_cache = {}
html_cache = {}

rows_out = []
counter = Counter()

for idx, s in enumerate(picked, start=1):
    year = s["year"]
    pid = s["player_id"]
    csv_path = Path(s["csv_file"] if "csv_file" in s else s["file"])
    line_no = s["line"]

    if csv_path not in csv_cache:
        csv_cache[csv_path] = read_csv_file(csv_path)

    row = csv_cache[csv_path].get(str(line_no))
    if not row:
        continue

    csv_era = norm(row.get("ERA") or row.get("era") or row.get("防御率") or "")
    if not csv_era:
        continue

    html_path = root / f"_data/cache/npb_player_page/{pid}.html"
    if not html_path.is_file():
        counter["HTML_CACHE_MISSING"] += 1
        continue

    html_key = (html_path, year)
    if html_key not in html_cache:
        try:
            html_cache[html_key] = find_year_rows_in_html(html_path, year)
        except Exception as e:
            html_cache[html_key] = []
            counter[f"HTML_PARSE_ERROR:{type(e).__name__}"] += 1

    hits = html_cache[html_key]

    matched = False
    for table_idx, header, cells in hits:
        for i, cell in enumerate(cells):
            if norm(cell) == csv_era:
                h = header[i] if i < len(header) else f"index_{i}"
                counter[h] += 1
                matched = True
                rows_out.append({
                    "year": year,
                    "player_id": pid,
                    "player_name": s.get("player_name", ""),
                    "csv_ERA": csv_era,
                    "matched_html_index": i,
                    "matched_html_header": h,
                    "table_idx": table_idx,
                    "html_row": "|".join(cells),
                    "csv_file": str(csv_path),
                    "line": line_no,
                })

    if not matched:
        counter["NO_MATCH"] += 1

with out_path.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=[
        "year", "player_id", "player_name",
        "csv_ERA", "matched_html_index", "matched_html_header",
        "table_idx", "html_row", "csv_file", "line"
    ])
    w.writeheader()
    w.writerows(rows_out)

print()
print("=== CSV ERA value matched HTML column sample ===")
for k, v in counter.most_common(30):
    print(v, k)

print()
print("matched rows:", len(rows_out))
print("Wrote:", out_path)
