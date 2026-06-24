from pathlib import Path

path = Path("app/players/[playerId]/PlayerPageClient.tsx")
text = path.read_text(encoding="utf-8")
lines = text.splitlines()

out = []

def add(title: str):
    out.append("")
    out.append("=" * 90)
    out.append(title)
    out.append("=" * 90)

def dump_range(start_line: int, end_line: int):
    start = max(1, start_line)
    end = min(len(lines), end_line)
    for n in range(start, end + 1):
        out.append(f"{n:5}: {lines[n - 1]}")

def find_context(pattern: str, before: int = 12, after: int = 18, max_hits: int = 8):
    add(f"PATTERN: {pattern}")
    hits = []
    for i, line in enumerate(lines, start=1):
        if pattern in line:
            hits.append(i)
    out.append(f"hits: {len(hits)}")
    for hit in hits[:max_hits]:
        out.append("")
        out.append(f"----- around line {hit} -----")
        dump_range(hit - before, hit + after)

add("FILE")
out.append(str(path))
out.append(f"total lines: {len(lines)}")

add("IMPORTS / TOP")
dump_range(1, 140)

for pattern in [
    "const showSeasonCareerTabs",
    "showSeasonCareerTabs",
    "const isRosterPlayer",
    "isRosterPlayer",
    "profileMergedSettled",
    "profileMerged",
    "PlayerPageProfileTableBlock",
    "mergedBirthRaw",
    "return (",
    "<main",
    "</main>",
]:
    find_context(pattern)

report = Path("_reports/phase4b_PlayerPageClient_context.txt")
report.parent.mkdir(parents=True, exist_ok=True)
report.write_text("\n".join(out), encoding="utf-8")

print(f"Wrote: {report}")
print()
print("Next: paste the sections around these headings:")
print("- PATTERN: const showSeasonCareerTabs")
print("- PATTERN: PlayerPageProfileTableBlock")
print("- PATTERN: <main")
print("- PATTERN: </main>")
