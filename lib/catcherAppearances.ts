import type { CanonicalGameDocument } from "@/lib/yahooGame/types"
import { compactPlayerName } from "@/lib/playerNameNormalize"
import { getStartingCatcherForTeam } from "@/lib/yahooGame/startingCatcherFromCanonical"

export type CatcherAppearancesDerived = {
  schemaVersion: "player-catcher-appearances-v1"
  seasonYear: string
  npbPlayerId: string
  gamesAsCatcher: number
  gameIds: string[]
}

function normalizeNameKey(s: string): string {
  return compactPlayerName((s ?? "").trim())
}

function buildNameToYahooId(doc: CanonicalGameDocument): Map<string, string> {
  const m = new Map<string, string>()
  for (const [id, name] of Object.entries(doc.game.yahooPlayersMentioned ?? {})) {
    const key = normalizeNameKey(name)
    if (key && id) m.set(key, String(id).trim())
  }
  // startingLineup 由来も足しておく（yahooPlayersMentioned が欠ける場合）
  for (const t of doc.game.teams ?? []) {
    for (const p of t.startingLineup ?? []) {
      const key = normalizeNameKey(p.playerName ?? "")
      const id = (p.yahooPlayerId ?? "").trim()
      if (key && id) m.set(key, id)
    }
  }
  return m
}

/**
 * その試合で「捕手として守った可能性が高い」Yahoo選手IDを集める。
 * - スタメン捕手
 * - battingLines の positionCell に (捕)
 * - textPlayByPlay の守備交代/守備変更（捕手）をベストエフォートで拾う
 */
export function catcherYahooIdsFromCanonical(doc: CanonicalGameDocument): Set<string> {
  const out = new Set<string>()
  const nameToId = buildNameToYahooId(doc)

  // スタメン捕手（両チーム）
  for (const team of doc.game.teams ?? []) {
    const c = getStartingCatcherForTeam(doc, team.teamName)
    if (c?.yahooPlayerId) out.add(c.yahooPlayerId)
  }

  // 出場成績（打撃行）に (捕) があれば捕手経験として拾う
  for (const bl of doc.domain?.battingLines ?? []) {
    const id = (bl.yahooPlayerId ?? "").trim()
    if (!id) continue
    const pos = (bl.positionCell ?? "").trim()
    if (pos.includes("(捕)")) out.add(id)
  }

  // play-by-play から捕手の守備交代/守備変更を拾う（名前→yahooId は近似）
  for (const sec of doc.game.textPlayByPlay ?? []) {
    for (const raw of sec.lines ?? []) {
      const line = (raw ?? "").trim()
      if (!line) continue

      // 例: "守備交代:ライト 尾田" / "守備交代:捕手 ○○"
      {
        const m = line.match(/守備交代:捕手\s*([^\s　]+)/)
        if (m) {
          const key = normalizeNameKey(m[1] ?? "")
          const id = key ? nameToId.get(key) : null
          if (id) out.add(id)
        }
      }

      // 例: "守備変更: 石川昂 →ファースト" / "... →捕手"
      {
        const m = line.match(/守備変更:\s*([^　 ]+)\s*[→→]\s*捕/)
        if (m) {
          const key = normalizeNameKey(m[1] ?? "")
          const id = key ? nameToId.get(key) : null
          if (id) out.add(id)
        }
      }
    }
  }

  return out
}

