import csv
import re
from pathlib import Path
from collections import Counter, defaultdict

root = Path(".")
out_dir = root / "_reports/debug_era_missing"
out_dir.mkdir(parents=True, exist_ok=True)

TARGET_DIRS = [
    ("staging", root / "_data/master_csv__rescrape_staging"),
    ("master", root / "_data/master_csv"),
    ("calculated", root / "master_csv_calculated"),
]

ERA_COLS = ["ERA", "era", "防御率"]
ER_COLS = ["ER", "er", "自責点", "earned_runs", "earnedRun", "earned_run"]
IP_COLS = ["IP", "ip", "投球回", "innings_pitched", "inningsPitched"]
R_COLS = ["R", "r", "失点", "runs"]

PID_COLS = ["player_id", "npb_player_id", "id"]
NAME_COLS = ["player_name_ja", "player_name", "name_ja"]
TEAM_COLS = ["team", "team_id", "team_name", "球団"]

def pick(headers, candidates):
    for c in candidates:
        if c in headers:
            return c
    return None

def to_float(v):
    if v is None:
        return None
    s = str(v).strip()
    if not s or s in {"-", "—", "null", "None", "nan", "NaN"}:
        return None
    s = s.replace(",", "")
    try:
        return float(s)
    except Exception:
        return None

def parse_ip(v):
    """
    NPB系CSVでよくある 12.1 / 12.2 を
    12 + 1/3, 12 + 2/3 として扱う。
    """
    if v is None:
        return None
    s = str(v).strip()
    if not s or s in {"-", "—"}:
        return None

    s = s.replace("⅓", ".1").replace("⅔", ".2")

    # 12 1/3, 12+1/3 など
    m = re.match(r"^(\d+)\s*(?:\+|\s)?\s*([12])/3$", s)
    if m:
        return int(m.group(1)) + int(m.group(2)) / 3

    # 12.1 / 12.2 形式
    if re.match(r"^\d+\.[12]$", s):
        whole, frac = s.split(".")
        return int(whole) + int(frac) / 3

    # 普通の整数・小数
    try:
        return float(s)
    except Exception:
        return None

def parse_year_league(path):
    m = re.search(r"pitching_(\d{4})_(CL|PL)_from_master\.csv$", path.name)
    if not m:
        return None, None
    return int(m.group(1)), m.group(2)

rows_out = []
summary = []

