/** 投手別 rows の上位 N 件に依存しないシーズン合算（チーム捕手一覧用） */
export type CatcherPitcherSeasonTotals = {
  bf: number
  ab: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  ibb: number
  ipOuts: number
  er: number
  era: number | null
  whip: number | null
  kPct: number | null
  wins: number
  losses: number
  qsCount: number
}

export type CatcherPitcherSplitsDerived = {
  schemaVersion: "player-catcher-pitcher-splits-v1"
  seasonYear: string
  npbCatcherId: string
  rows: CatcherPitcherSplitRow[]
  seasonTotals?: CatcherPitcherSeasonTotals
}

export type CatcherPitcherSplitRow = {
  pitcherNpbId: string
  pitcherName: string
  pitcherTeam: string
  bf: number
  ab: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  ipOuts: number
  era: number | null
  ip: string
  wl: string
  kPct: number | null
  kBbPct: number | null
  whip: number | null
  qsPct: number | null
  games?: number
  wins?: number
  losses?: number
  qsCount?: number
  er?: number
  ibb?: number
}

export function buildCatcherPitcherSeasonTotals(
  rows: readonly CatcherPitcherSplitRow[],
): CatcherPitcherSeasonTotals | null {
  if (rows.length === 0) return null

  const sum = rows.reduce(
    (a, r) => {
      a.bf += r.bf ?? 0
      a.ab += r.ab ?? 0
      a.h += r.h ?? 0
      a.hr += r.hr ?? 0
      a.so += r.so ?? 0
      a.bb += r.bb ?? 0
      a.hbp += r.hbp ?? 0
      a.ibb += r.ibb ?? 0
      a.ipOuts += r.ipOuts ?? 0
      a.er += r.er ?? 0
      a.wins += r.wins ?? 0
      a.losses += r.losses ?? 0
      a.qsCount += r.qsCount ?? 0
      if (r.er !== undefined) a.hasDirectEr = true
      return a
    },
    {
      bf: 0,
      ab: 0,
      h: 0,
      hr: 0,
      so: 0,
      bb: 0,
      hbp: 0,
      ibb: 0,
      ipOuts: 0,
      er: 0,
      wins: 0,
      losses: 0,
      qsCount: 0,
      hasDirectEr: false,
    },
  )

  let er = sum.er
  if (!sum.hasDirectEr && sum.ipOuts > 0) {
    er = rows.reduce((acc, r) => {
      const outs = r.ipOuts ?? 0
      const era = r.era
      if (era == null || outs <= 0) return acc
      return acc + (era * outs) / 27
    }, 0)
  }

  const era = sum.ipOuts > 0 ? (er * 27) / sum.ipOuts : null
  const whip = sum.ipOuts > 0 ? (sum.h + sum.bb) / (sum.ipOuts / 3) : null
  const kPct = sum.bf > 0 ? (sum.so / sum.bf) * 100 : null

  return {
    bf: sum.bf,
    ab: sum.ab,
    h: sum.h,
    hr: sum.hr,
    so: sum.so,
    bb: sum.bb,
    hbp: sum.hbp,
    ibb: sum.ibb,
    ipOuts: sum.ipOuts,
    er: Math.round(er * 10) / 10,
    wins: sum.wins,
    losses: sum.losses,
    qsCount: sum.qsCount,
    era,
    whip,
    kPct,
  }
}

