from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def normalize_schedule_game_state(status_text: str | None) -> str:
    s = "".join(str(status_text or "").split())
    if not s:
        return "unknown"
    if "試合中止" in s or s == "中止":
        return "cancelled"
    if "ノーゲーム" in s:
        return "no_game"
    if "試合終了" in s:
        return "completed"
    if "試合前" in s or "予告先発" in s:
        return "scheduled"
    if "試合中" in s or "回" in s:
        return "in_progress"
    return "unknown"


def is_terminal_cancelled_schedule_state(game_state: str | None) -> bool:
    return game_state in {"cancelled", "no_game"}


def _read_json_if_exists(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _find_date_for_game_id(idx: dict[str, Any] | None, game_id: str) -> str:
    by_date = (idx or {}).get("byDate")
    if not isinstance(by_date, dict):
        return ""
    gid = str(game_id).strip()
    for date_jst, ids in by_date.items():
        if not isinstance(ids, list):
            continue
        if gid in {str(x).strip() for x in ids}:
            return str(date_jst)
    return ""


def get_schedule_status_for_game(root: Path, year: str, game_id: str) -> dict[str, str] | None:
    gid = str(game_id).strip()
    if not gid:
        return None

    idx_path = root / "_data" / "sportsnavi_schedule_index" / f"season_{year}.json"
    idx = _read_json_if_exists(idx_path)
    status_by_id = (idx or {}).get("scheduleStatusByGameId")
    if isinstance(status_by_id, dict):
        status_text = str(status_by_id.get(gid) or "").strip()
        if status_text:
            return {
                "gameId": gid,
                "dateJst": _find_date_for_game_id(idx, gid),
                "statusText": status_text,
                "gameState": normalize_schedule_game_state(status_text),
                "source": "season_index",
            }

    date_jst = _find_date_for_game_id(idx, gid)
    if date_jst:
        snap_path = root / "_data" / "sportsnavi_schedule_snapshots" / "by_date" / f"{date_jst}.json"
        snap = _read_json_if_exists(snap_path)
        status_text = ""
        status_map = (snap or {}).get("scheduleStatusByGameId")
        if isinstance(status_map, dict):
            status_text = str(status_map.get(gid) or "").strip()
        if not status_text:
            for game in (snap or {}).get("games") or []:
                if str(game.get("gameId") or "").strip() == gid:
                    status_text = str(game.get("statusText") or "").strip()
                    break
        if status_text:
            return {
                "gameId": gid,
                "dateJst": date_jst,
                "statusText": status_text,
                "gameState": normalize_schedule_game_state(status_text),
                "source": "day_snapshot",
            }
    return None


def is_schedule_cancelled_game(root: Path, year: str, game_id: str) -> bool | None:
    status = get_schedule_status_for_game(root, year, game_id)
    if status is None:
        return None
    return is_terminal_cancelled_schedule_state(status.get("gameState"))
