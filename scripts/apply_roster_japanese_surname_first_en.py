#!/usr/bin/env python3
"""
日本人選手の name_en / name_en_full を「名 姓」(Western) →「姓 名」(例: Morishita Shota) に一括変換。
外国人（Ａ．〇〇 等）は対象外。2 語ちょうどの行のみ入れ替え（それ以外は据え置き）。

二重実行すると元に戻るので 1 回だけ実行すること。
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "_data" / "npb_roster_2026.csv"


def is_foreign_registration(name_ja: str) -> bool:
    s = name_ja.strip()
    if re.match(r"^[\uFF21-\uFF3A\uFF41-\uFF5A][\uFF0E.]", s):
        return True
    if re.match(r"^[A-Za-z]", s):
        return True
    return False


def is_japanese_roster_flip_target(name_ja: str) -> bool:
    if is_foreign_registration(name_ja):
        return False
    return bool(
        re.search(r"[\u3040-\u30ff\u4e00-\u9fff\u3005-\u3007\uff66-\uff9f]", name_ja)
    )


def flip_two_words(s: str) -> str | None:
    s = (s or "").strip()
    if not s:
        return None
    parts = s.split()
    if len(parts) != 2:
        return None
    return f"{parts[1]} {parts[0]}"


def main() -> None:
    with CSV_PATH.open(encoding="utf-8", newline="") as f:
        rows = list(csv.reader(f))
    if len(rows) < 2:
        raise SystemExit("empty roster")
    header = rows[0]
    i_ja = header.index("name_ja")
    i_en = header.index("name_en")
    i_full = header.index("name_en_full")
    n = 0
    for i in range(1, len(rows)):
        row = rows[i]
        if len(row) <= max(i_ja, i_en, i_full):
            continue
        name_ja = row[i_ja]
        if not is_japanese_roster_flip_target(name_ja):
            continue
        for idx in (i_en, i_full):
            flipped = flip_two_words(row[idx])
            if flipped:
                row[idx] = flipped
                n += 1
    with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
        csv.writer(f, lineterminator="\n").writerows(rows)
    print(f"[apply_roster_japanese_surname_first_en] updated {n} cells -> {CSV_PATH}")


if __name__ == "__main__":
    main()
