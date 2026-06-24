import json
import csv
from pathlib import Path

root = Path(".")

missing_path = root / "_data/npb_rescrape/targets_profile_roman_missing_only.json"
need_get_path = root / "_data/npb_rescrape/targets_phase3_2_need_get.json"
parse_only_path = root / "_data/npb_rescrape/targets_phase3_2_parse_only.json"
summary_path = root / "_reports/npb_rescrape_phase3_2_target_summary.txt"

items = json.loads(missing_path.read_text(encoding="utf-8"))

need_get = []
parse_only = []

for x in items:
    reasons = set(x.get("reasons") or [])

    if "missing_cache" in reasons:
        need_get.append(x)
    else:
        parse_only.append(x)

need_get_path.write_text(json.dumps(need_get, ensure_ascii=False, indent=2), encoding="utf-8")
parse_only_path.write_text(json.dumps(parse_only, ensure_ascii=False, indent=2), encoding="utf-8")

lines = []
lines.append("NPB rescrape Phase 3-2 target summary")
lines.append("=" * 60)
lines.append(f"missing total: {len(items)}")
lines.append(f"need GET: {len(need_get)}")
lines.append(f"parse only: {len(parse_only)}")
lines.append("")
lines.append("Need GET sample")
lines.append("-" * 60)
for x in need_get[:30]:
    lines.append(f'{x.get("player_id")} {x.get("name_ja")} {",".join(x.get("reasons") or [])}')
lines.append("")
lines.append("Parse only sample")
lines.append("-" * 60)
for x in parse_only[:30]:
    lines.append(f'{x.get("player_id")} {x.get("name_ja")} {",".join(x.get("reasons") or [])}')

summary_path.write_text("\n".join(lines), encoding="utf-8")

print("Wrote:", need_get_path)
print("Wrote:", parse_only_path)
print("Wrote:", summary_path)
print()
print("\n".join(lines[:45]))
