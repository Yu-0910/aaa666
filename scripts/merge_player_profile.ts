/**
 * Phase 6: player profile merged JSON (career + profile + salary)
 *
 * - career_from_master: _data/derived/player_profile/career_from_master/{id}.json
 * - profile_npb:        _data/derived/player_profile/profile_npb/{id}.json
 * - player_salary:      _data/derived/player_salary/{id}.json
 *
 * Adds totals:
 * - career_batting.total (counting + rate + derived metrics)
 * - career_pitching.total (counting + ERA/WHIP/K-BB%/K%/BB% + WPCT)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"

type AnyDict = Record<string, any>

const ROOT = process.cwd()

const PATH_TARGETS = join(ROOT, "_data", "player_profile", "_targets_2026.json")
const DIR_CAREER = join(ROOT, "_data", "derived", "player_profile", "career_from_master")
const DIR_PROFILE = join(ROOT, "_data", "derived", "player_profile", "profile_npb")
const DIR_SALARY = join(ROOT, "_data", "derived", "player_salary")
const DIR_OUT = join(ROOT, "_data", "derived", "player_profile", "merged")
const PATH_MISMATCH_REPORT = join(ROOT, "_reports", "player_profile_salary_year_mismatch.csv")

function readJson(path: string): AnyDict {
  return JSON.parse(readFileSync(path, "utf-8"))
}

function readJsonIfExists(path: string, fallback: AnyDict = {}): AnyDict {
  if (!existsSync(path)) return fallback
  try {
    return readJson(path)
  } catch {
    return fallback
  }
}

/** salary_by_year のキーは "2024" 形式の文字列 */
function salaryMapFromPayload(salary: AnyDict): Record<number, number> {
  const raw = salary.salary_by_year ?? {}
  const out: Record<number, number> = {}
  for (const [k, v] of Object.entries(raw)) {
    const y = Number(k)
    const yen = toNum(v)
    if (Number.isFinite(y) && yen !== null && yen > 0) out[y] = yen
  }
  return out
}

function yearsFromRows(rows: AnyDict[]): number[] {
  const set = new Set<number>()
  for (const r of rows) {
    const y = toNum(r.year)
    if (y !== null) set.add(y)
  }
  return [...set].sort((a, b) => a - b)
}

function attachSalaryToRows(rows: AnyDict[], salaryByYear: Record<number, number>): AnyDict[] {
  return rows.map((r) => {
    const y = toNum(r.year)
    const salary_yen = y !== null && salaryByYear[y] !== undefined ? salaryByYear[y] : null
    return { ...r, salary_yen }
  })
}

type MismatchRow = {
  npb_player_id: string
  name_ja: string
  career_kind: "batting" | "pitching"
  year: number
  issue: "missing_salary" | "missing_career"
  career_years: string
  salary_years: string
}

function collectYearMismatches(
  pid: string,
  nameJa: string,
  careerKind: "batting" | "pitching",
  careerYears: number[],
  salaryYears: number[],
): MismatchRow[] {
  const out: MismatchRow[] = []
  const careerSet = new Set(careerYears)
  const salarySet = new Set(salaryYears)
  const careerStr = careerYears.join("|")
  const salaryStr = salaryYears.join("|")

  for (const y of careerYears) {
    if (!salarySet.has(y)) {
      out.push({
        npb_player_id: pid,
        name_ja: nameJa,
        career_kind: careerKind,
        year: y,
        issue: "missing_salary",
        career_years: careerStr,
        salary_years: salaryStr,
      })
    }
  }
  for (const y of salaryYears) {
    if (!careerSet.has(y)) {
      out.push({
        npb_player_id: pid,
        name_ja: nameJa,
        career_kind: careerKind,
        year: y,
        issue: "missing_career",
        career_years: careerStr,
        salary_years: salaryStr,
      })
    }
  }
  return out
}

