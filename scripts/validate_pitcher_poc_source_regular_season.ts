import fs from "fs"
import path from "path"

type PitcherPocPayload = {
  npbPlayerId?: string
  playerName?: string
  source?: { canonicalGames?: string[] }
}

function parseArgs(argv: string[]): { year: string } {
  const yearIdx = argv.indexOf("--year")
  const year = yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026"
  return { year: year || "2026" }
}

function titleToYmd(title: string): string | null {
  const m = title.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return null
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`
}

function main(): void {
  const { year } = parseArgs(process.argv.slice(2))
  const root = process.cwd()
  const dir = path.join(root, "_data", "derived", "player_season_pitching_poc", year)
  const canonicalDir = path.join(root, "_data", "scraped_games", "canonical")
  const openDay = `${year}-03-27`
  if (!fs.existsSync(dir)) {
    console.error(`[validate:pitcher-poc-source] missing dir: ${dir}`)
    process.exit(2)
  }

  const offenders: Array<{ npb: string; name: string; bad: Array<{ gid: string; ymd: string | null; title: string }> }> = []
  for (const f of fs.readdirSync(dir)) {
    if (!/^npb_\d+\.json$/.test(f)) continue
    const p = path.join(dir, f)
    let payload: PitcherPocPayload
    try {
      payload = JSON.parse(fs.readFileSync(p, "utf8")) as PitcherPocPayload
    } catch {
      console.error(`[validate:pitcher-poc-source] JSON parse failed: ${p}`)
      process.exit(1)
    }
    const bad: Array<{ gid: string; ymd: string | null; title: string }> = []
    for (const gid of payload.source?.canonicalGames ?? []) {
      const cp = path.join(canonicalDir, `${gid}.json`)
      if (!fs.existsSync(cp)) continue
      const doc = JSON.parse(fs.readFileSync(cp, "utf8")) as {
        game?: { meta?: { documentTitle?: string; ogTitle?: string } }
      }
      const title = String(doc?.game?.meta?.documentTitle ?? doc?.game?.meta?.ogTitle ?? "").trim()
      const ymd = titleToYmd(title)
      if (ymd && ymd < openDay) {
        bad.push({ gid, ymd, title })
      }
    }
    if (bad.length > 0) {
      offenders.push({
        npb: String(payload.npbPlayerId ?? "").trim() || f.replace(/^npb_/, "").replace(/\.json$/, ""),
        name: String(payload.playerName ?? "").trim() || "(unknown)",
        bad,
      })
    }
  }

  if (offenders.length > 0) {
    console.error(
      `[validate:pitcher-poc-source] NG: ${offenders.length} pitchers contain pre-opening source games (< ${openDay})`,
    )
    for (const offender of offenders.slice(0, 20)) {
      console.error(`  npb=${offender.npb} name=${offender.name}`)
      for (const bad of offender.bad.slice(0, 5)) {
        console.error(`    ${bad.gid} ${bad.ymd ?? "?"} ${bad.title}`)
      }
    }
    process.exit(1)
  }

  console.log(`[validate:pitcher-poc-source] OK: no pre-opening source games in ${dir}`)
}

main()
