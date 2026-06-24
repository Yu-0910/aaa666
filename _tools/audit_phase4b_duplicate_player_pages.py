import csv
import json
import re
from collections import defaultdict
from pathlib import Path

root = Path(".")

merged_dir = root / "_data/derived/player_profile/merged"
profile_dir = root / "_data/derived/player_profile/profile_npb"
targets_path = root / "_data/npb_rescrape/targets_profile_roman.json"

out_dir = root / "_reports"
out_dir.mkdir(parents=True, exist_ok=True)

def norm_text(value):
    s = str(value or "")
    s = s.replace("\u3000", " ")
    s = re.sub(r"\s+", "", s)
    return s.strip()

def clean(value):
    return str(value or "").strip()

def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None

def profile_key(payload):
    name = norm_text(payload.get("name_ja"))
    profile = payload.get("profile") or {}
    birth = clean(profile.get("birth_date_raw"))
    debut = clean(profile.get("pro_debut_raw"))
    career = clean(profile.get("career_raw"))

    # 強めの同一人物判定：名前 + 生年月日
    # 生年月日が空なら誤検出が増えるので除外する
    if not name or not birth:
        return None

    return (name, birth)

def collect_merged_profiles():
    rows = []
    if not merged_dir.is_dir():
        raise FileNotFoundError(f"missing: {merged_dir}")

    for path in sorted(merged_dir.glob("npb_*.json")):
        pid = path.stem.removeprefix("npb_")
        payload = load_json(path)
        if not isinstance(payload, dict):
            continue
        profile = payload.get("profile") or {}
        rows.append({
            "player_id": pid,
            "path": str(path),
            "name_ja": clean(payload.get("name_ja")),
            "name_norm": norm_text(payload.get("name_ja")),
            "birth_date_raw": clean(profile.get("birth_date_raw")),
            "pro_debut_raw": clean(profile.get("pro_debut_raw")),
            "career_raw": clean(profile.get("career_raw")),
        })
    return rows

def collect_targets():
    if not targets_path.is_file():
        return set()
    data = load_json(targets_path)
    if not isinstance(data, list):
        return set()
    return {clean(r.get("player_id")) for r in data if clean(r.get("player_id"))}

def scan_usage(ids):
    """
    public/data, _data/master_csv, _data/derived の中でIDが出てくる箇所を軽く数える。
    .next や node_modules は見ない。
    """
    usage = {pid: {"count": 0, "files": []} for pid in ids}
    search_roots = [
        root / "public/data",
        root / "_data/master_csv",
        root / "_data/derived",
    ]
    suffixes = {".json", ".csv", ".tsv", ".txt"}

    for base in search_roots:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in suffixes:
                continue
            # 大きすぎるファイルは一応読むが、失敗しても無視
            try:
                text = path.read_text(encoding="utf-8-sig", errors="ignore")
            except Exception:
                continue

            for pid in ids:
                c = text.count(pid)
                if c:
                    usage[pid]["count"] += c
                    if len(usage[pid]["files"]) < 10:
                        usage[pid]["files"].append(str(path))
    return usage

rows = collect_merged_profiles()
targets = collect_targets()

groups = defaultdict(list)
for row in rows:
    key = (row["name_norm"], row["birth_date_raw"])
    if row["name_norm"] and row["birth_date_raw"]:
        groups[key].append(row)

duplicates = []
for key, items in groups.items():
    ids = sorted({r["player_id"] for r in items})
    if len(ids) >= 2:
        duplicates.append((key, items))

duplicate_ids = sorted({r["player_id"] for _, items in duplicates for r in items})
usage = scan_usage(duplicate_ids) if duplicate_ids else {}

# CSV出力
csv_path = out_dir / "phase4b_duplicate_player_pages_audit.csv"
with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow([
        "name_norm",
        "birth_date_raw",
        "player_id",
        "name_ja",
        "pro_debut_raw",
        "career_raw",
        "in_targets",
        "usage_count",
        "usage_files_sample",
        "merged_path",
    ])
    for key, items in sorted(duplicates, key=lambda x: (x[0][0], x[0][1])):
        for r in sorted(items, key=lambda x: x["player_id"]):
            pid = r["player_id"]
            w.writerow([
                key[0],
                key[1],
                pid,
                r["name_ja"],
                r["pro_debut_raw"],
                r["career_raw"],
                "yes" if pid in targets else "no",
                usage.get(pid, {}).get("count", 0),
                " | ".join(usage.get(pid, {}).get("files", [])),
                r["path"],
            ])

# 佐々木健周辺を特別表示
def is_sasaki(row):
    return "佐々木健" in row["name_norm"] or row["player_id"] in {"01005153", "1005153"}

sasaki_rows = [r for r in rows if is_sasaki(r)]
sasaki_ids = sorted({r["player_id"] for r in sasaki_rows})
sasaki_usage = scan_usage(sasaki_ids) if sasaki_ids else {}

print("=== Duplicate player page audit ===")
print(f"merged profiles: {len(rows)}")
print(f"targets: {len(targets)}")
print(f"duplicate identity groups by name+birth: {len(duplicates)}")
print(f"duplicate ids: {len(duplicate_ids)}")
print(f"Wrote: {csv_path}")
print()

print("=== Sasaki check ===")
if not sasaki_rows:
    print("No Sasaki rows found")
else:
    for r in sorted(sasaki_rows, key=lambda x: x["player_id"]):
        pid = r["player_id"]
        print(
            f"{pid} | {r['name_ja']} | birth={r['birth_date_raw']} | "
            f"debut={r['pro_debut_raw']} | usage={sasaki_usage.get(pid, {}).get('count', 0)}"
        )
        files = sasaki_usage.get(pid, {}).get("files", [])
        for fp in files[:5]:
            print(f"  - {fp}")
print()

print("=== Top duplicate groups sample ===")
for key, items in sorted(duplicates, key=lambda x: x[0][0])[:30]:
    print(f"{key[0]} / {key[1]}")
    for r in sorted(items, key=lambda x: x["player_id"]):
        pid = r["player_id"]
        print(
            f"  {pid} | {r['name_ja']} | usage={usage.get(pid, {}).get('count', 0)} | "
            f"debut={r['pro_debut_raw']}"
        )
    print()
