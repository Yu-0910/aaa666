"""
打席結果テキストの集計用スナップショットは lib/yahooGame/paSettlementStatsFromResultJa（TS）を SSOT とし、
本モジュールは npx tsx で CLI を1回起動してマップを取得する。
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path


def _resolve_npx_executable() -> str | None:
    """Windows では npx.cmd のみ PATH にあることがある。shutil.which で解決する。"""
    for name in ("npx", "npx.cmd"):
        p = shutil.which(name)
        if p:
            return p
    return None

PaOutcomeRow = dict[str, bool | int]


def batch_pa_outcome_classifications(
    strings: list[str],
    project_root: Path | None = None,
    *,
    timeout_sec: float = 120.0,
) -> dict[str, PaOutcomeRow]:
    """
    各文字列について TS の PaOutcomeStatsRow 相当の辞書を返す（キーは元の文字列）。
    """
    root = project_root or Path(__file__).resolve().parent.parent
    unique = sorted(set(strings))
    if not unique:
        return {}

    payload = json.dumps({"strings": unique}, ensure_ascii=False)
    npx = _resolve_npx_executable()
    if not npx:
        hint = (
            " Node.js LTS をインストールし、ターミナルを開き直してください。"
            " 同じウィンドウで `where npx` が通るか確認してください。"
        )
        if sys.platform == "win32":
            hint += "（Cursor 等から Python だけ起動していると PATH に Node が載らないことがあります。）"
        raise RuntimeError(
            "pa_outcome_from_ts: npx が PATH 上に見つかりません。" + hint
        )
    cmd = [npx, "--yes", "tsx", "scripts/pa_outcome_classify_cli.ts"]
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
            "pa_outcome_from_ts: npx の起動に失敗しました（実行ファイルが無効、または tsx の取得に失敗）。"
            " Node.js を入れ、プロジェクトルートで `npx --yes tsx -v` が通るか確認してください。"
        ) from e
    except subprocess.TimeoutExpired as e:
        raise RuntimeError("pa_outcome_from_ts: tsx がタイムアウトしました。") from e

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(
            f"pa_outcome_from_ts: tsx 失敗 (code={proc.returncode})\n{err}"
        )

    try:
        out = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        raise RuntimeError(
            f"pa_outcome_from_ts: stdout が JSON ではありません: {e}\n"
            f"{(proc.stdout or '')[:500]}"
        ) from e

    by_string = out.get("byString") or {}
    result: dict[str, PaOutcomeRow] = {}
    bool_keys = (
        "settlement",
        "strikeout",
        "walk",
        "hbp",
        "sf",
        "hit",
        "homeRun",
    )
    for s in unique:
        row = by_string.get(s)
        if not isinstance(row, dict):
            raise RuntimeError(
                f"pa_outcome_from_ts: キー {s!r} の分類が欠落しています。"
            )
        tb = row.get("totalBases")
        if not isinstance(tb, int):
            raise RuntimeError(
                f"pa_outcome_from_ts: キー {s!r} の totalBases が不正です: {row!r}"
            )
        out_row: PaOutcomeRow = {"totalBases": tb}
        for k in bool_keys:
            v = row.get(k)
            if not isinstance(v, bool):
                raise RuntimeError(
                    f"pa_outcome_from_ts: キー {s!r} の {k} が不正です: {row!r}"
                )
            out_row[k] = v
        result[s] = out_row
    return result