for layer, d in TARGET_DIRS:
    if not d.exists():
        continue

    for path in sorted(d.glob("pitching_*_from_master.csv")):
        year, league = parse_year_league(path)
        if not year:
            continue

        with path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []

            era_col = pick(headers, ERA_COLS)
            er_col = pick(headers, ER_COLS)
            ip_col = pick(headers, IP_COLS)
            r_col = pick(headers, R_COLS)
            pid_col = pick(headers, PID_COLS)
            name_col = pick(headers, NAME_COLS)
            team_col = pick(headers, TEAM_COLS)

            total = 0
            era_numeric = 0
            era_equals_er = 0
            era_equals_r = 0
            era_calc_mismatch = 0
            era_too_high = 0
            suspicious = 0

            for line, row in enumerate(reader, start=2):
                total += 1

                era = to_float(row.get(era_col)) if era_col else None
                er = to_float(row.get(er_col)) if er_col else None
                r = to_float(row.get(r_col)) if r_col else None
                ip = parse_ip(row.get(ip_col)) if ip_col else None

                if era is None:
                    continue

                era_numeric += 1

                calc_era = None
                if er is not None and ip is not None and ip > 0:
                    calc_era = round(er * 9 / ip, 2)

                flags = []

                if er is not None and abs(era - er) < 0.001:
                    era_equals_er += 1
                    flags.append("era_equals_er")

                if r is not None and abs(era - r) < 0.001:
                    era_equals_r += 1
                    flags.append("era_equals_r")

                if calc_era is not None and abs(era - calc_era) > 0.03:
                    era_calc_mismatch += 1
                    flags.append(f"calc_mismatch:{calc_era}")

                if era >= 20:
                    era_too_high += 1
                    flags.append("era_too_high")

                # ERAがERと一致していて、計算ERAとはズレるならかなり怪しい
                if ("era_equals_er" in flags and any(x.startswith("calc_mismatch") for x in flags)) or era >= 20:
                    suspicious += 1
                    rows_out.append({
                        "layer": layer,
                        "file": str(path),
                        "year": year,
                        "league": league,
                        "line": line,
                        "player_id": row.get(pid_col, "") if pid_col else "",
                        "player_name": row.get(name_col, "") if name_col else "",
                        "team": row.get(team_col, "") if team_col else "",
                        "ERA_col": era_col or "",
                        "ERA_value": row.get(era_col, "") if era_col else "",
                        "ER_col": er_col or "",
                        "ER_value": row.get(er_col, "") if er_col else "",
                        "R_col": r_col or "",
                        "R_value": row.get(r_col, "") if r_col else "",
                        "IP_col": ip_col or "",
                        "IP_value": row.get(ip_col, "") if ip_col else "",
                        "calculated_ERA_from_ER_IP": calc_era if calc_era is not None else "",
                        "flags": "|".join(flags),
                    })

            summary.append({
                "layer": layer,
                "file": str(path),
                "year": year,
                "league": league,
                "ERA_col": era_col or "",
                "ER_col": er_col or "",
                "IP_col": ip_col or "",
                "R_col": r_col or "",
                "total_rows": total,
                "era_numeric": era_numeric,
                "era_equals_er": era_equals_er,
                "era_equals_r": era_equals_r,
                "era_calc_mismatch": era_calc_mismatch,
                "era_too_high": era_too_high,
                "suspicious": suspicious,
                "headers": "|".join(headers),
            })

summary_path = out_dir / "era_is_er_summary.csv"
detail_path = out_dir / "era_is_er_suspicious_rows.csv"

with summary_path.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=[
        "layer", "file", "year", "league",
        "ERA_col", "ER_col", "IP_col", "R_col",
        "total_rows", "era_numeric",
        "era_equals_er", "era_equals_r",
        "era_calc_mismatch", "era_too_high", "suspicious",
        "headers"
    ])
    w.writeheader()
    w.writerows(summary)

with detail_path.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=[
        "layer", "file", "year", "league", "line",
        "player_id", "player_name", "team",
        "ERA_col", "ERA_value",
        "ER_col", "ER_value",
        "R_col", "R_value",
        "IP_col", "IP_value",
        "calculated_ERA_from_ER_IP",
        "flags",
    ])
    w.writeheader()
    w.writerows(rows_out)

print("=== ERA is actually ER check ===")

by_layer = defaultdict(Counter)
for r in summary:
    layer = r["layer"]
    for k in ["total_rows", "era_numeric", "era_equals_er", "era_equals_r", "era_calc_mismatch", "era_too_high", "suspicious"]:
        by_layer[layer][k] += int(r[k])

for layer, c in by_layer.items():
    print()
    print(layer)
    print("  total_rows:", c["total_rows"])
    print("  era_numeric:", c["era_numeric"])
    print("  era_equals_er:", c["era_equals_er"])
    print("  era_equals_r:", c["era_equals_r"])
    print("  era_calc_mismatch:", c["era_calc_mismatch"])
    print("  era_too_high:", c["era_too_high"])
    print("  suspicious:", c["suspicious"])

print()
print("Wrote:", summary_path)
print("Wrote:", detail_path)

print()
print("=== Top suspicious files ===")
top = sorted(summary, key=lambda r: int(r["suspicious"]), reverse=True)[:20]
for r in top:
    if int(r["suspicious"]) > 0:
        print(
            r["layer"],
            r["year"],
            r["league"],
            "suspicious=" + str(r["suspicious"]),
            "era_equals_er=" + str(r["era_equals_er"]),
            "calc_mismatch=" + str(r["era_calc_mismatch"]),
            r["file"],
        )
