import csv
from pathlib import Path
from collections import Counter

root = Path(".")
out_dir = root / "_reports/debug_era_missing"

suspicious_path = out_dir / "era_is_er_suspicious_rows.csv"
out_path = out_dir / "era_value_matches_html_column.csv"

def norm(v):
    return str(v).strip().replace(",", "")

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

def read_csv_line(path, line_no):
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=2):
            if i == int(line_no):
                return row
    return None

rows_out = []
counter = Counter()

with suspicious_path.open(encoding="utf-8-sig", newline="") as f:
    suspicious = [
        r for r in csv.DictReader(f)
        if r.get("layer") == "staging" and "era_too_high" in (r.get("flags") or "")
    ]

print(f"staging suspicious rows checked target: {len(suspicious)}")

for s in suspicious:
    year = s["year"]
    pid = s["player_id"]
    csv_path = Path(s["file"])
    line_no = s["line"]

    row = read_csv_line(csv_path, line_no)
    if not row:
        continue

    csv_era = norm(row.get("ERA") or row.get("era") or row.get("防御率") or "")
    if not csv_era:
        continue

    html_path = root / f"_data/cache/npb_player_page/{pid}.html"
    if not html_path.is_file():
        continue

    try:
        hits = find_year_rows_in_html(html_path, year)
    except Exception as e:
        continue

    for table_idx, header, cells in hits:
        for i, cell in enumerate(cells):
            if norm(cell) == csv_era:
                h = header[i] if i < len(header) else f"index_{i}"
                counter[h] += 1
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

with out_path.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=[
        "year", "player_id", "player_name",
        "csv_ERA", "matched_html_index", "matched_html_header",
        "table_idx", "html_row", "csv_file", "line"
    ])
    w.writeheader()
    w.writerows(rows_out)

print()
print("=== CSV ERA value matched HTML column ===")
for k, v in counter.most_common(30):
    print(v, k)

print()
print("matched rows:", len(rows_out))
print("Wrote:", out_path)
