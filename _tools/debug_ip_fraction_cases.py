import csv
from pathlib import Path
from bs4 import BeautifulSoup

root = Path(".")
report = root / "_reports/npb_rescrape_phase3_1_staging_validation.txt"

# summarize report の mismatch 例から手動で拾った先頭候補
targets = [
    ("1950", "CL", "03203801", "松田"),
    ("1950", "CL", "91993801", "加藤"),
    ("1950", "CL", "11913801", "荻原"),
    ("1950", "CL", "13513801", "寺島"),
    ("1950", "CL", "21523898", "中津"),
]

def show_case(year, league, pid, name_hint):
    csv_path = root / f"_data/master_csv__rescrape_staging/pitching_{year}_{league}_from_master.csv"
    html_path = root / f"_data/cache/npb_player_page/{pid}.html"

    print()
    print("=" * 100)
    print(year, league, pid, name_hint)
    print("CSV:", csv_path)

    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("player_id") == pid:
                print("--- CSV row ---")
                for k in ["player_name_ja", "G", "W", "L", "BF", "IP", "H", "R", "ER", "ERA"]:
                    print(f"{k} = {row.get(k)}")
                break

    print("HTML:", html_path)
    if not html_path.is_file():
        print("HTML missing")
        return

    soup = BeautifulSoup(html_path.read_text(encoding="utf-8", errors="ignore"), "html.parser")

    for table_idx, table in enumerate(soup.find_all("table")):
        text = table.get_text(" ", strip=True)
        if not all(x in text for x in ["投球回", "自責点", "防御率"]):
            continue

        for tr_idx, tr in enumerate(table.find_all("tr")):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            if cells and cells[0] == year:
                print(f"--- HTML table={table_idx} tr={tr_idx} len={len(cells)} ---")
                for i, v in enumerate(cells):
                    print(f"[{i:02d}] {v}")

                print("--- tail ---")
                for i in range(max(0, len(cells)-18), len(cells)):
                    print(f"[{i:02d}] {cells[i]}")

for t in targets:
    show_case(*t)
