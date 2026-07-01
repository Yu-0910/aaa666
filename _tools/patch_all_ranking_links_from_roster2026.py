import argparse
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROSTER_CSV = ROOT / "_data" / "npb_roster_2026.csv"
RANKINGS_DIR = ROOT / "public" / "data" / "rankings"
REPORT_PATH = ROOT / "_reports" / "patch_all_ranking_links_from_roster2026.csv"

def norm_name(s):
    s = re.sub(r"\s+", "", str(s or "").replace("　", " ")).strip()
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

def load_roster_index():
    index = {}
    dupes = set()

    with ROSTER_CSV.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))

    for row in rows:
        if not row or len(row) < 6:
            continue

        if row[0] in ("npb_player_id", "player_id", "id"):
            continue

        npb_id = str(row[0]).strip()
        name_ja = str(row[1]).strip() if len(row) > 1 else ""
        short_roman = str(row[4]).strip() if len(row) > 4 else ""
        team = str(row[5]).strip() if len(row) > 5 else ""

        if not npb_id or not name_ja or not team:
            continue

        key = (norm_name(name_ja), norm_team(team))

        item = {
            "npb_id": npb_id,
            "name_ja": name_ja,
            "team": team,
            "roman": short_roman,
        }

        if key in index and index[key]["npb_id"] != npb_id:
            dupes.add(key)
        else:
            index[key] = item

    for key in dupes:
        index.pop(key, None)

    return index, dupes

def iter_rows(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for k in ("rows", "data", "rankings"):
            v = data.get(k)
            if isinstance(v, list):
                return v
    return []

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only-name", default="")
    args = ap.parse_args()

    only_name = norm_name(args.only_name)
    roster_index, dupes = load_roster_index()

    patched = []
    files_changed = 0

    for path in RANKINGS_DIR.rglob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue

        rows = iter_rows(data)
        if not isinstance(rows, list):
            continue

        changed = False

        for r in rows:
            if not isinstance(r, dict):
                continue

            player_id = str(r.get("playerId") or "").strip()
            if not player_id.startswith("player-"):
                continue

            name = r.get("name") or r.get("player") or ""
            team = r.get("team") or ""

            if only_name and norm_name(name) != only_name:
                continue

            key = (norm_name(name), norm_team(team))
            hit = roster_index.get(key)
            if not hit:
                continue

            old_player_id = player_id
            new_id = hit["npb_id"]

            patched.append({
                "file": str(path.relative_to(ROOT)),
                "name": str(name),
                "team": str(team),
                "old_playerId": old_player_id,
                "new_playerId": new_id,
                "romanName": hit["roman"],
                "source": "npb_roster_2026_name_team_all_rankings",
            })

            if not args.dry_run:
                r["playerId"] = new_id
                r["npbPlayerId"] = new_id
                if not r.get("romanName") and hit["roman"]:
                    r["romanName"] = hit["roman"]
                changed = True

        if changed:
            path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            files_changed += 1

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        fieldnames = ["file", "name", "team", "old_playerId", "new_playerId", "romanName", "source"]
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(patched)

    label = "[dry-run] " if args.dry_run else ""
    print(f"roster index: {len(roster_index)} unique name+team keys")
    print(f"duplicate keys skipped: {len(dupes)}")
    print(f"{label}patched rows: {len(patched)}")
    print(f"files changed: {files_changed}")
    print(f"report: {REPORT_PATH}")

    for row in patched[:40]:
        print(f"{row['file']}: {row['name']} {row['team']} {row['old_playerId']} -> {row['new_playerId']} ({row['romanName']})")

if __name__ == "__main__":
    main()
