import csv
import json
from pathlib import Path

root = Path(".")

targets_path = root / "_data/npb_rescrape/targets_profile_roman.json"
roster_path = root / "_data/npb_roster_2026.csv"
profile_dir = root / "_data/derived/player_profile/profile_npb"
merged_dir = root / "_data/derived/player_profile/merged"

def load_targets():
    if not targets_path.is_file():
        raise FileNotFoundError(f"missing: {targets_path}")
    data = json.loads(targets_path.read_text(encoding="utf-8"))
    return {
        str(row.get("player_id", "")).strip()
        for row in data
        if str(row.get("player_id", "")).strip()
    }

def load_roster():
    if not roster_path.is_file():
        raise FileNotFoundError(f"missing: {roster_path}")
    out = set()
    with roster_path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            pid = str(row.get("npb_player_id", "")).strip()
            if pid:
                out.add(pid)
    return out

def load_npbfmt_files(path: Path):
    if not path.is_dir():
        return set()
    return {
        p.stem.removeprefix("npb_")
        for p in path.glob("npb_*.json")
        if p.is_file()
    }

targets = load_targets()
roster = load_roster()
profile_npb = load_npbfmt_files(profile_dir)
merged = load_npbfmt_files(merged_dir)
non_roster = targets - roster

missing_profile = sorted(targets - profile_npb)
missing_merged = sorted(targets - merged)
missing_non_roster_profile = sorted(non_roster - profile_npb)
missing_non_roster_merged = sorted(non_roster - merged)

print("=== Phase 4-B coverage audit ===")
print(f"targets: {len(targets)}")
print(f"roster: {len(roster)}")
print(f"non-roster targets: {len(non_roster)}")
print(f"profile_npb npb_*.json: {len(profile_npb)}")
print(f"merged npb_*.json: {len(merged)}")
print()
print(f"targets not in profile_npb: {len(missing_profile)}")
print(f"targets not in merged: {len(missing_merged)}")
print(f"non-roster targets not in profile_npb: {len(missing_non_roster_profile)}")
print(f"non-roster targets not in merged: {len(missing_non_roster_merged)}")
print()

sample_id = "01005153"
print(f"sample {sample_id} profile_npb exists:", (profile_dir / f"npb_{sample_id}.json").is_file())
print(f"sample {sample_id} merged exists:", (merged_dir / f"npb_{sample_id}.json").is_file())

if missing_profile:
    print()
    print("sample missing profile_npb:")
    for pid in missing_profile[:20]:
        print(pid)

if missing_merged:
    print()
    print("sample missing merged:")
    for pid in missing_merged[:20]:
        print(pid)

out_dir = root / "_reports"
out_dir.mkdir(parents=True, exist_ok=True)

report_path = out_dir / "npb_rescrape_phase4b_coverage_audit.json"
report = {
    "targets": len(targets),
    "roster": len(roster),
    "non_roster_targets": len(non_roster),
    "profile_npb": len(profile_npb),
    "merged": len(merged),
    "targets_not_in_profile_npb": len(missing_profile),
    "targets_not_in_merged": len(missing_merged),
    "non_roster_targets_not_in_profile_npb": len(missing_non_roster_profile),
    "non_roster_targets_not_in_merged": len(missing_non_roster_merged),
    "sample_01005153_profile_npb_exists": (profile_dir / f"npb_{sample_id}.json").is_file(),
    "sample_01005153_merged_exists": (merged_dir / f"npb_{sample_id}.json").is_file(),
    "missing_profile_sample": missing_profile[:50],
    "missing_merged_sample": missing_merged[:50],
}
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print()
print(f"Wrote: {report_path}")
