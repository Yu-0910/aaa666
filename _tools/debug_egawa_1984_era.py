import csv
import json
from pathlib import Path

root = Path(".")

YEAR = "1984"
LEAGUE = "CL"
NAME_KEYWORD = "江川"

paths = {
    "staging": root / f"_data/master_csv__rescrape_staging/pitching_{YEAR}_{LEAGUE}_from_master.csv",
    "master": root / f"_data/master_csv/pitching_{YEAR}_{LEAGUE}_from_master.csv",
}

def find_rows(path):
    hits = []
    if not path.is_file():
        return [], []
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        for line, row in enumerate(reader, start=2):
            name = (
                row.get("player_name_ja")
                or row.get("player_name")
                or row.get("name_ja")
                or ""
            )
            if NAME_KEYWORD in name:
                hits.append((line, row))
    return headers, hits

def print_csv_row(label, path):
    print()
    print("=" * 100)
    print(f"CSV: {label}")
    print(path)

    headers, hits = find_rows(path)

    if not path.is_file():
        print("FILE MISSING")
        return None

    print()
    print("--- headers ---")
    for i, h in enumerate(headers):
        print(f"[{i:02d}] {h}")

    if not hits:
        print()
        print(f"No row found for name containing: {NAME_KEYWORD}")
        return None

    for line, row in hits:
        print()
        print(f"--- row line={line} ---")
        for i, h in enumerate(headers):
            v = row.get(h, "")
            print(f"[{i:02d}] {h} = {v}")

        print()
        print("--- important fields ---")
        for k in [
            "player_id",
            "player_name_ja",
            "team",
            "G",
            "W",
            "L",
            "IP",
            "H",
            "R",
            "ER",
            "ERA",
            "防御率",
            "自責点",
            "投球回",
            "失点",
        ]:
            if k in row:
                print(f"{k} = {row.get(k)}")

        return row

    return None

staging_row = print_csv_row("staging", paths["staging"])
master_row = print_csv_row("master", paths["master"])

row = staging_row or master_row
if not row:
    raise SystemExit

pid = (row.get("player_id") or row.get("npb_player_id") or "").strip()

print()
print("=" * 100)
print("Detected player_id:", pid)

if not pid:
    print("No player_id found. Cannot inspect HTML cache.")
    raise SystemExit

# meta確認
meta_path = root / f"_data/derived/npb_player_meta/{pid}.json"
print()
print("=" * 100)
print("META:", meta_path)

if meta_path.is_file():
    try:
        data = json.loads(meta_path.read_text(encoding="utf-8"))
        pitching = data.get("pitching_rows_by_year") or {}
        yrow = pitching.get(YEAR)
        print("meta has 1984 row:", bool(yrow))
        if yrow:
            for k, v in yrow.items():
                print(f"{k} = {v}")
    except Exception as e:
        print("meta read error:", e)
else:
    print("meta missing")

# HTML確認
html_path = root / f"_data/cache/npb_player_page/{pid}.html"
print()
print("=" * 100)
print("HTML:", html_path)

if not html_path.is_file():
    print("HTML cache missing")
    raise SystemExit

try:
    from bs4 import BeautifulSoup
except Exception as e:
    print("BeautifulSoup import failed:", e)
    raise SystemExit

html = html_path.read_text(encoding="utf-8", errors="ignore")
soup = BeautifulSoup(html, "html.parser")

print()
print("--- HTML rows containing 1984 ---")

found = 0

for table_idx, table in enumerate(soup.find_all("table")):
    rows = table.find_all("tr")

    # 近くのヘッダー候補
    header_candidates = []
    for tr in rows:
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
        if not cells:
            continue
        joined = "|".join(cells)
        if any(x in joined for x in ["防御率", "自責点", "投球回", "登板", "勝利", "敗北", "失点"]):
            header_candidates.append(cells)

    header = header_candidates[-1] if header_candidates else []

    for tr_idx, tr in enumerate(rows):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
        if not cells:
            continue
        if YEAR not in cells:
            continue

        found += 1

        print()
        print(f"--- table={table_idx} tr={tr_idx} ---")

        print("HEADER:")
        for i, h in enumerate(header):
            print(f"[{i:02d}] {h}")

        print("ROW:")
        for i, v in enumerate(cells):
            label = header[i] if i < len(header) else f"index_{i}"
            print(f"[{i:02d}] {label} = {v}")

        # 重要列を明示
        print()
        print("IMPORTANT HTML VALUES:")
        for target in ["投球回", "自責点", "防御率", "失点", "安打"]:
            if target in header:
                i = header.index(target)
                val = cells[i] if i < len(cells) else ""
                print(f"{target} = {val}")

print()
print("HTML 1984 row hits:", found)
