import json
from pathlib import Path

ROOT = Path(".")
TARGETS_PATH = ROOT / "_data/npb_rescrape/targets_profile_roman.json"
META_DIR = ROOT / "_data/derived/npb_player_meta"
PROFILE_NPB_DIR = ROOT / "_data/derived/player_profile/profile_npb"
MERGED_DIR = ROOT / "_data/derived/player_profile/merged"
REPORT = ROOT / "_reports/phase4b_profile_npb_merged_from_meta.csv"

def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))

def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def s(v):
    return str(v or "").strip()

def pick_name(target_row, meta, existing=None):
    existing = existing or {}
    return (
        s(existing.get("name_ja"))
        or s(target_row.get("name_ja"))
        or s(meta.get("name_ja"))
        or s(meta.get("player_name_ja"))
        or s(meta.get("name"))
    )

def main():
    if not TARGETS_PATH.exists():
        raise SystemExit(f"[STOP] missing: {TARGETS_PATH}")

    targets = load_json(TARGETS_PATH)
    PROFILE_NPB_DIR.mkdir(parents=True, exist_ok=True)
    MERGED_DIR.mkdir(parents=True, exist_ok=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)

    written_profile = 0
    written_merged_new = 0
    updated_merged_existing = 0
    missing_meta = 0
    empty_profile = 0

    report_rows = []

    for row in targets:
        pid = s(row.get("player_id") or row.get("npb_player_id"))
        if not pid:
            continue

        meta_path = META_DIR / f"{pid}.json"
        if not meta_path.exists():
            missing_meta += 1
            report_rows.append([pid, "missing_meta", "", "", ""])
            continue

        meta = load_json(meta_path)
        profile = meta.get("profile") or {}

        birth = s(profile.get("birth_date_raw"))
        pro = s(profile.get("pro_debut_raw"))
        career = s(profile.get("career_raw"))

        clean_profile = {
            "birth_date_raw": birth,
            "pro_debut_raw": pro,
            "career_raw": career,
        }

        if not birth and not pro and not career:
            empty_profile += 1
            status = "empty_profile"
        else:
            status = "ok"

        name_ja = pick_name(row, meta)

        # 1. profile_npb を U 全員分に出す
        profile_payload = {
            "npb_player_id": pid,
            "name_ja": name_ja,
            "profile": clean_profile,
        }
        write_json(PROFILE_NPB_DIR / f"npb_{pid}.json", profile_payload)
        written_profile += 1

        # 2. merged も U 全員分にする
        merged_path = MERGED_DIR / f"npb_{pid}.json"
        if merged_path.exists():
            existing = load_json(merged_path)
            existing["npb_player_id"] = s(existing.get("npb_player_id")) or pid
            existing["name_ja"] = pick_name(row, meta, existing)
            existing["profile"] = {
                **(existing.get("profile") or {}),
                **clean_profile,
            }
            write_json(merged_path, existing)
            updated_merged_existing += 1
        else:
            merged_payload = {
                "npb_player_id": pid,
                "name_ja": name_ja,
                "profile": clean_profile,
                "salary_by_year": {},
                "career_total_salary_display": None,
                "career_batting": {"rows": [], "total": None},
                "career_pitching": {"rows": [], "total": None},
                "faEstimate": None,
            }
            write_json(merged_path, merged_payload)
            written_merged_new += 1

        report_rows.append([pid, status, birth, pro, career])

    REPORT.write_text(
        "npb_player_id,status,birth_date_raw,pro_debut_raw,career_raw\n"
        + "\n".join(
            ",".join('"' + str(x).replace('"', '""') + '"' for x in r)
            for r in report_rows
        )
        + "\n",
        encoding="utf-8-sig",
    )

    print("=== Phase4-B profile_npb + merged from npb_player_meta ===")
    print(f"targets: {len(targets)}")
    print(f"profile_npb written: {written_profile}")
    print(f"merged existing updated: {updated_merged_existing}")
    print(f"merged new written: {written_merged_new}")
    print(f"missing_meta: {missing_meta}")
    print(f"empty_profile: {empty_profile}")
    print(f"report: {REPORT}")

if __name__ == "__main__":
    main()