function writeMismatchCsv(rows: MismatchRow[]): void {
  mkdirSync(dirname(PATH_MISMATCH_REPORT), { recursive: true })
  const header =
    "npb_player_id,name_ja,career_kind,year,issue,career_years,salary_years\n"
  const body = rows
    .map((r) =>
      [
        r.npb_player_id,
        r.name_ja,
        r.career_kind,
        String(r.year),
        r.issue,
        r.career_years,
        r.salary_years,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n")
  writeFileSync(PATH_MISMATCH_REPORT, "\ufeff" + header + body, "utf-8")
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8")
}

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === "number" && Number.isFinite(v)) return v
  const s = String(v).trim()
  if (!s || s === "-" || s.toLowerCase() === "nan") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function sumNums(rows: AnyDict[], key: string): number {
  let s = 0
  for (const r of rows) s += toNum(r[key]) ?? 0
  return s
}

function safeDiv(n: number, d: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null
  return n / d
}

function round3(v: number | null): number | null {
  if (v === null) return null
  return Math.round(v * 1000) / 1000
}

function round1(v: number | null): number | null {
  if (v === null) return null
  return Math.round(v * 10) / 10
}

// NPB IP format "143.2" = 143 + 2/3 innings
function ipToOuts(ip: any): number | null {
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

function computeBattingTotal(rows: AnyDict[]): AnyDict {
  const total: AnyDict = {}

  // counting stats
  total.games = sumNums(rows, "games")
  total.pa = sumNums(rows, "pa")
  total.ab = sumNums(rows, "ab")
  total.runs = sumNums(rows, "runs")
  total.hits = sumNums(rows, "hits")
  total.doubles = sumNums(rows, "doubles")
  total.triples = sumNums(rows, "triples")
  total.hr = sumNums(rows, "hr")
  total.rbi = sumNums(rows, "rbi")
  total.sb = sumNums(rows, "sb")
  total.cs = sumNums(rows, "cs")
  total.sh = sumNums(rows, "sh")
  total.sf = sumNums(rows, "sf")
  total.bb = sumNums(rows, "bb")
  total.ibb = sumNums(rows, "ibb")
  total.hbp = sumNums(rows, "hbp")
  total.so = sumNums(rows, "so")
  total.gidp = sumNums(rows, "gidp")

  // total bases: prefer TB if present; else derive
  const tbFromRows = sumNums(rows, "tb")
  const singles = Math.max(0, total.hits - total.doubles - total.triples - total.hr)
  total.singles = singles
  total.tb = tbFromRows > 0 ? tbFromRows : singles + 2 * total.doubles + 3 * total.triples + 4 * total.hr

  // rate stats from totals
  const avg = safeDiv(total.hits, total.ab)
  const obp = safeDiv(total.hits + total.bb + total.hbp, total.ab + total.bb + total.hbp + total.sf)
  const slg = safeDiv(total.tb, total.ab)
  const ops = obp !== null && slg !== null ? obp + slg : null

  total.avg = round3(avg)
  total.obp = round3(obp)
  total.slg = round3(slg)
  total.ops = round3(ops)

  // derived metrics (best-effort)
  total.isop = round3(slg !== null && avg !== null ? slg - avg : null)
  total.isod = round3(obp !== null && avg !== null ? obp - avg : null)
  total.bb_pct = round1(safeDiv(total.bb, total.pa) !== null ? (total.bb / total.pa) * 100 : null)
  total.k_pct = round1(safeDiv(total.so, total.pa) !== null ? (total.so / total.pa) * 100 : null)
  total.bb_k = round3(safeDiv(total.bb, total.so))
  total.babip = round3(
    safeDiv(total.hits - total.hr, total.ab - total.so - total.hr + total.sf),
  )
  total.seca = round3(
    safeDiv(total.tb - total.hits + total.bb + total.hbp + total.sb - total.cs, total.ab),
  )
  total.ta = round3(safeDiv(total.tb + total.bb + total.hbp, total.ab + total.bb + total.hbp))
  // NOI / GPA: commonly used approximations
  total.noi = round3(obp !== null && slg !== null ? (obp + slg) / 2 : null)
  total.gpa = round3(obp !== null && slg !== null ? (1.8 * obp + slg) / 4 : null)

  // RC / XR: if per-year exists, sum; otherwise basic RC approximation
  const rcSum = sumNums(rows, "rc")
  total.rc =
    rcSum > 0
      ? round3(rcSum)
      : round3(
          safeDiv((total.hits + total.bb) * total.tb, total.ab + total.bb) ?? null,
        )
  const xrSum = sumNums(rows, "xr")
  total.xr = xrSum > 0 ? round3(xrSum) : null

  return total
}

function computePitchingTotal(rows: AnyDict[]): AnyDict {
  const total: AnyDict = {}
  total.games = sumNums(rows, "games")
  total.wins = sumNums(rows, "wins")
  total.losses = sumNums(rows, "losses")
  total.saves = sumNums(rows, "saves")
  total.bf = sumNums(rows, "bf")
  total.hits_allowed = sumNums(rows, "hits_allowed")
  total.hr_allowed = sumNums(rows, "hr_allowed")
  total.bb = sumNums(rows, "bb")
  total.hbp = sumNums(rows, "hbp")
  total.so = sumNums(rows, "so")
  total.er = sumNums(rows, "er")
  total.r = sumNums(rows, "r") // may be missing in Phase1 rows
  total.holds = sumNums(rows, "holds")

  // IP: sum outs
  let outs = 0
  let anyIp = false
  for (const r of rows) {
    const o = ipToOuts(r.ip)
    if (o !== null) {
      outs += o
      anyIp = true
    }
  }
  total.ip = anyIp ? outsToIpString(outs) : null

  const ipInnings = outs / 3
  total.era = round3(safeDiv(total.er * 9, ipInnings))
  total.whip = round3(safeDiv(total.bb + total.hits_allowed, ipInnings))
  total.k_bb_pct = round1(safeDiv(total.so - total.bb, total.bf) !== null ? ((total.so - total.bb) / total.bf) * 100 : null)
  total.k_pct = round1(safeDiv(total.so, total.bf) !== null ? (total.so / total.bf) * 100 : null)
  total.bb_pct = round1(safeDiv(total.bb, total.bf) !== null ? (total.bb / total.bf) * 100 : null)
  total.wpct = round3(safeDiv(total.wins, total.wins + total.losses))

  return total
}

function main(): void {
  const targets = readJson(PATH_TARGETS) as AnyDict[]
  mkdirSync(DIR_OUT, { recursive: true })

  const mismatchAll: MismatchRow[] = []
  let mergedCount = 0

  for (const t of targets) {
    const pid = String(t.npb_player_id ?? "").trim()
    if (!pid) continue

    const careerPath = join(DIR_CAREER, `${pid}.json`)
    if (!existsSync(careerPath)) continue

    const career = readJson(careerPath)
    const profile = readJsonIfExists(join(DIR_PROFILE, `${pid}.json`))
    const salary = readJsonIfExists(join(DIR_SALARY, `${pid}.json`))

    const nameJa = String(t.name_ja ?? profile.name_ja ?? career.name_ja ?? "").trim()
    const salaryByYear = salaryMapFromPayload(salary)
    const salaryYears = Object.keys(salaryByYear)
      .map(Number)
      .sort((a, b) => a - b)

    const battingRowsRaw: AnyDict[] = (career.career_batting?.rows ?? []) as AnyDict[]
    const pitchingRowsRaw: AnyDict[] = (career.career_pitching?.rows ?? []) as AnyDict[]

    const battingRows = attachSalaryToRows(battingRowsRaw, salaryByYear)
    const pitchingRows = attachSalaryToRows(pitchingRowsRaw, salaryByYear)

    const battingYears = yearsFromRows(battingRows)
    const pitchingYears = yearsFromRows(pitchingRows)

    if (battingRows.length > 0) {
      mismatchAll.push(
        ...collectYearMismatches(pid, nameJa, "batting", battingYears, salaryYears),
      )
    }
    if (pitchingRows.length > 0) {
      mismatchAll.push(
        ...collectYearMismatches(pid, nameJa, "pitching", pitchingYears, salaryYears),
      )
    }

    const battingTotal = computeBattingTotal(battingRows)
    battingTotal.salary_yen = null

    let pitchingBlock: AnyDict | null = null
    if (career.career_pitching) {
      const pitchingTotal = computePitchingTotal(pitchingRows)
      pitchingTotal.salary_yen = null
      pitchingBlock = {
        ...(career.career_pitching ?? { rows: [] }),
        rows: pitchingRows,
        total: pitchingTotal,
        source: "master_csv",
      }
    }

    const merged: AnyDict = {
      npb_player_id: pid,
      name_ja: nameJa,
      profile: profile.profile ?? {},
      salary_by_year: salary.salary_by_year ?? {},
      career_total_salary_est_yen: salary.career_total_salary_est_yen ?? null,
      career_total_salary_display: salary.career_total_salary_display ?? null,
      career_batting: career.career_batting
        ? {
            ...career.career_batting,
            rows: battingRows,
            total: battingTotal,
            source: "master_csv",
          }
        : null,
      career_pitching: pitchingBlock,
      meta: {
        merged_at: new Date().toISOString(),
        career_built_from: "master_csv_calculated",
        profile_source: profile.profile ? "NPB_OFFICIAL" : undefined,
      },
    }

    writeJson(join(DIR_OUT, `${pid}.json`), merged)
    mergedCount += 1
  }

  writeMismatchCsv(mismatchAll)

  console.log("=== Phase 6: merge 完了 ===")
  console.log(`  merged: ${mergedCount} 件 -> ${DIR_OUT}`)
  console.log(`  年俸×成績 年度不一致: ${mismatchAll.length} 行 -> ${PATH_MISMATCH_REPORT}`)
}

main()

