import csv
import json
import re
from pathlib import Path
from collections import Counter, defaultdict

root = Path(".")
out_dir = root / "_reports/debug_era_missing"
out_dir.mkdir(parents=True, exist_ok=True)

CSV_TARGETS = [
    ("staging", root / "_data/master_csv__rescrape_staging"),
    ("master", root / "_data/master_csv"),
    ("calculated", root / "master_csv_calculated"),
]

ERA_COL_CANDIDATES = [
    "ERA",
    "era",
    "防御率",
    "earned_run_average",
    "earnedRunAverage",
]

PID_COL_CANDIDATES = [
    "player_id",
    "npb_player_id",
    "id",
]

NAME_COL_CANDIDATES = [
    "player_name_ja",
    "player_name",
    "name_ja",
]

def pick_col(headers, candidates):
    for c in candidates:
        if c in headers:
            return c
    return None

def is_missing_era(v):
    if v is None:
        return True
    s = str(v).strip()
    return s == "" or s in {"-", "—", "null", "None", "nan", "NaN"}

def is_numeric_era(v):
    if is_missing_era(v):
        return False
    s = str(v).strip()
    try:
        float(s)
        return True
    except Exception:
        return False

def parse_year_league(path):
    m = re.search(r"pitching_(\d{4})_(CL|PL)_from_master\.csv$", path.name)
    if not m:
        return None, None
    return int(m.group(1)), m.group(2)

summary_rows = []
missing_rows = []

for label, d in CSV_TARGETS:
    if not d.exists():
        continue

    for p in sorted(d.glob("pitching_*_from_master.csv")):
        year, league = parse_year_league(p)
        if not year:
            continue

        try:
            with p.open(encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                headers = reader.fieldnames or []
                era_col = pick_col(headers, ERA_COL_CANDIDATES)
                pid_col = pick_col(headers, PID_COL_CANDIDATES)
                name_col = pick_col(headers, NAME_COL_CANDIDATES)

                total = 0
                missing = 0
                invalid = 0
                zero = 0

                for i, row in enumerate(reader, start=2):
                    total += 1
                    era = row.get(era_col) if era_col else None

                    if is_missing_era(era):
                        missing += 1
                        missing_rows.append({
                            "layer": label,
                            "file": str(p),
                            "year": year,
                            "league": league,
                            "line": i,
                            "player_id": row.get(pid_col, "") if pid_col else "",
                            "player_name": row.get(name_col, "") if name_col else "",
                            "era_col": era_col or "",
                            "era_value": "" if era is None else era,
                            "headers_sample": "|".join(headers[:30]),
                        })
                    elif not is_numeric_era(era):
                        invalid += 1
                    elif float(str(era).strip()) == 0:
                        zero += 1

                summary_rows.append({
                    "layer": label,
                    "file": str(p),
                    "year": year,
                    "league": league,
                    "era_col": era_col or "",
                    "total_rows": total,
                    "missing_era": missing,
                    "invalid_era": invalid,
                    "zero_era": zero,
                    "headers": "|".join(headers),
                })

        except Exception as e:
            summary_rows.append({
                "layer": label,
                "file": str(p),
                "year": year,
                "league": league,
                "era_col": "",
                "total_rows": 0,
                "missing_era": "ERROR",
                "invalid_era": "ERROR",
                "zero_era": "ERROR",
                "headers": f"ERROR: {e}",
            })

summary_path = out_dir / "era_csv_summary.csv"
missing_path = out_dir / "era_missing_rows.csv"

with summary_path.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=[
        "layer", "file", "year", "league", "era_col",
        "total_rows", "missing_era", "invalid_era", "zero_era", "headers"
    ])
    w.writeheader()
    w.writerows(summary_rows)

with missing_path.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=[
        "layer", "file", "year", "league", "line",
        "player_id", "player_name", "era_col", "era_value", "headers_sample"
    ])
    w.writeheader()
    w.writerows(missing_rows)

print("=== ERA CSV layer summary ===")
by_layer = defaultdict(lambda: {"files": 0, "rows": 0, "missing": 0, "invalid": 0})
for r in summary_rows:
    layer = r["layer"]
    by_layer[layer]["files"] += 1
    if isinstance(r["total_rows"], int):
        by_layer[layer]["rows"] += r["total_rows"]
    if isinstance(r["missing_era"], int):
        by_layer[layer]["missing"] += r["missing_era"]
    if isinstance(r["invalid_era"], int):
        by_layer[layer]["invalid"] += r["invalid_era"]

for layer, s in by_layer.items():
    print(f"{layer}: files={s['files']} rows={s['rows']} missing_era={s['missing']} invalid_era={s['invalid']}")

