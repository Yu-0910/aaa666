import csv
import re
from pathlib import Path

root = Path(".")
out_dir = root / "_reports/debug_era_missing"
out_dir.mkdir(parents=True, exist_ok=True)

suspicious_path = out_dir / "era_is_er_suspicious_rows.csv"
output_path = out_dir / "era_html_csv_index_probe.txt"

def read_csv_row(path, pid, line_no=None):
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        for i, row in enumerate(reader, start=2):
            if line_no and i == int(line_no):
                return headers, row
            if pid and (row.get("player_id") or "").strip() == pid:
                return headers, row
    return [], None

def find_year_rows_in_html(html_path, year):
    try:
        from bs4 import BeautifulSoup
    except Exception as e:
        return [("BS4_ERROR", [f"BeautifulSoup import failed: {e}"], [])]

    html = html_path.read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")

    hits = []

    for table_idx, table in enumerate(soup.find_all("table")):
        table_rows = table.find_all("tr")

        header_candidates = []
        for tr in table_rows:
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            if cells:
                # 防御率・自責点・投球回などを含む行をヘッダー候補にする
                joined = "|".join(cells)
                if any(x in joined for x in ["防御率", "自責点", "投球回", "奪三振", "勝利", "敗北", "勝", "敗"]):
                    header_candidates.append(cells)

        best_header = header_candidates[-1] if header_candidates else []

        for tr in table_rows:
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            if not cells:
                continue

            # 年度が行内にあるものを拾う
            if str(year) in cells:
                hits.append((f"table_{table_idx}", best_header, cells))

    return hits

def fmt_indexed(items):
    if not items:
        return "  <none>"
    return "\n".join(f"  [{i:02d}] {v}" for i, v in enumerate(items))

def compact_csv_values(headers, row):
    lines = []
    for i, h in enumerate(headers):
        v = row.get(h, "")
        if str(v).strip() != "":
            lines.append(f"  [{i:02d}] {h} = {v}")
    return "\n".join(lines)

# suspiciousから staging の era_too_high を優先して最大10件
samples = []
with suspicious_path.open(encoding="utf-8-sig", newline="") as f:
    for r in csv.DictReader(f):
        if r.get("layer") != "staging":
            continue
        if "era_too_high" not in (r.get("flags") or ""):
            continue
        samples.append(r)
        if len(samples) >= 10:
            break

lines = []
lines.append("=== ERA CSV vs NPB HTML index probe ===")
lines.append(f"samples: {len(samples)}")
lines.append("")

for idx, s in enumerate(samples, start=1):
    year = s["year"]
    league = s["league"]
    pid = s["player_id"]
    name = s["player_name"]
    file_path = Path(s["file"])
    line_no = s["line"]

    lines.append("")
    lines.append("=" * 100)
    lines.append(f"SAMPLE {idx}: year={year} league={league} pid={pid} name={name} line={line_no}")
    lines.append(f"csv_file={file_path}")
    lines.append(f"flags={s.get('flags')}")
    lines.append("")

    headers, row = read_csv_row(file_path, pid, line_no=line_no)

    lines.append("--- CSV headers ---")
    lines.append(fmt_indexed(headers))
    lines.append("")

    lines.append("--- CSV row values ---")
    if row:
        lines.append(compact_csv_values(headers, row))
    else:
        lines.append("  CSV row not found")
    lines.append("")

    html_path = root / f"_data/cache/npb_player_page/{pid}.html"
    lines.append(f"--- HTML cache: {html_path} ---")
    if not html_path.is_file():
        lines.append("  HTML cache missing")
        continue

    hits = find_year_rows_in_html(html_path, year)
    if not hits:
        lines.append("  No HTML row found for this year")
        continue

    for hit_idx, (table_name, header, cells) in enumerate(hits[:5], start=1):
        lines.append("")
        lines.append(f"--- HTML hit {hit_idx}: {table_name} ---")
        lines.append("HTML header indexed:")
        lines.append(fmt_indexed(header))
        lines.append("HTML data row indexed:")
        lines.append(fmt_indexed(cells))

output_path.write_text("\n".join(lines), encoding="utf-8")

print(f"Wrote: {output_path}")
print()
print("Open this file and compare:")
print("  CSV row values の ERA")
print("  HTML data row indexed の 防御率/自責点/失点/投球回")
print()
print("PowerShell:")
print(f"notepad {output_path}")
