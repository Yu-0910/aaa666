from pathlib import Path

files = [
    Path("app/players/[playerId]/PlayerPageClient.tsx"),
    Path("app/players/[playerId]/PlayerPageProfileTableBlock.tsx"),
]

patterns = [
    "const profileTableProps",
    "profileTableProps",
    "birthDateRaw",
    "mergedBirthRaw",
    "mergedAge",
    "age",
    "name_ja",
    "playerName",
    "displayName",
    "<h1",
    "PlayerPageProfileTableBlock",
]

out = []

def dump(path: Path, pattern: str, before: int = 12, after: int = 22):
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    hits = [i for i, line in enumerate(lines, start=1) if pattern in line]
    if not hits:
        return
    out.append("")
    out.append("=" * 90)
    out.append(f"{path} :: {pattern} :: hits={len(hits)}")
    out.append("=" * 90)
    for hit in hits[:8]:
        out.append("")
        out.append(f"----- around line {hit} -----")
        start = max(1, hit - before)
        end = min(len(lines), hit + after)
        for n in range(start, end + 1):
            out.append(f"{n:5}: {lines[n - 1]}")

for path in files:
    if not path.is_file():
        out.append(f"missing: {path}")
        continue
    for pattern in patterns:
        dump(path, pattern)

report = Path("_reports/phase4b_profile_table_context.txt")
report.parent.mkdir(parents=True, exist_ok=True)
report.write_text("\n".join(out), encoding="utf-8")

print(f"Wrote: {report}")
print()
print("Next: run the Select-String commands below and paste the output.")
