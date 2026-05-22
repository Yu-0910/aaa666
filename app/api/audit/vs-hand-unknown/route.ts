import fs from "node:fs"
import path from "node:path"
import { jsonDerivedResponse, yearFromRequest } from "@/lib/api/derivedPlayerApiShared"
import { pitcherThrowHandRLFromYahooPitcherIdWithMentioned } from "@/lib/yahooGame/batterHandFromCanonical"
import { defendingTeamFullNameFromPlateAppearance } from "@/lib/yahooGame/inferTeamsFromTextPbp"
import type { CanonicalGameDocument, PlateAppearance } from "@/lib/yahooGame/types"
import { yahooPitcherIdForVsHandFromPa } from "@/lib/yahooGame/yahooPitcherIdForVsHandFromPa"

export const dynamic = "force-dynamic"

type Row = {
  yahooBatterId: string
  unknownPa: number
  unknownPitchers: Array<{ yahooPitcherId: string; pa: number }>
  missingPitcherIdPas: number
  missingPitcherIdSamples: Array<{ gameId: string; paId: string; pitchEvents: number }>
}

export type VsHandUnknownAuditResponse = {
  hasData: true
  year: string
  checkedBatters: number
  checkedGames: number
  playersWithUnknownOrMissing: number
  top: Row[]
  results?: Row[]
}

export async function GET(request: Request) {
  const year = yearFromRequest(request)
  const url = new URL(request.url)
  const includeAll = url.searchParams.get("all") === "1"
  const topN = Math.max(1, Math.min(500, Number(url.searchParams.get("top") ?? "50") || 50))
  const limitGames = Math.max(1, Math.min(2000, Number(url.searchParams.get("games") ?? "300") || 300))
  const limitBatters = Math.max(1, Math.min(5000, Number(url.searchParams.get("batters") ?? "400") || 400))

  const dir = path.join(process.cwd(), "_data", "derived", "player_season_batting", year)
  const allFiles = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^yahoo_\d+\.json$/.test(f)) : []
  const files = allFiles.sort().slice(0, limitBatters)

  // 1パスで canonical を走査し、(batterId -> unknown/missing) を集計
  // `loadCanonicalGames()` は全件ロードになるため、監査用途ではゲーム数を絞って軽量に読む。
  const canonicalDir = path.join(process.cwd(), "_data", "scraped_games", "canonical")
  const gameFiles = fs.existsSync(canonicalDir)
    ? fs
        .readdirSync(canonicalDir)
        .filter((f) => /^\d+\.json$/.test(f))
        .sort()
        .slice(0, limitGames)
    : []
  const docs: any[] = []
  for (const f of gameFiles) {
    try {
      const p = path.join(canonicalDir, f)
      const raw = fs.readFileSync(p, "utf-8")
      docs.push(JSON.parse(raw))
    } catch {
      // ignore broken doc
    }
  }
  const byBatterUnknownPa = new Map<string, number>()
  const byBatterMissing = new Map<string, { n: number; samples: Array<{ gameId: string; paId: string; pitchEvents: number }> }>()
  const byBatterUnknownPitcher = new Map<string, Map<string, number>>()

  for (const doc of docs) {
    const gameId = String((doc as any)?.gameId ?? "")
    const mentioned = ((doc as any)?.game?.yahooPlayersMentioned ?? {}) as Record<string, string | undefined>
    const pas = ((doc as any)?.domain?.plateAppearances ?? []) as any[]
    for (const pa of pas) {
      const bid = String(pa?.yahooBatterId ?? "").trim()
      if (!bid) continue
      const paId = String(pa?.paId ?? "")
      const pitchEvents = Array.isArray(pa?.pitchEvents) ? pa.pitchEvents.length : 0
      const pid = yahooPitcherIdForVsHandFromPa(pa as PlateAppearance)

      if (!pid) {
        const cur = byBatterMissing.get(bid) ?? { n: 0, samples: [] }
        cur.n += 1
        if (cur.samples.length < 10) cur.samples.push({ gameId, paId, pitchEvents })
        byBatterMissing.set(bid, cur)
        continue
      }

      const th = pitcherThrowHandRLFromYahooPitcherIdWithMentioned(pid, mentioned, {
        defendingTeamFullName: defendingTeamFullNameFromPlateAppearance(
          doc as CanonicalGameDocument,
          pa as PlateAppearance,
        ),
      })
      if (!th) {
        byBatterUnknownPa.set(bid, (byBatterUnknownPa.get(bid) ?? 0) + 1)
        const m = byBatterUnknownPitcher.get(bid) ?? new Map<string, number>()
        m.set(pid, (m.get(pid) ?? 0) + 1)
        byBatterUnknownPitcher.set(bid, m)
      }
    }
  }

  const results: Row[] = []
  for (const f of files) {
    const yahooBatterId = f.replace(/^yahoo_/, "").replace(/\.json$/, "")
    const unknownPa = byBatterUnknownPa.get(yahooBatterId) ?? 0
    const miss = byBatterMissing.get(yahooBatterId)
    const missingPitcherIdPas = miss?.n ?? 0
    const missingPitcherIdSamples = miss?.samples ?? []
    const up = byBatterUnknownPitcher.get(yahooBatterId) ?? new Map<string, number>()
    const unknownPitchers = Array.from(up.entries())
      .map(([yahooPitcherId, pa]) => ({ yahooPitcherId, pa }))
      .sort((a, b) => b.pa - a.pa)
    if (unknownPa > 0 || unknownPitchers.length > 0 || missingPitcherIdPas > 0) {
      results.push({
        yahooBatterId,
        unknownPa,
        unknownPitchers,
        missingPitcherIdPas,
        missingPitcherIdSamples,
      })
    }
  }

  results.sort((a, b) => {
    if (b.unknownPa !== a.unknownPa) return b.unknownPa - a.unknownPa
    if (b.missingPitcherIdPas !== a.missingPitcherIdPas) return b.missingPitcherIdPas - a.missingPitcherIdPas
    return b.unknownPitchers.length - a.unknownPitchers.length
  })

  const top = results.slice(0, topN)
  return jsonDerivedResponse({
    hasData: true,
    year,
    checkedBatters: files.length,
    checkedGames: docs.length,
    playersWithUnknownOrMissing: results.length,
    top,
    results: includeAll ? results : undefined,
  } satisfies VsHandUnknownAuditResponse)
}

