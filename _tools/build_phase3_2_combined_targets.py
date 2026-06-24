import csv
import json
from pathlib import Path

root = Path(".")

need_get_path = root / "_data/npb_rescrape/targets_phase3_2_need_get.json"
parse_only_path = root / "_data/npb_rescrape/targets_phase3_2_parse_only.json"
additional_path = root / "_data/npb_rescrape/additional_scrape_targets.csv"

combined_get_path = root / "_data/npb_rescrape/targets_next_get_combined.json"
combined_parse_path = root / "_data/npb_rescrape/targets_next_parse_combined.json"

merged_get = {}
merged_parse = {}

if need_get_path.is_file():
    for x in json.loads(need_get_path.read_text(encoding="utf-8")):
        pid = str(x.get("player_id") or "").strip()
        if pid:
            merged_get[pid] = {
                "player_id": pid,
                "name_ja": x.get("name_ja", ""),
                "reasons": list(x.get("reasons") or []),
                "need_get": True,
                "need_profile": True,
                "need_roman": True,
                "need_pitching": False,
                "notes": "",
            }

if parse_only_path.is_file():
    for x in json.loads(parse_only_path.read_text(encoding="utf-8")):
        pid = str(x.get("player_id") or "").strip()
        if pid:
            merged_parse[pid] = {
                "player_id": pid,
                "name_ja": x.get("name_ja", ""),
                "reasons": list(x.get("reasons") or []),
                "need_get": False,
                "need_profile": True,
                "need_roman": True,
                "need_pitching": False,
                "notes": "",
            }

if additional_path.is_file():
    with additional_path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            pid = str(row.get("player_id") or "").strip()
            if not pid:
                continue

            need_get = str(row.get("need_get") or "").strip().lower() in {"1", "true", "yes", "y", "必要"}
            target = merged_get if need_get else merged_parse

            cur = target.setdefault(pid, {
                "player_id": pid,
                "name_ja": row.get("name_ja", ""),
                "reasons": [],
                "need_get": need_get,
                "need_profile": False,
                "need_roman": False,
                "need_pitching": False,
                "notes": "",
            })

            if row.get("name_ja") and not cur.get("name_ja"):
                cur["name_ja"] = row.get("name_ja")

            reason = (row.get("reason") or "").strip()
            if reason and reason not in cur["reasons"]:
                cur["reasons"].append(reason)

            for k in ["need_profile", "need_roman", "need_pitching"]:
                v = str(row.get(k) or "").strip().lower()
                if v in {"1", "true", "yes", "y", "必要"}:
                    cur[k] = True

            notes = (row.get("notes") or "").strip()
            if notes:
                cur["notes"] = (cur.get("notes", "") + " / " + notes).strip(" /")

combined_get = [merged_get[k] for k in sorted(merged_get)]
combined_parse = [merged_parse[k] for k in sorted(merged_parse)]

combined_get_path.write_text(json.dumps(combined_get, ensure_ascii=False, indent=2), encoding="utf-8")
combined_parse_path.write_text(json.dumps(combined_parse, ensure_ascii=False, indent=2), encoding="utf-8")

print("GET targets:", len(combined_get))
print("parse-only targets:", len(combined_parse))
print("Wrote:", combined_get_path)
print("Wrote:", combined_parse_path)

print()
print("GET sample:")
for x in combined_get[:20]:
    print(x["player_id"], x.get("name_ja", ""), ",".join(x.get("reasons", [])))

print()
print("parse-only sample:")
for x in combined_parse[:20]:
    print(x["player_id"], x.get("name_ja", ""), ",".join(x.get("reasons", [])))
