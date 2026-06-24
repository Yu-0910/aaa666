from pathlib import Path

path = Path("app/players/[playerId]/PlayerPageClient.tsx")
text = path.read_text(encoding="utf-8")
lines = text.splitlines()

patterns = [
    "profile-merged",
    "setProfileMerged",
    "setProfileMergedSettled",
    "ProfileMergedPayload",
    "const [profileMerged",
    "profileMergedSettled",
    "fetch(",
    "playerIdNormalized",
    "seasonPilotPlayerId",
    "numericPilotIdFromPath",
]

out = []

for pattern in patterns:
    out.append("")
    out.append("=" * 90)
    out.append(f"PATTERN: {pattern}")
    out.append("=" * 90)
    hits = [i for i, line in enumerate(lines, start=1) if pattern in line]
    out.append(f"hits: {len(hits)}")
    for hit in hits[:12]:
        out.append("")
        out.append(f"----- around line {hit} -----")
        start = max(1, hit - 14)
        end = min(len(lines), hit + 24)
        for n in range(start, end + 1):
            out.append(f"{n:5}: {lines[n - 1]}")

report = Path("_reports/phase4b_profile_merged_fetch_context.txt")
report.parent.mkdir(parents=True, exist_ok=True)
report.write_text("\n".join(out), encoding="utf-8")

print(f"Wrote: {report}")
