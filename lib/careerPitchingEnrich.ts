import type { CareerDisplayRow } from "@/lib/playerCareerMergedDisplay"

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === "number" && Number.isFinite(v)) return v
  const s = String(v).trim()
  if (!s || s === "-" || s.toLowerCase() === "nan") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function round3(v: number | null): number | null {
  if (v === null) return null
  return Math.round(v * 1000) / 1000
}

function round1(v: number | null): number | null {
  if (v === null) return null
  return Math.round(v * 10) / 10
}

function safeDiv(n: number, d: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null
  return n / d
}

/** NPB IP "143.2" → outs */
export function ipToOuts(ip: unknown): number | null {
  if (ip === null || ip === undefined) return null
  const s = String(ip).trim()
  if (!s) return null
  const m = s.match(/^(\d+)(?:\.(\d))?$/)
  if (!m) return null
  const whole = Number(m[1])
  const frac = m[2] ? Number(m[2]) : 0
  if (![0, 1, 2].includes(frac)) return null
  return whole * 3 + frac
}

function outsToIpString(outs: number): string {
  const whole = Math.floor(outs / 3)
  const frac = outs % 3
  return frac === 0 ? String(whole) : `${whole}.${frac}`
}

/** 回数/投球回：NPB表記（143.2）で統一。ランキング JSON の十進数（143.667）も可 */
export function formatPitchingIpDisplay(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  const t = String(value).trim()
  if (t === "—" || t === "-") return "—"

  const fromNpb = ipToOuts(value)
  if (fromNpb !== null) return outsToIpString(fromNpb)

  const n = typeof value === "number" ? value : Number(t)
  if (Number.isFinite(n)) {
    return outsToIpString(Math.round(n * 3))
  }

  return t || "—"
}

/** 年度行に不足している率指標・カウントを補完（投手ランキングと同型の算出） */
export function enrichCareerPitchingRow(row: CareerDisplayRow): CareerDisplayRow {
  const out: CareerDisplayRow = { ...row }

  const bf = toNum(row.bf) ?? 0
  const bb = toNum(row.bb) ?? 0
  const so = toNum(row.so) ?? 0
  const er = toNum(row.er) ?? 0
  const h = toNum(row.hits_allowed) ?? 0
  const wins = toNum(row.wins) ?? 0
  const losses = toNum(row.losses) ?? 0
  const outs = ipToOuts(row.ip)
  const ipInnings = outs !== null ? outs / 3 : null
  const eraStored = toNum(row.era)
  const eraFromEr =
    ipInnings != null && ipInnings > 0 && er > 0 ? round3(safeDiv(er * 9, ipInnings)) : null
  if (eraFromEr != null) {
    const eraMissing = eraStored == null
    const eraZeroWithEr = eraStored === 0
    const eraMismatch =
      eraStored != null && Math.abs(eraStored - eraFromEr) > 0.2
    if (eraMissing || eraZeroWithEr || eraMismatch) {
      out.era = eraFromEr
    }
  }
  if (out.whip == null && ipInnings != null && ipInnings > 0) {
    out.whip = round3(safeDiv(bb + h, ipInnings))
  }
  if (out.k_bb_pct == null && bf > 0) {
    out.k_bb_pct = round1(safeDiv(so - bb, bf) !== null ? ((so - bb) / bf) * 100 : null)
  }
  if (out.k_pct == null && bf > 0) {
    out.k_pct = round1(safeDiv(so, bf) !== null ? (so / bf) * 100 : null)
  }
  if (out.bb_pct == null && bf > 0) {
    out.bb_pct = round1(safeDiv(bb, bf) !== null ? (bb / bf) * 100 : null)
  }
  if (out.wpct == null && wins + losses > 0) {
    out.wpct = round3(safeDiv(wins, wins + losses))
  }

  return out
}

export function enrichCareerPitchingRows(rows: CareerDisplayRow[]): CareerDisplayRow[] {
  return rows.map((r) => enrichCareerPitchingRow(r))
}

export function computeCareerPitchingTotalFromRows(rows: CareerDisplayRow[]): CareerDisplayRow {
  const enriched = enrichCareerPitchingRows(rows.filter((r) => !r.is_total && r.year !== "通算"))
  const total: CareerDisplayRow = { year: "通算", is_total: true }

  const sum = (key: string) =>
    enriched.reduce((acc, r) => acc + (toNum(r[key]) ?? 0), 0)

  total.games = sum("games")
  total.wins = sum("wins")
  total.losses = sum("losses")
  total.saves = sum("saves")
  total.bf = sum("bf")
  total.hits_allowed = sum("hits_allowed")
  total.hr_allowed = sum("hr_allowed")
  total.bb = sum("bb")
  total.hbp = sum("hbp")
  total.so = sum("so")
  total.er = sum("er")
  total.r = sum("r")
  total.holds = sum("holds")
  total.hp = sum("hp")
  total.ibb = sum("ibb")
  total.cg = sum("cg")
  total.sho = sum("sho")
  total.wp = sum("wp")

  let outs = 0
  let anyIp = false
  for (const r of enriched) {
    const o = ipToOuts(r.ip)
    if (o !== null) {
      outs += o
      anyIp = true
    }
  }
  if (anyIp) total.ip = outsToIpString(outs)

  return enrichCareerPitchingRow(total)
}
