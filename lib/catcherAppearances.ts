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

/** 出場成績の守備位置セルが捕手を含むか（(一捕) は includes("(捕)") では拾えない） */
export function isCatcherPositionCell(pos: string): boolean {
  const p = (pos ?? "").trim()
  if (!p) return false
  if (/\([^)]*捕/.test(p)) return true
  if (/捕/.test(p) && !/^走/.test(p)) return true
  return false
}

const PBP_CATCHER_TO_RE =
  /守備変更:\s*([^\s　]+)(?:\s+[^\s　→]+)?→(?:キャッチャー|捕手|捕)/g
const PBP_CATCHER_FROM_RE = /守備変更:\s*([^\s　]+)\s+キャッチャー→/g
const PBP_CATCHER_SUB_RE = /守備交代:\s*(?:捕手|キャッチャー)\s+([^\s　]+)/g
const PBP_CATCHER_FIELDING_RE = /([^\s　：、,]+)\s*\(捕\)/g
/** 実況上「持丸 (捕):パスボール」など、そのプレー時点の捕手 */
const PBP_CATCHER_PLAYING_RE = /([^\s　：、,()]+)\s*\(捕\)\s*[:：]/g

/** 守備交代・守備変更で捕手に入った選手名（出現順） */
export function catcherSubstitutionEnteringNamesFromPbpLine(line: string): string[] {
  const names: string[] = []
  const push = (raw: string) => {
    const n = String(raw ?? "").trim()
    if (n) names.push(n)
  }
  for (const m of line.matchAll(PBP_CATCHER_TO_RE)) push(m[1] ?? "")
  for (const m of line.matchAll(PBP_CATCHER_SUB_RE)) push(m[1] ?? "")
  return names
}

/** その行のプレーでミットを構えていた捕手名（あれば） */
export function explicitCatcherNameFromPbpLine(line: string): string | null {
  const m = line.match(PBP_CATCHER_PLAYING_RE)
  if (!m) return null
  const n = String(m[1] ?? "").trim()
  return n || null
}

function addCatcherIdsFromPbpLine(
  line: string,
  nameToId: Map<string, string>,
  out: Set<string>,
): void {
  const addByName = (raw: string) => {
    const key = normalizeNameKey(raw)
    const id = key ? nameToId.get(key) : null
    if (id) out.add(id)
  }

  for (const name of catcherSubstitutionEnteringNamesFromPbpLine(line)) addByName(name)
  for (const m of line.matchAll(PBP_CATCHER_FROM_RE)) addByName(m[1] ?? "")
  for (const m of line.matchAll(PBP_CATCHER_FIELDING_RE)) addByName(m[1] ?? "")
  for (const m of line.matchAll(PBP_CATCHER_PLAYING_RE)) addByName(m[1] ?? "")
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

  // 出場成績（打撃行）: (捕) / (一捕) など
  for (const bl of doc.domain?.battingLines ?? []) {
    const id = (bl.yahooPlayerId ?? "").trim()
    if (!id) continue
    if (isCatcherPositionCell(bl.positionCell ?? "")) out.add(id)
  }

  // play-by-play から捕手の守備交代/守備変更を拾う（名前→yahooId は近似）
  for (const sec of doc.game.textPlayByPlay ?? []) {
    for (const raw of sec.lines ?? []) {
      const line = (raw ?? "").trim()
      if (!line) continue
      addCatcherIdsFromPbpLine(line, nameToId, out)
    }
  }

  return out
}

