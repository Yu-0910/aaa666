import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { CURRENT_ROSTER_PLAYER_ENTRIES } from "@/lib/currentRosterPlayerEntries"
import { playerPageHrefKnown } from "@/lib/playerPageHref"
import { compactPlayerName, rosterNameMatchKey } from "@/lib/playerNameNormalize"
import { getPlayerSlugEntryByNpbId, resolvePlayerSlugEntry } from "@/lib/playerSlug.server"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"

type Args = {
  year: string
  from: string
  to: string
  gameIds: string[]
  dryRun: boolean
}

type Candidate = {
  name: string
  team: string
  yahooPlayerId: string
  npbPlayerId: string
  role: string
  gameId: string
  source: string
}

type UnknownPlayerReportRow = Candidate & {
  resolvedNpbPlayerId: string
  category: "new_player_candidate" | "existing_page_not_current_roster"
  existingSlug: string
  recommendedProcedure: "A" | "B"
  reason: string
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

function parseArgs(argv: string[]): Args {
  const out: Args = {
    year: "2026",
    from: "",
    to: "",
    gameIds: [],
    dryRun: false,
  }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i] ?? ""
    if (a === "--year" && argv[i + 1]) out.year = String(argv[++i]).trim()
    else if (a === "--from" && argv[i + 1]) out.from = String(argv[++i]).trim()
    else if (a === "--to" && argv[i + 1]) out.to = String(argv[++i]).trim()
    else if (a === "--game-ids" && argv[i + 1]) {
      out.gameIds = String(argv[++i])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (a === "--dry-run") out.dryRun = true
  }
  return out
}

