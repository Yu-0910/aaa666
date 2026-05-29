"""
canonical の全 pitchEvents.resultJa を lib/yahooGame/pitchCountSim（TS CLI）で分類し、
neutral の件数・割合を出す（リポジトリ内の canonical JSON を対象）。
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from pitch_result_ja_from_ts import batch_pitch_result_classifications


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    canon_dir = root / "_data" / "scraped_games" / "canonical"
    if not canon_dir.is_dir():
        print("no canonical dir")
        return

    result_strings: list[str] = []

    for path in sorted(canon_dir.glob("*.json")):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            print(f"skip {path.name}: {e}")
            continue
        pas = doc.get("domain", {}).get("plateAppearances") or []
        for pa in pas:
            for ev in pa.get("pitchEvents") or []:
                r = ev.get("resultJa")
                if r is None:
                    continue
                result_strings.append(str(r).strip())

    try:
        class_map = batch_pitch_result_classifications(result_strings, root)
    except (FileNotFoundError, subprocess.TimeoutExpired, RuntimeError) as e:
        print(f"TS 分類の取得に失敗しました: {e}", file=sys.stderr)
        sys.exit(1)


    total = 0
    by_kind: dict[str, int] = {"ball": 0, "strike": 0, "foul": 0, "neutral": 0}
    neutral_examples: dict[str, int] = {}

    for s in result_strings:
        total += 1
        row = class_map.get(s)
        if row is None:
            print(f"internal error: missing classification for {s!r}", file=sys.stderr)
            sys.exit(1)
        k = row[0]
        by_kind[k] = by_kind.get(k, 0) + 1
        if k == "neutral":
            neutral_examples[s] = neutral_examples.get(s, 0) + 1

    print(f"games_scanned={len(list(canon_dir.glob('*.json')))}")
    print(f"pitch_events_with_resultJa={total}")
    for k in ("ball", "strike", "foul", "neutral"):
        n = by_kind.get(k, 0)
        pct = (100.0 * n / total) if total else 0.0
        print(f"  {k}: {n} ({pct:.1f}%)")

    top = sorted(neutral_examples.items(), key=lambda x: -x[1])[:25]
    print("top neutral strings:")
    for s, c in top:
        print(f"  {c}x  {s!r}")


if __name__ == "__main__":
    main()
