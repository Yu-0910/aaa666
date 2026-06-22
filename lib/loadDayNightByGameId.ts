import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import {
  parseStartTimeFromSportsnaviGameHtml,
  resolveDayNightKind,
  type DayNightKind,
} from "@/lib/dayNightFromSportsnavi"

export type DayNightSplitKey = DayNightKind | "未設定"

type YahooGameMetaV1 = {
  schemaVersion?: string
  gameId?: string
  meta?: {
    startTimeLocal?: string | null
    dayNight?: { kind?: DayNightKind | null } | null
  }
}

function loadYahooGameMeta(root: string, gameId: string): YahooGameMetaV1 | null {
  const p = path.join(root, "_data", "yahoo_game_meta", `${gameId}.json`)
  if (!fs.existsSync(p)) return null
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as YahooGameMetaV1
    if (j?.schemaVersion !== "yahoo-npb-game-meta-v1" || j.gameId !== gameId) return null
    return j
  } catch {
    return null
  }
}

function loadSportsnaviGameHtml(root: string, gameId: string): string | null {
  const p = path.join(root, "_data", "scraped_games", "raw_sportsnavi", `${gameId}.html`)
  if (!fs.existsSync(p)) return null
  try {
    return fs.readFileSync(p, "utf8")
  } catch {
    return null
  }
}

/** gameId → デー/ナイター（yahoo_game_meta → raw_sportsnavi 開始時刻の順。Phase13 球場と同型の補完）。 */
export function loadDayNightByGameId(
  year: string,
  projectRoot?: string,
  gameIds?: Iterable<string>,
): Map<string, DayNightSplitKey> {
  void year
  const root = projectRoot ?? getProjectRoot()
  const out = new Map<string, DayNightSplitKey>()

  const ids =
    gameIds != null
      ? [...gameIds].map((id) => String(id ?? "").trim()).filter(Boolean)
      : fs
          .readdirSync(path.join(root, "_data", "scraped_games", "canonical"))
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(/\.json$/, ""))

  let fromMeta = 0
  let fromRaw = 0
  let unset = 0

  for (const gameId of ids) {
    const meta = loadYahooGameMeta(root, gameId)
    const html = loadSportsnaviGameHtml(root, gameId)
    const startFromHtml = html ? parseStartTimeFromSportsnaviGameHtml(html) : null
    const kind = resolveDayNightKind({
      metaKind: meta?.meta?.dayNight?.kind ?? null,
      startTimeLocal: meta?.meta?.startTimeLocal ?? startFromHtml,
      htmlBlob: html?.slice(0, 80_000) ?? "",
    })
    if (kind) {
      out.set(gameId, kind)
      if (meta?.meta?.dayNight?.kind === "day" || meta?.meta?.dayNight?.kind === "night") {
        fromMeta++
      } else {
        fromRaw++
      }
    } else {
      out.set(gameId, "未設定")
      unset++
    }
  }

  console.log(
    `[loadDayNightByGameId] resolved ${out.size} games: meta=${fromMeta}, raw_sportsnavi=${fromRaw}, 未設定=${unset}`,
  )
  return out
}
