/**
 * 英字名マップAPI
 * CSV（player_name_en列）を参照し、「名前|チーム」→ 英字名 のマップを返す
 * ランキングページでJSONにromanNameが無い場合の補完に使用
 */

import { NextResponse } from 'next/server'
import { CURRENT_ROSTER_PLAYER_ENTRIES } from '@/lib/currentRosterPlayerEntries'
import { normalizeRomanMapKey, normalizeRomanMapKeyNoSpace } from '@/lib/ranking/romanNameLookup'
import { leagueFromTeamShort, teamShortFromCode } from '@/lib/standings/teamCodes'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

function normalizeNpbId(id: string | undefined): string {
  return String(id ?? '').replace(/\D/g, '').replace(/^0+/, '') || ''
}

function surnameAlias(nameJa: string): string {
  return String(nameJa ?? '').trim().split(/[\s\u3000]+/)[0]?.trim() ?? ''
}

function compactGivenInitialAlias(nameJa: string): string {
  const parts = String(nameJa ?? '').trim().split(/[\s\u3000]+/).filter(Boolean)
  if (parts.length < 2) return ''
  const family = parts[0] ?? ''
  const given = parts.slice(1).join('')
  if (!family || !given) return ''
  return `${family}${given.slice(0, 1)}`
}

function registerRomanAlias(
  map: Record<string, string>,
  nameJa: string,
  teamShort: string,
  romanName: string,
) {
  const name = String(nameJa ?? '').trim()
  const team = String(teamShort ?? '').trim()
  const roman = String(romanName ?? '').trim()
  if (!name || !team || !roman) return
  map[normalizeRomanMapKey(name, team)] = roman
  map[normalizeRomanMapKeyNoSpace(name, team)] = roman
}

function buildRosterRomanNameMap(league: 'CL' | 'PL'): Record<string, string> {
  const map: Record<string, string> = {}

  for (const entry of CURRENT_ROSTER_PLAYER_ENTRIES) {
    const teamShort = teamShortFromCode(entry.teamCode)
    if (leagueFromTeamShort(teamShort) !== league) continue
    const roman = entry.romanFull.trim()
    if (!roman) continue

    registerRomanAlias(map, entry.nameJa, teamShort, roman)

    const surname = surnameAlias(entry.nameJa)
    if (surname && surname !== entry.nameJa) {
      registerRomanAlias(map, surname, teamShort, roman)
    }
    const compactInitial = compactGivenInitialAlias(entry.nameJa)
    if (compactInitial && compactInitial !== surname && compactInitial !== entry.nameJa) {
      registerRomanAlias(map, compactInitial, teamShort, roman)
    }

    const npbId = normalizeNpbId(entry.npbPlayerId)
    if (npbId) map[`npb:${npbId}`] = roman
  }

  return map
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ year: string; league: string }> }
) {
  try {
    const { year, league } = await context.params
    if (!year || !league) {
      return NextResponse.json({ error: 'year and league are required' }, { status: 400 })
    }
    const upperLeague = league.toUpperCase()
    if (upperLeague !== 'CL' && upperLeague !== 'PL') {
      return NextResponse.json({ error: 'league must be CL or PL' }, { status: 400 })
    }
    const map = buildRosterRomanNameMap(upperLeague)
    return NextResponse.json(map, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (e) {
    console.error('[roman-names]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
