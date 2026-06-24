import csv
from pathlib import Path
from collections import Counter

root = Path(".")
out_dir = root / "_reports/debug_era_missing"
out_dir.mkdir(parents=True, exist_ok=True)

suspicious_path = out_dir / "era_is_er_suspicious_rows.csv"
out_path = out_dir / "exact_html_pitching_column_compare.csv"

LIMIT = 300

def norm(v):
    return str(v).strip().replace(",", "")

def norm_num(v):
    s = norm(v)
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

def find_pitching_year_rows(html_path, year):
    from bs4 import BeautifulSoup

    html = html_path.read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")

    hits = []

    for table_idx, table in enumerate(soup.find_all("table")):
        rows = table.find_all("tr")

        headers = []
        for tr in rows:
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            joined = "|".join(cells)
            if "防御率" in joined and "自責点" in joined and "投球回" in joined:
                headers = cells
                break

        if not headers:
            continue

        header_map = {}
        for i, h in enumerate(headers):
            header_map.setdefault(h, i)

        for tr in rows:
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            if cells and str(year) in cells:
                hits.append((table_idx, headers, header_map, cells))

    return hits

def pick(row, names):
    for n in names:
        if n in row:
            return row.get(n, "")
    return ""

with suspicious_path.open(encoding="utf-8-sig", newline="") as f:
    suspicious_all = [
        r for r in csv.DictReader(f)
        if r.get("layer") == "staging" and "era_too_high" in (r.get("flags") or "")
    ]

# ファイルごとに偏りすぎないように最大5件ずつ
picked = []
seen_file_count = Counter()

for r in suspicious_all:
    key = r.get("file")
    if seen_file_count[key] >= 5:
        continue
    picked.append(r)
    seen_file_count[key] += 1
    if len(picked) >= LIMIT:
        break

csv_cache = {}
html_cache = {}

summary = Counter()
rows_out = []

for s in picked:
    year = s["year"]
    pid = s["player_id"]
    csv_path = Path(s["file"])
    line_no = s["line"]

    if csv_path not in csv_cache:
        csv_cache[csv_path] = read_csv_file(csv_path)

    csv_row = csv_cache[csv_path].get(str(line_no))
    if not csv_row:
        summary["csv_row_missing"] += 1
        continue

    html_path = root / f"_data/cache/npb_player_page/{pid}.html"
    if not html_path.is_file():
        summary["html_missing"] += 1
        continue

    html_key = (html_path, year)
    if html_key not in html_cache:
        try:
            html_cache[html_key] = find_pitching_year_rows(html_path, year)
        except Exception as e:
            html_cache[html_key] = []
            summary[f"html_parse_error:{type(e).__name__}"] += 1

    hits = html_cache[html_key]
    if not hits:
        summary["pitching_year_row_not_found"] += 1
        continue

    # 最初の投手テーブルヒットを見る
    table_idx, headers, header_map, cells = hits[0]

    def html_value(label):
        i = header_map.get(label)
        if i is None or i >= len(cells):
            return ""
        return cells[i]

    csv_ip = pick(csv_row, ["IP", "投球回", "innings_pitched"])
    csv_er = pick(csv_row, ["ER", "自責点", "earned_runs"])
    csv_era = pick(csv_row, ["ERA", "防御率", "era"])

    html_ip = html_value("投球回")
    html_er = html_value("自責点")
    html_era = html_value("防御率")

    ip_match = norm_num(csv_ip) == norm_num(html_ip)
    er_match = norm_num(csv_er) == norm_num(html_er)
    era_match = norm_num(csv_era) == norm_num(html_era)

    summary[f"ip_match={ip_match}"] += 1
    summary[f"er_match={er_match}"] += 1
    summary[f"era_match={era_match}"] += 1

    rows_out.append({
        "year": year,
        "player_id": pid,
        "player_name": s.get("player_name", ""),
        "csv_IP": csv_ip,
        "html_投球回": html_ip,
        "ip_match": ip_match,
        "csv_ER": csv_er,
        "html_自責点": html_er,
        "er_match": er_match,
        "csv_ERA": csv_era,
        "html_防御率": html_era,
        "era_match": era_match,
        "table_idx": table_idx,
        "html_headers": "|".join(headers),
        "html_row": "|".join(cells),
        "csv_file": str(csv_path),
        "line": line_no,
    })

with out_path.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=[
        "year", "player_id", "player_name",
        "csv_IP", "html_投球回", "ip_match",
        "csv_ER", "html_自責点", "er_match",
        "csv_ERA", "html_防御率", "era_match",
        "table_idx", "html_headers", "html_row", "csv_file", "line",
    ])
    w.writeheader()
    w.writerows(rows_out)

print("=== Exact HTML pitching column compare ===")
print(f"sample rows: {len(picked)}")
for k, v in summary.most_common():
    print(v, k)

print()
print("Wrote:", out_path)