function readJsonOrNull(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    return null
  }
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00+09:00`)
  d.setDate(d.getDate() + days)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function eachDateYmd(from: string, to: string): string[] {
  const dates: string[] = []
  if (!from || !to) return dates
  for (let cur = from; cur <= to; cur = addDaysYmd(cur, 1)) dates.push(cur)
  return dates
}

function gameIdsForDate(dateJst: string): string[] {
  const snapPath = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date", `${dateJst}.json`)
  const snap = readJsonOrNull(snapPath)
  if (Array.isArray(snap?.gameIds)) return snap.gameIds.map(String).filter(Boolean)
  return (Array.isArray(snap?.games) ? snap.games : [])
    .map((g: any) => String(g?.gameId ?? "").trim())
    .filter(Boolean)
}

function targetGameIds(args: Args): string[] {
  if (args.gameIds.length > 0) return [...new Set(args.gameIds)].sort()
  const ids = new Set<string>()
  for (const dateJst of eachDateYmd(args.from, args.to)) {
    for (const gameId of gameIdsForDate(dateJst)) ids.add(gameId)
  }
  return [...ids].sort()
}

function cleanName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ")
}

function candidateKey(c: Candidate): string {
  return [
    compactPlayerName(c.name),
    c.yahooPlayerId || "-",
    c.npbPlayerId || "-",
    c.team || "-",
    c.role,
  ].join("|")
}

function pushCandidate(map: Map<string, Candidate>, c: Candidate): void {
  if (!c.name || c.name === "不明") return
  const key = candidateKey(c)
  if (!map.has(key)) map.set(key, c)
}

function collectCandidates(gameIds: string[]): Candidate[] {
  const map = new Map<string, Candidate>()
  for (const gameId of gameIds) {
    const canonicalPath = path.join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
    const doc = readJsonOrNull(canonicalPath)
    if (!doc) continue
    for (const row of doc?.domain?.battingLines ?? []) {
      pushCandidate(map, {
        name: cleanName(row?.playerName ?? row?.name),
        team: cleanName(row?.teamCode ?? row?.teamName),
        yahooPlayerId: cleanName(row?.yahooPlayerId),
        npbPlayerId: cleanName(row?.npbPlayerId ?? row?.npb_player_id),
        role: "batter",
        gameId,
        source: "domain.battingLines",
      })
    }
    for (const row of doc?.domain?.pitchingLines ?? []) {
      pushCandidate(map, {
        name: cleanName(row?.playerName ?? row?.name),
        team: cleanName(row?.teamCode ?? row?.teamName),
        yahooPlayerId: cleanName(row?.yahooPlayerId),
        npbPlayerId: cleanName(row?.npbPlayerId ?? row?.npb_player_id),
        role: "pitcher",
        gameId,
        source: "domain.pitchingLines",
      })
    }
    for (const row of doc?.game?.statsPlayerLinkedRows ?? []) {
      pushCandidate(map, {
        name: cleanName(row?.playerName ?? row?.name),
        team: cleanName(row?.teamCode ?? row?.teamName),
        yahooPlayerId: cleanName(row?.yahooPlayerId),
        npbPlayerId: cleanName(row?.npbPlayerId ?? row?.npb_player_id),
        role: cleanName(row?.role) || "stats-row",
        gameId,
        source: "game.statsPlayerLinkedRows",
      })
    }
  }
  return [...map.values()]
}

const currentRosterByNpb = new Map(CURRENT_ROSTER_PLAYER_ENTRIES.map((p) => [p.npbPlayerId, p]))
const currentRosterNameKeys = new Set<string>()
for (const entry of CURRENT_ROSTER_PLAYER_ENTRIES) {
  currentRosterNameKeys.add(rosterNameMatchKey(entry.nameJa))
  currentRosterNameKeys.add(compactPlayerName(entry.nameJa))
}

function isCurrentRosterCandidate(c: Candidate, resolvedNpbPlayerId: string): boolean {
  if (resolvedNpbPlayerId && currentRosterByNpb.has(resolvedNpbPlayerId)) return true
  return currentRosterNameKeys.has(rosterNameMatchKey(c.name)) || currentRosterNameKeys.has(compactPlayerName(c.name))
}

function classifyCandidate(c: Candidate): UnknownPlayerReportRow | null {
  const rawNpb = c.npbPlayerId.replace(/\D/g, "")
  const mappedNpb = c.yahooPlayerId ? resolveNpbPlayerIdFromPublicId(c.yahooPlayerId) : ""
  const resolvedNpb = rawNpb || (mappedNpb && mappedNpb !== c.yahooPlayerId ? mappedNpb : "")
  if (isCurrentRosterCandidate(c, resolvedNpb)) return null
  const href = playerPageHrefKnown({
    npbPlayerId: resolvedNpb || undefined,
    playerId: c.yahooPlayerId || undefined,
    name: c.name,
  })
  const existingEntry =
    (resolvedNpb ? getPlayerSlugEntryByNpbId(resolvedNpb) : null) ??
    resolvePlayerSlugEntry(c.name)
  if (href || existingEntry) {
    return {
      ...c,
      resolvedNpbPlayerId: resolvedNpb,
      category: "existing_page_not_current_roster",
      existingSlug: existingEntry?.slug ?? href?.replace(/^\/players\//, "") ?? "",
      recommendedProcedure: "B",
      reason: "既存個人ページまたはhistorical slugで解決できるが、2026現在名簿にはいない",
    }
  }
  return {
    ...c,
    resolvedNpbPlayerId: resolvedNpb,
    category: "new_player_candidate",
    existingSlug: "",
    recommendedProcedure: "A",
    reason: "2026現在名簿・既存個人ページ・Yahoo/NPB対応のいずれにも確定一致しない",
  }
}

function reportPayload(args: Args, rows: UnknownPlayerReportRow[], scannedGameIds: string[]) {
  return {
    schemaVersion: "unknown-player-resolution-report-v1",
    generatedAt: new Date().toISOString(),
    year: args.year,
    from: args.from,
    to: args.to,
    scannedGameIds,
    procedureDoc: "docs/unknown_player_resolution_procedure.md",
    firstPublishPolicy: "unresolved players are rendered without personal-page links",
    counts: {
      total: rows.length,
      newPlayerCandidates: rows.filter((r) => r.category === "new_player_candidate").length,
      existingPageNotCurrentRoster: rows.filter((r) => r.category === "existing_page_not_current_roster").length,
    },
    rows,
  }
}

function writeReport(args: Args, rows: UnknownPlayerReportRow[], scannedGameIds: string[]): string {
  const outDir = path.join(root, "_data", "unknown_players", args.year)
  fs.mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const payload = reportPayload(args, rows, scannedGameIds)
  const reportPath = path.join(outDir, `${stamp}.json`)
  const latestPath = path.join(outDir, "latest.json")
  fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  fs.writeFileSync(latestPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  return reportPath
}

function main(): void {
  const args = parseArgs(process.argv)
  const scannedGameIds = targetGameIds(args)
  const candidates = collectCandidates(scannedGameIds)
  const rowMap = new Map<string, UnknownPlayerReportRow>()
  for (const row of candidates.map(classifyCandidate)) {
    if (!row) continue
    const key = [
      row.category,
      compactPlayerName(row.name),
      row.yahooPlayerId || "-",
      row.resolvedNpbPlayerId || row.npbPlayerId || "-",
      row.team || "-",
    ].join("|")
    if (!rowMap.has(key)) rowMap.set(key, row)
  }
  const rows = [...rowMap.values()].sort(
    (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, "ja"),
  )
  const reportPath = args.dryRun ? "" : writeReport(args, rows, scannedGameIds)
  console.log(`[unknown-player-resolution] scannedGames=${scannedGameIds.length} candidates=${candidates.length} unknown=${rows.length}`)
  if (args.dryRun) {
    console.log("[unknown-player-resolution] dry-run: report was not written")
    console.log(JSON.stringify(reportPayload(args, rows, scannedGameIds), null, 2))
  } else {
    console.log(`[unknown-player-resolution] report=${path.relative(root, reportPath).replace(/\\/g, "/")}`)
  }
  if (rows.length === 0) {
    console.log("[unknown-player-resolution] OK: unknown players not found")
    return
  }
  console.warn("[unknown-player-resolution] action required:")
  for (const row of rows) {
    console.warn(
      `  - [${row.recommendedProcedure}] ${row.name} team=${row.team || "-"} yahoo=${row.yahooPlayerId || "-"} npb=${row.resolvedNpbPlayerId || "-"} reason=${row.reason}`,
    )
  }
}

main()
