import csv
import json
from pathlib import Path
from collections import Counter

root = Path(".")

out_dir = root / "_reports"
out_dir.mkdir(parents=True, exist_ok=True)

target_json = root / "_data/npb_rescrape/targets_profile_roman.json"
missing_json = root / "_data/npb_rescrape/targets_profile_roman_missing_only.json"
audit_csv = root / "_reports/npb_rescrape_phase3_2_targets_audit.csv"

meta_dir_candidates = [
    root / "_data/derived/npb_player_meta",
    root / "_data/npb_player_meta",
]

cache_dir_candidates = [
    root / "_data/cache/npb_player_page",
    root / "_data/npb_rescrape/cache/npb_player_page",
]

meta_dir = next((p for p in meta_dir_candidates if p.is_dir()), meta_dir_candidates[0])
cache_dir = next((p for p in cache_dir_candidates if p.is_dir()), cache_dir_candidates[0])

def read_targets():
    if target_json.is_file():
        data = json.loads(target_json.read_text(encoding="utf-8"))
        out = []
        for x in data:
            pid = str(x.get("player_id") or x.get("npb_player_id") or "").strip()
            if not pid:
                continue
            out.append({
                "player_id": pid,
                "name_ja": x.get("name_ja") or x.get("player_name_ja") or "",
            })
        return out

    # fallback: existing master/staging CSVから対象IDを作る
    ids = {}

    for base in [
        root / "_data/master_csv",
        root / "_data/master_csv__rescrape_staging",
    ]:
        if not base.is_dir():
            continue

        for p in base.glob("*_from_master.csv"):
            with p.open(encoding="utf-8-sig", newline="") as f:
                for row in csv.DictReader(f):
                    pid = str(row.get("player_id") or "").strip()
                    name = row.get("player_name_ja") or ""
                    if pid:
                        ids.setdefault(pid, name)

    return [{"player_id": pid, "name_ja": name} for pid, name in sorted(ids.items())]

def has_text(x):
    return bool(str(x or "").strip())

def profile_ok(data):
    profile = data.get("profile") or data.get("profile_raw") or {}

    if not isinstance(profile, dict):
        return False

    # プロフィール系はプロジェクトごとにキー名が違う可能性があるため、広めに判定
    candidate_keys = [
        "birth_date_raw",
        "birth_date",
        "birthday",
        "height_weight_raw",
        "career_raw",
        "draft_raw",
        "position_raw",
        "throw_bat_raw",
    ]

    return any(has_text(profile.get(k)) for k in candidate_keys)

def roman_ok(data):
    roman = data.get("roman") or {}

    if isinstance(roman, dict):
        if roman.get("skipped") is True:
            return True
        if has_text(roman.get("name_en_full")) or has_text(roman.get("name_en_short")):
            return True

    # meta直下にローマ字がある場合
    for k in ["name_en", "player_name_en", "name_en_full", "name_en_short"]:
        if has_text(data.get(k)):
            return True

    return False


allowed_cache_missing_path = root / "_data/npb_rescrape/cache_missing_allowed.json"
allowed_cache_missing = set()

if allowed_cache_missing_path.is_file():
    try:
        for x in json.loads(allowed_cache_missing_path.read_text(encoding="utf-8")):
            pid = str(x.get("player_id") or "").strip()
            if pid:
                allowed_cache_missing.add(pid)
                allowed_cache_missing.add(pid.zfill(8))
    except Exception:
        pass

targets = read_targets()

# 重複除去
dedup = {}
for x in targets:
    dedup[x["player_id"]] = x
targets = [dedup[k] for k in sorted(dedup)]

audit_rows = []
missing_targets = []
counter = Counter()

for item in targets:
    pid = item["player_id"]
    name = item.get("name_ja", "")

    # HTML cache may be saved as 8-digit zero-padded NPB id.
    cache_candidates = [
        cache_dir / f"{pid}.html",
        cache_dir / f"{pid.zfill(8)}.html",
    ]
    meta_candidates = [
        meta_dir / f"{pid}.json",
        meta_dir / f"{pid.zfill(8)}.json",
    ]

    cache_path = next((x for x in cache_candidates if x.is_file()), cache_candidates[0])
    meta_path = next((x for x in meta_candidates if x.is_file()), meta_candidates[0])

    reasons = []

    cache_missing_allowed = (
        pid in allowed_cache_missing
        or pid.zfill(8) in allowed_cache_missing
    )

    if not cache_path.is_file() and not cache_missing_allowed:
        reasons.append("missing_cache")

    data = {}
    if not meta_path.is_file():
        reasons.append("missing_meta")
    else:
        try:
            data = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            reasons.append("broken_meta")

    p_ok = False
    r_ok = False

    if data:
        p_ok = profile_ok(data)
        r_ok = roman_ok(data)

    if not p_ok:
        reasons.append("missing_profile")

    if not r_ok:
        reasons.append("missing_roman")

    for r in reasons:
        counter[r] += 1

    audit_rows.append({
        "player_id": pid,
        "name_ja": name,
        "has_cache": cache_path.is_file(),
        "has_meta": meta_path.is_file(),
        "profile_ok": p_ok,
        "roman_ok": r_ok,
        "reasons": "|".join(reasons),
    })

    if reasons:
        missing_targets.append({
            "player_id": pid,
            "name_ja": name,
            "reasons": reasons,
        })

with audit_csv.open("w", encoding="utf-8-sig", newline="") as f:
    fields = [
        "player_id",
        "name_ja",
        "has_cache",
        "has_meta",
        "profile_ok",
        "roman_ok",
        "reasons",
    ]
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(audit_rows)

missing_json.parent.mkdir(parents=True, exist_ok=True)
missing_json.write_text(json.dumps(missing_targets, ensure_ascii=False, indent=2), encoding="utf-8")

print("=== Phase 3-2 target audit ===")
print("targets:", len(targets))
print("missing targets:", len(missing_targets))
print("meta_dir:", meta_dir)
print("cache_dir:", cache_dir)
print(dict(counter))
print("Wrote:", audit_csv)
print("Wrote:", missing_json)

print()
print("sample missing:")
for x in missing_targets[:20]:
    print(x["player_id"], x.get("name_ja", ""), ",".join(x.get("reasons", [])))
