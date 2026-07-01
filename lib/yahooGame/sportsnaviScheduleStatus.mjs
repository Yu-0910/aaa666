import fs from "node:fs"
import path from "node:path"

export function normalizeScheduleGameState(statusText) {
  const s = String(statusText ?? "").replace(/\s+/g, "")
  if (!s) return "unknown"
  if (s.includes("試合中止") || s === "中止") return "cancelled"
  if (s.includes("ノーゲーム")) return "no_game"
  if (s.includes("試合終了")) return "completed"
  if (s.includes("試合前") || s.includes("予告先発")) return "scheduled"
  if (s.includes("試合中") || s.includes("回")) return "in_progress"
  return "unknown"
}

export function isTerminalCancelledScheduleState(gameState) {
  return gameState === "cancelled" || gameState === "no_game"
}

function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

function findDateForGameId(idx, gameId) {
  const byDate = idx?.byDate
  if (!byDate || typeof byDate !== "object") return ""
  for (const [dateJst, ids] of Object.entries(byDate)) {
    if (!Array.isArray(ids)) continue
    if (ids.map((x) => String(x).trim()).includes(String(gameId).trim())) return dateJst
  }
  return ""
}

export function getScheduleStatusForGame(root, year, gameId) {
  const gid = String(gameId ?? "").trim()
  if (!gid) return null

  const indexPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  const idx = readJsonIfExists(indexPath)
  const fromIndex = idx?.scheduleStatusByGameId?.[gid]
  if (fromIndex) {
    return {
      gameId: gid,
      dateJst: findDateForGameId(idx, gid),
      statusText: String(fromIndex),
      gameState: normalizeScheduleGameState(fromIndex),
      source: "season_index",
    }
  }

  const dateJst = findDateForGameId(idx, gid)
  if (dateJst) {
    const snapPath = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date", `${dateJst}.json`)
    const snap = readJsonIfExists(snapPath)
    const fromSnapMap = snap?.scheduleStatusByGameId?.[gid]
    const fromGame = Array.isArray(snap?.games)
      ? snap.games.find((g) => String(g?.gameId ?? "").trim() === gid)
      : null
    const statusText = String(fromSnapMap ?? fromGame?.statusText ?? "").trim()
    if (statusText) {
      return {
        gameId: gid,
        dateJst,
        statusText,
        gameState: normalizeScheduleGameState(statusText),
        source: "day_snapshot",
      }
    }
  }

  return null
}

export function isScheduleCancelledGame(root, year, gameId) {
  const status = getScheduleStatusForGame(root, year, gameId)
  if (!status) return null
  return isTerminalCancelledScheduleState(status.gameState)
}
