import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RANKINGS_DIR = ROOT / "public" / "data" / "rankings"
REPORT_PATH = ROOT / "_reports" / "patch_ranking_links_from_master_ids.csv"

MASTER_DIRS = [
    ROOT / "_data" / "master_csv",
    ROOT / "_data" / "master_csv_calculated",
]

def norm_name(s):
    s = str(s or "").strip()
    s = s.replace("　", " ")
    s = re.sub(r"\s+", "", s)
    # F.グリフィン / Ｔ．ハーン / J.ゲラ などを グリフィン / ハーン / ゲラ に寄せる
    s = re.sub(r"^(?:[A-Za-zＡ-Ｚａ-ｚ][\.\．])+", "", s)
    return s

def norm_team(s):
    t = str(s or "").strip()
    aliases = {
        "大映スターズ": "オリックス・バファローズ",
        "毎日オリオンズ": "千葉ロッテマリーンズ",
        "西鉄ライオンズ": "埼玉西武ライオンズ",
        "南海ホークス": "福岡ソフトバンクホークス",
    }
    return aliases.get(t, t)

def year_from_path(p):
    for part in p.parts:
        if part.isdigit() and len(part) == 4:
            return part
    return ""

def league_from_path(p):
    parts = list(p.parts)
    for i, part in enumerate(parts):
        if part.isdigit() and len(part) == 4 and i + 1 < len(parts):
            return parts[i + 1]
    return ""

def add_candidate(bucket, key, item):
    if not key:
        return
    bucket[key].append(item)

def unique_map(bucket):
    out = {}
    for key, items in bucket.items():
        ids = {x["npb_id"] for x in items if x.get("npb_id")}
        if len(ids) != 1:
            continue

        chosen = None
        for x in items:
            if x.get("roman"):
                chosen = x
                break
        if chosen is None:
            chosen = items[0]

        out[key] = chosen
    return out

def load_master_indexes():
    by_year_team_name = defaultdict(list)
    by_year_league_name = defaultdict(list)
    by_team_name = defaultdict(list)

    files = []
    for d in MASTER_DIRS:
        if d.exists():
            files.extend(d.rglob("*.csv"))

    for p in files:
        path_str = str(p)
        if "__backup" in path_str or "__import" in path_str:
            continue

        try:
            with p.open("r", encoding="utf-8-sig", newline="") as f:
                reader = csv.reader(f)
                for row in reader:
                    if len(row) < 6:
                        continue

                    year = str(row[0]).strip()
                    league = str(row[1]).strip()
                    team = norm_team(row[2])
                    npb_id = str(row[3]).strip()
                    name = str(row[4]).strip()
                    roman = str(row[5]).strip()

                    if not year.isdigit() or not league or not npb_id or not name:
                        continue

                    n = norm_name(name)
                    item = {
                        "npb_id": npb_id,
                        "name": name,
                        "team": team,
                        "league": league,
                        "year": year,
                        "roman": roman,
                        "source_file": str(p.relative_to(ROOT)),
                    }

                    add_candidate(by_year_team_name, (year, team, n), item)
                    add_candidate(by_year_league_name, (year, league, n), item)
                    add_candidate(by_team_name, (team, n), item)

        except Exception as e:
            print(f"skip: {p} ({e})")

    return {
        "year_team_name": unique_map(by_year_team_name),
        "year_league_name": unique_map(by_year_league_name),
        "team_name": unique_map(by_team_name),
    }

def iter_rows(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for k in ("rows", "data", "rankings"):
            v = data.get(k)
            if isinstance(v, list):
                return v
    return []

def find_hit(indexes, year, league, team, name):
    n = norm_name(name)
    t = norm_team(team)

    # 1. 年度 + 球団 + 名前
    if year and t:
        hit = indexes["year_team_name"].get((year, t, n))
        if hit:
            return hit, "master_year_team_name"

    # 2. 年度 + リーグ + 名前
    # 2024 PL なのに team が「西鉄」「南海」などになるケースの安全対策
    if year and league:
        hit = indexes["year_league_name"].get((year, league, n))
        if hit:
            return hit, "master_year_league_name"

    # 3. 球団 + 名前
    if t:
        hit = indexes["team_name"].get((t, n))
        if hit:
            return hit, "master_team_name"

    # 名前だけ一致は使わない
    return None, ""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only-name", default="")
    args = ap.parse_args()

    only = norm_name(args.only_name)
    indexes = load_master_indexes()

    print("master index:")
    print("  year+team+name:", len(indexes["year_team_name"]))
    print("  year+league+name:", len(indexes["year_league_name"]))
    print("  team+name:", len(indexes["team_name"]))
    print("  unique name: disabled")

    patched = []
    changed_files = 0

    for p in RANKINGS_DIR.rglob("*.json"):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue

        rows = iter_rows(data)
        if not isinstance(rows, list):
            continue

        year = year_from_path(p)
        league = league_from_path(p)
        changed = False

        for r in rows:
            if not isinstance(r, dict):
                continue

            old_id = str(r.get("playerId") or "").strip()
            if not old_id.startswith("player-"):
                continue

            name = r.get("name") or r.get("player") or ""
            team = r.get("team") or ""

            if only and norm_name(name) != only:
                continue

            hit, source = find_hit(indexes, year, league, team, name)
            if not hit:
                continue

            new_id = hit["npb_id"]
            roman = hit.get("roman", "")

            patched.append({
                "file": str(p.relative_to(ROOT)),
                "year": year,
                "league": league,
                "name": str(name),
                "team": str(team),
                "old_playerId": old_id,
                "new_playerId": new_id,
                "romanName": roman,
                "source": source,
                "source_file": hit.get("source_file", ""),
            })

            if not args.dry_run:
                r["playerId"] = new_id
                r["npbPlayerId"] = new_id
                if not r.get("romanName") and roman:
                    r["romanName"] = roman
                changed = True

        if changed:
            p.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            changed_files += 1

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        fieldnames = [
            "file", "year", "league", "name", "team",
            "old_playerId", "new_playerId",
            "romanName", "source", "source_file",
        ]
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(patched)

    label = "[dry-run] " if args.dry_run else ""
    print(f"{label}patched rows: {len(patched)}")
    print(f"files changed: {changed_files}")
    print(f"report: {REPORT_PATH}")

    for row in patched[:30]:
        print(f"{row['file']}: {row['name']} {row['team']} {row['old_playerId']} -> {row['new_playerId']} ({row['romanName']}) [{row['source']}]")

if __name__ == "__main__":
    main()
