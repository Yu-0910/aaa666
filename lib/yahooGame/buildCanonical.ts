import type {
  BattingLine,
  CanonicalGameDocument,
  LineupPlayer,
  PitchingLine,
  ScoreboardTeamLine,
  StatsPlayerRowV0,
  TeamBlock,
  TextPlaySection,
} from "./types"
import type { NormalizedGameV0 } from "./normalizedV0"
import { createHash } from "crypto"

function compositeFingerprint(sources: NormalizedGameV0["sources"]): string {
  const keys = Object.keys(sources).sort()
  const parts = keys.map((k) => {
    const v = sources[k] as { sha256?: string }
    return typeof v?.sha256 === "string" ? v.sha256 : JSON.stringify(sources[k])
  })
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex")
}

function asScoreboard(rows: unknown[]): ScoreboardTeamLine[] {
  return rows
    .filter((r): r is Record<string, unknown> => r != null && typeof r === "object")
    .map((r) => ({
      teamName: String(r.teamName ?? ""),
      yahooTeamId: r.yahooTeamId != null ? String(r.yahooTeamId) : null,
      innings: Array.isArray(r.innings) ? r.innings.map(String) : [],
      runs: r.runs != null ? String(r.runs) : undefined,
      hits: r.hits != null ? String(r.hits) : undefined,
      errors: r.errors != null ? String(r.errors) : undefined,
    }))
}

function asLineupPlayers(rows: unknown[]): LineupPlayer[] {
  return rows
    .filter((r): r is Record<string, unknown> => r != null && typeof r === "object")
    .map((r) => ({
      battingOrder: String(r.battingOrder ?? ""),
      fieldingPosition: String(r.fieldingPosition ?? ""),
      playerName: String(r.playerName ?? ""),
      yahooPlayerId: r.yahooPlayerId != null ? String(r.yahooPlayerId) : null,
      bats: r.bats != null ? String(r.bats) : null,
      avgDisplay: r.avgDisplay != null ? String(r.avgDisplay) : null,
    }))
}

function asTeamBlocks(
  lineupsFromScore: unknown[],
  scoreboard: ScoreboardTeamLine[]
): TeamBlock[] {
  const nameToYahoo = new Map<string, string | null>()
  for (const row of scoreboard) {
    nameToYahoo.set(row.teamName, row.yahooTeamId)
  }
  return lineupsFromScore
    .filter((b): b is Record<string, unknown> => b != null && typeof b === "object")
    .map((b) => {
      const teamName = String(b.teamName ?? "")
      return {
        teamName,
        yahooTeamId: nameToYahoo.get(teamName) ?? null,
        startingLineup: asLineupPlayers(Array.isArray(b.startingLineup) ? b.startingLineup : []),
      }
    })
}

function asTextSections(rows: unknown[]): TextPlaySection[] {
  return rows
    .filter((r): r is Record<string, unknown> => r != null && typeof r === "object")
    .map((r) => ({
      sectionTitle: String(r.sectionTitle ?? ""),
      lines: Array.isArray(r.lines) ? r.lines.map(String) : [],
    }))
}

function asStatsRows(rows: unknown[]): StatsPlayerRowV0[] {
  return rows
    .filter((r): r is Record<string, unknown> => r != null && typeof r === "object")
    .map((r) => ({
      yahooPlayerId: r.yahooPlayerId != null ? String(r.yahooPlayerId) : null,
      playerName: String(r.playerName ?? ""),
      cells: Array.isArray(r.cells) ? r.cells.map(String) : [],
    }))
}

const DIGITS = /^\d+$/

/** 防御率っぽい（0.00 / 3.60 / 13.50）。打率1.000はここに含めない */
function isEraTwoDecimals(s: string): boolean {
  return /^\d+\.\d{2}$/.test(s.trim())
}

function parseCellInt(i: number, c: string[]): number | undefined {
  const x = c[i]
  return x && DIGITS.test(x) ? parseInt(x, 10) : undefined
}