print()
print(f"Wrote: {summary_path}")
print(f"Wrote: {missing_path}")

# Staging missing の原因を meta / html cache から軽く見る
staging_missing = [r for r in missing_rows if r["layer"] == "staging"]
probe_rows = []

meta_dir = root / "_data/derived/npb_player_meta"
cache_dir = root / "_data/cache/npb_player_page"

def find_era_in_obj(obj):
    hits = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if str(k).lower() in {"era", "防御率", "earned_run_average"} or "防御率" in str(k):
                hits.append((str(k), v))
            hits.extend(find_era_in_obj(v))
    elif isinstance(obj, list):
        for x in obj:
            hits.extend(find_era_in_obj(x))
    return hits

def html_has_year_row(html, year):
    # BeautifulSoup があれば使う。なければ簡易判定。
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        rows = []
        for tr in soup.find_all("tr"):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            if cells and str(year) in cells[0]:
                rows.append(cells)
        return rows
    except Exception:
        return []

for r in staging_missing[:300]:
    pid = r["player_id"]
    year = str(r["year"])
    meta_path = meta_dir / f"{pid}.json"
    cache_path = cache_dir / f"{pid}.html"

    meta_status = "no_player_id" if not pid else "missing_meta"
    meta_era_hits = ""
    html_status = "missing_cache"
    html_year_rows = 0
    html_row_sample = ""

    if pid and meta_path.exists():
        try:
            data = json.loads(meta_path.read_text(encoding="utf-8"))
            hits = find_era_in_obj(data)
            year_obj = (data.get("pitching_rows_by_year") or {}).get(year)
            year_hits = find_era_in_obj(year_obj) if year_obj is not None else []
            if year_obj is None:
                meta_status = "meta_exists_but_no_year_row"
            elif year_hits:
                meta_status = "meta_year_has_era"
            else:
                meta_status = "meta_year_row_but_no_era"

            meta_era_hits = "|".join([f"{k}={v}" for k, v in year_hits[:5]]) or "|".join([f"{k}={v}" for k, v in hits[:5]])
        except Exception as e:
            meta_status = f"broken_meta:{e}"

    if pid and cache_path.exists():
        try:
            html = cache_path.read_text(encoding="utf-8", errors="ignore")
            rows = html_has_year_row(html, year)
            html_year_rows = len(rows)
            html_status = "html_year_row_found" if rows else "html_exists_but_year_row_not_found"
            if rows:
                html_row_sample = " | ".join(rows[0][:25])
        except Exception as e:
            html_status = f"broken_html:{e}"

    probe_rows.append({
        **r,
        "meta_status": meta_status,
        "meta_era_hits": meta_era_hits,
        "html_status": html_status,
        "html_year_rows": html_year_rows,
        "html_row_sample": html_row_sample,
    })

probe_path = out_dir / "era_missing_staging_probe.csv"
with probe_path.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=[
        "layer", "file", "year", "league", "line",
        "player_id", "player_name", "era_col", "era_value",
        "headers_sample",
        "meta_status", "meta_era_hits",
        "html_status", "html_year_rows", "html_row_sample",
    ])
    w.writeheader()
    w.writerows(probe_rows)

print(f"Wrote: {probe_path}")

print()
print("=== Staging missing ERA probe summary ===")
print("staging_missing_rows:", len(staging_missing))
print("meta_status:", dict(Counter(r["meta_status"] for r in probe_rows)))
print("html_status:", dict(Counter(r["html_status"] for r in probe_rows)))

print()
print("=== Likely cause guide ===")
if by_layer.get("staging", {}).get("missing", 0) > 0:
    print("staging に ERA 欠損あり: scrape/parser/writer 側の問題候補です。")
else:
    print("staging に ERA 欠損なし: Phase 4 の apply/rebuild/calculated/public JSON 側で消えている可能性が高いです。")

meta_counts = Counter(r["meta_status"] for r in probe_rows)
html_counts = Counter(r["html_status"] for r in probe_rows)

if meta_counts.get("meta_year_has_era", 0) > 0:
    print("meta には ERA があるのに staging CSV が空の行あり: CSV writer の列名/書き込み漏れが疑わしいです。")
if meta_counts.get("meta_year_row_but_no_era", 0) > 0:
    print("meta の年度行には到達しているが ERA が無い: header mapping / old_format offset が疑わしいです。")
if html_counts.get("html_year_row_found", 0) > 0 and meta_counts.get("meta_exists_but_no_year_row", 0) > 0:
    print("HTMLには年度行があるのに meta に年度行が無い: 投手行判定・テーブル判定が疑わしいです。")
if html_counts.get("missing_cache", 0) > 0:
    print("HTML cache が無い行あり: そもそも対象選手ページを取得していない可能性があります。")
