"""
一球 resultJa の分類は lib/yahooGame/pitchCountSim（TS）を SSOT とし、
本モジュールは npx tsx で CLI を1回起動してマップを取得する。
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path


def batch_pitch_result_classifications(
    strings: list[str],
    project_root: Path | None = None,
    *,
    timeout_sec: float = 120.0,
) -> dict[str, dict[str, str | bool]]:
    """
    各文字列について { countKind, typeBucket, inPlay } を返す。
    countKind: ball | strike | foul | neutral
    typeBucket: balls | swing_miss | taken | foul | none
    inPlay: Statcast/FanGraphs 準拠のインプレー（コンタクト打球）
    """
    root = project_root or Path(__file__).resolve().parent.parent
    unique = sorted(set(strings))
    if not unique:
        return {}

    payload = json.dumps({"strings": unique}, ensure_ascii=False)
    cmd = [
        "npx",
        "--yes",
        "tsx",
        "scripts/pitch_result_ja_classify_cli.ts",
    ]
    try:
        proc = subprocess.run(
            cmd,
            input=payload,
            capture_output=True,
            text=True,
            encoding="utf-8",
            cwd=str(root),
            timeout=timeout_sec,
            shell=False,
        )
    except FileNotFoundError as e:
        raise RuntimeError(
            "pitch_result_ja_from_ts: npx が見つかりません。"
            " Node.js を入れ、プロジェクトルートを cwd にして実行してください。"
        ) from e
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(
            "pitch_result_ja_from_ts: tsx 起動がタイムアウトしました。"
        ) from e

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        print(
            f"pitch_result_ja_from_ts: tsx が失敗 (code={proc.returncode})\n{err}",
            file=sys.stderr,
        )
        sys.exit(proc.returncode)

    try:
        out = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        print(f"pitch_result_ja_from_ts: stdout が JSON ではありません: {e}", file=sys.stderr)
        print(proc.stdout[:500], file=sys.stderr)
        sys.exit(1)

    by_string = out.get("byString") or {}
    result: dict[str, dict[str, str | bool]] = {}
    for s in unique:
        row = by_string.get(s)
        if not isinstance(row, dict):
            print(
                f"pitch_result_ja_from_ts: キー {s!r} の分類が欠落しています。",
                file=sys.stderr,
            )
            sys.exit(1)
        ck = row.get("countKind")
        tb = row.get("typeBucket")
        in_play = row.get("inPlay")
        if not isinstance(ck, str) or not isinstance(tb, str) or not isinstance(in_play, bool):
            print(
                f"pitch_result_ja_from_ts: キー {s!r} の値が不正です: {row!r}",
                file=sys.stderr,
            )
            sys.exit(1)
        result[s] = {"countKind": ck, "typeBucket": tb, "inPlay": in_play}
    return result
