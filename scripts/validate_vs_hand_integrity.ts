import fs from 'node:fs'
import path from 'node:path'
import { parseSlash3, slashRate3FromCounts } from '../lib/battingRateFormat'

type SeasonStatsRow = {
  split_type?: string
  split_value?: string
  pa?: string | number
  ab?: string | number
  h?: string | number
  h1?: string | number
  h2?: string | number
  h3?: string | number
  hr?: string | number
  bb?: string | number
  hbp?: string | number
  sh?: string | number
  sf?: string | number
  avg?: string
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v).trim()
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function approxEq(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps
}

function fmt(n: number): string {
  return String(Math.trunc(n))
}

function main() {
  const year = process.argv.includes('--year')
    ? Number(process.argv[process.argv.indexOf('--year') + 1])
    : 2026

  const root = process.cwd()
  const dir = path.join(root, '_data', 'derived', 'player_season_batting_splits', String(year))
  if (!fs.existsSync(dir)) {
    console.error(`[vs_hand] directory not found: ${dir}`)
    process.exit(2)
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  let badFiles = 0
  let badRows = 0

  for (const f of files) {
    const p = path.join(dir, f)
    let doc: any
    try {
      doc = JSON.parse(fs.readFileSync(p, 'utf8'))
    } catch (e) {
      console.error(`[vs_hand] JSON parse failed: ${p}`)
      badFiles++
      continue
    }

    const rows: SeasonStatsRow[] = Array.isArray(doc?.rows) ? doc.rows : []
    const vs = rows.filter((r) => String(r.split_type ?? '') === 'vs_hand')
    if (vs.length === 0) continue

    for (const r of vs) {
      const pa = num(r.pa)
      const ab = num(r.ab)
      const h = num(r.h)
      const bb = num(r.bb)
      const hbp = num(r.hbp)
      const sh = num(r.sh)
      const sf = num(r.sf)
      const h1 = num(r.h1)
      const h2 = num(r.h2)
      const h3 = num(r.h3)
      const hr = num(r.hr)

      // PA = AB + BB + HBP + SH + SF（通常）。打撃妨害など isAtBat=false の打席は PA のみ増え、
      // rhs に入らない（canonicalBattingSeasonAgg / cellResultToContribution と同じ）。
      const rhs = ab + bb + hbp + sh + sf
      const paGap = pa - rhs
      const paOk = approxEq(pa, rhs) || (paGap === 1 && pa > rhs)

      // H = H1 + H2 + H3 + HR
      const hOk = approxEq(h, h1 + h2 + h3 + hr)

      // AVG = H/AB（AB>0 のとき）
      let avgOk = true
      const avgStr = String(r.avg ?? '').trim()
      if (ab > 0 && avgStr) {
        const expShown = slashRate3FromCounts(h, ab)
        avgOk = avgStr === expShown || parseSlash3(avgStr) === parseSlash3(expShown)
      }

      if (!paOk || !hOk || !avgOk) {
        badRows++
        console.error(
          [
            `[vs_hand] bad row in ${f}`,
            `  split_value=${String(r.split_value ?? '')}`,
            `  PA=${fmt(pa)} AB+BB+HBP+SH+SF=${fmt(rhs)} (ab=${fmt(ab)} bb=${fmt(bb)} hbp=${fmt(hbp)} sh=${fmt(sh)} sf=${fmt(sf)})`,
            `  H=${fmt(h)} H1+H2+H3+HR=${fmt(h1 + h2 + h3 + hr)} (h1=${fmt(h1)} h2=${fmt(h2)} h3=${fmt(h3)} hr=${fmt(hr)})`,
            `  AVG=${avgStr || '(empty)'}  exp=${ab > 0 ? slashRate3FromCounts(h, ab) : '(ab=0)'}`,
          ].join('\n')
        )
        badFiles++
        break
      }
    }
  }

  if (badRows === 0) {
    console.log(`[vs_hand] OK (${files.length} files checked)`)
    process.exit(0)
  }

  console.error(`[vs_hand] NG: badFiles=${badFiles} badRows=${badRows}`)
  process.exit(1)
}

main()