/** 出場成績の打者行（投・H・敗・勝・先頭空＋防御率行は除外） */
export function inferBattingLineFromStatsRow(row: StatsPlayerRowV0): BattingLine | null {
  if (!row.yahooPlayerId || row.cells.length < 12) return null
  const c = row.cells
  const p0 = c[0] ?? ""
  if (p0 === "投" || p0 === "H" || p0 === "敗" || p0 === "勝") return null
  if (p0 === "" && isEraTwoDecimals(c[2] ?? "")) return null
  const avg = (c[2] ?? "").trim()
  const abRaw = c[3] ?? ""
  if (!DIGITS.test(abRaw)) return null
  const ab = parseInt(abRaw, 10)
  if (ab > 15) return null
  const avgOk = avg === "-" || /^\.\d{3}$/.test(avg) || /^\d\.\d{3}$/.test(avg)
  if (!avgOk) return null
  return {
    yahooPlayerId: row.yahooPlayerId,
    playerName: row.playerName,
    positionCell: p0,
    avg,
    ab,
    r: parseCellInt(4, c),
    h: parseCellInt(5, c),
    rbi: parseCellInt(6, c),
    so: parseCellInt(7, c),
    bb: parseCellInt(8, c),
    hbp: parseCellInt(9, c),
    sh: parseCellInt(10, c),
    sb: parseCellInt(11, c),
    e: parseCellInt(12, c),
    hr: parseCellInt(13, c),
    inferredFrom: "stats_row_v0",
  }
}

/** 投手成績行（投のみ打撃なし / H・敗・勝 / 先頭空＋防御率） */
export function inferPitchingLineFromStatsRow(row: StatsPlayerRowV0): PitchingLine | null {
  if (!row.yahooPlayerId || row.cells.length < 4) return null
  const c = row.cells
  const p0 = c[0] ?? ""

  if (p0 === "投" && c[2] === "-") {
    return {
      yahooPlayerId: row.yahooPlayerId,
      playerName: row.playerName,
      inferredFrom: "stats_row_v0",
    }
  }

  const eraOk = isEraTwoDecimals(c[2] ?? "")
  const pitchingRow =
    p0 === "H" ||
    p0 === "敗" ||
    p0 === "勝" ||
    (p0 === "" && eraOk) ||
    (p0 === "投" && eraOk)

  if (!pitchingRow || !eraOk) return null

  let decision: PitchingLine["decision"] = null
  if (p0 === "勝") decision = "win"
  else if (p0 === "敗") decision = "loss"
  else if (p0 === "H") decision = "hold"

  return {
    yahooPlayerId: row.yahooPlayerId,
    playerName: row.playerName,
    era: c[2],
    ip: c[3],
    pitches: parseCellInt(4, c),
    bf: parseCellInt(5, c),
    h: parseCellInt(6, c),
    hr: parseCellInt(7, c),
    so: parseCellInt(8, c),
    bb: parseCellInt(9, c),
    hbp: parseCellInt(10, c),
    bk: parseCellInt(11, c),
    r: parseCellInt(12, c),
    er: parseCellInt(13, c),
    decision,
    inferredFrom: "stats_row_v0",
  }
}

export function buildCanonicalFromNormalizedV0(input: NormalizedGameV0): CanonicalGameDocument {
  const scoreboard = asScoreboard(input.scoreboard as unknown[])
  const statsRows = asStatsRows(input.statsPlayerLinkedRows as unknown[])
  const battingLines: BattingLine[] = []
  const pitchingLines: PitchingLine[] = []
  for (const r of statsRows) {
    const b = inferBattingLineFromStatsRow(r)
    if (b) battingLines.push(b)
    const p = inferPitchingLineFromStatsRow(r)
    if (p) pitchingLines.push(p)
  }

  const pitchMeta = input.pitchByPitch as { status?: string; note?: string } | undefined

  return {
    schemaVersion: "yahoo-game-canonical-v1",
    gameId: input.gameId,
    builtAt: new Date().toISOString(),
    sourceSchema: "yahoo-game-normalized-v0",
    sourceCompositeFingerprint: compositeFingerprint(input.sources),
    normalizedFetchedAt: input.fetchedAt,
    game: {
      meta: {
        documentTitle: input.meta?.documentTitle ?? "",
        ogTitle: input.meta?.ogTitle ?? "",
      },
      scoreboard,
      teams: asTeamBlocks(input.lineupsFromScore as unknown[], scoreboard),
      textPlayByPlay: asTextSections(input.textPlayByPlay as unknown[]),
      statsPlayerLinkedRows: statsRows,
      yahooPlayersMentioned: input.yahooPlayersMentioned ?? {},
      missingOrPartial: input.missingOrPartial ?? [],
      pitchByPitchNote: {
        status: String(pitchMeta?.status ?? "unknown"),
        note: typeof pitchMeta?.note === "string" ? pitchMeta.note : undefined,
      },
    },
    domain: {
      plateAppearances: [],
      pitchEvents: [],
      battingLines,
      pitchingLines,
    },
  }
}
