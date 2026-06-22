import json
from pathlib import Path

ROOT = Path(".")
TARGETS_PATH = ROOT / "_data/npb_rescrape/targets_profile_roman.json"
META_DIR = ROOT / "_data/derived/npb_player_meta"
OUT_DIR = ROOT / "_data/derived/player_profile/profile_npb"
REPORT = ROOT / "_reports/build_profile_npb_from_meta_report.csv"

def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))

def clean_str(v):
    return str(v or "").strip()

def pick_name(target_row, meta):
    return (
        clean_str(target_row.get("name_ja"))
        or clean_str(meta.get("name_ja"))
        or clean_str(meta.get("player_name_ja"))
        or clean_str(meta.get("name"))
    )

def main():
    if not TARGETS_PATH.exists():
        raise SystemExit(f"[STOP] missing targets: {TARGETS_PATH}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)

    targets = load_json(TARGETS_PATH)

    rows = []
    written = 0
    missing_meta = 0
    missing_profile_fields = 0

    for row in targets:
        pid = clean_str(row.get("player_id") or row.get("npb_player_id"))
        if not pid:
            continue

        meta_path = META_DIR / f"{pid}.json"
        if not meta_path.exists():
            missing_meta += 1
            rows.append([pid, "missing_meta", "", "", ""])
            continue

        meta = load_json(meta_path)
        profile = meta.get("profile") or {}

        birth = clean_str(profile.get("birth_date_raw"))
        pro = clean_str(profile.get("pro_debut_raw"))
        career = clean_str(profile.get("career_raw"))

        if not birth and not pro and not career:
            missing_profile_fields += 1
            status = "empty_profile"
        else:
            status = "ok"

        out = {
            "npb_player_id": pid,
            "name_ja": pick_name(row, meta),
            "profile": {
                "birth_date_raw": birth,
                "pro_debut_raw": pro,
                "career_raw": career,
            },
        }

        out_path = OUT_DIR / f"npb_{pid}.json"
        out_path.write_text(
            json.dumps(out, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        written += 1

        rows.append([pid, status, birth, pro, career])

    REPORT.write_text(
        "npb_player_id,status,birth_date_raw,pro_debut_raw,career_raw\n"
        + "\n".join(
            ",".join('"' + str(x).replace('"', '""') + '"' for x in r)
            for r in rows
        )
        + "\n",
        encoding="utf-8-sig",
    )

    print("=== build profile_npb from npb_player_meta ===")
    print(f"targets: {len(targets)}")
    print(f"written: {written}")
    print(f"missing_meta: {missing_meta}")
    print(f"empty_profile: {missing_profile_fields}")
    print(f"out_dir: {OUT_DIR}")
    print(f"report: {REPORT}")

if __name__ == "__main__":
    main()
