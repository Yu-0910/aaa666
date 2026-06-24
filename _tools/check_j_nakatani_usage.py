import json
import re
from pathlib import Path

root = Path(".")
needles = [
    "J.NAKATANI",
    "J. NAKATANI",
    "NAKATANI",
    "中谷　仁",
    "中谷仁",
    "1003886",
]

search_roots = [
    root / "public/data",
    root / "_data/derived",
    root / "_data/master_csv",
]

suffixes = {".json", ".csv", ".tsv", ".txt"}

print("=== J.NAKATANI usage check ===")
for base in search_roots:
    if not base.exists():
        continue

    for p in base.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in suffixes:
            continue

        try:
            lines = p.read_text(encoding="utf-8-sig", errors="ignore").splitlines()
        except Exception:
            continue

        hits = []
        for i, line in enumerate(lines, start=1):
            if any(n in line for n in needles):
                hits.append((i, line))

        if hits:
            print()
            print("====", p, "====")
            for i, line in hits[:20]:
                print(f"{i}: {line[:1200]}")
