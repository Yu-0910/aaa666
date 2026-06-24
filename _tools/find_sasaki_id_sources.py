import json
from pathlib import Path

root = Path(".")
names = ["佐々木", "佐々木　健", "佐々木 健"]
ids = ["01005153", "1005153"]

targets = []
for base in [
    root / "public/data",
    root / "_data/master_csv",
    root / "_data/derived",
]:
    if not base.exists():
        continue
    for p in base.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in [".json", ".csv", ".tsv"]:
            continue
        try:
            text = p.read_text(encoding="utf-8-sig", errors="ignore")
        except Exception:
            continue
        if any(x in text for x in names + ids):
            targets.append(p)

print("matched files:", len(targets))
for p in targets[:200]:
    print(p)
