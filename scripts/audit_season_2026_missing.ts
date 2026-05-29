/**
 * 2026 名簿選手について、今季打撃 API（Yahoo 橋渡し）・投手 PoC JSON の欠けを一覧する。
 *
 *   npx tsx scripts/audit_season_2026_missing.ts
 *   npm run audit:season-2026-missing
 *
 * 補足: 橋渡し CSV（batting_master_bridge）が 1 試合分など少数行しか無いと、
 * 「野手で bridge なし」は名簿の大半になる。実害の指標は Phase 11 にある Yahoo ID が
 * loadMaps に載らない件数（bridge / MANUAL / 投手 index で解決できるか）。
 */

import { existsSync, readdirSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { getNpbRoster2026 } from "../lib/npbRoster"
import { isPitcherRegistrationPosition } from "../lib/rosterPitcher"
import { resolveYahooPilotIdForStats } from "../lib/yahooNpbBatterIdMap"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")
const YEAR = "2026"

function main(): void {
  const roster = getNpbRoster2026()
  const battingDir = join(projectRoot, "_data", "derived", "player_season_batting", YEAR)
  const pocDir = join(projectRoot, "_data", "derived", "player_season_pitching_poc", YEAR)

  const missingBattingBridge: Array<{ npb: string; name: string; team: string; pos: string }> = []
  const missingPitchingPoc: Array<{ npb: string; name: string; team: string; pos: string }> = []

  for (const p of roster) {
    const npb = (p.npb_player_id ?? "").trim()
    if (!npb) continue
    const pos = (p.position ?? "").trim()
    const isPitcher = isPitcherRegistrationPosition(pos, { rosterNpbPlayerId: npb })

    if (!isPitcher) {
      const yahoo = resolveYahooPilotIdForStats(npb)
      if (!yahoo) {
        missingBattingBridge.push({
          npb,
          name: (p.name_ja ?? "").trim(),
          team: (p.team ?? "").trim(),
          pos,
        })
      }
    } else {
      const pocPath = join(pocDir, `npb_${npb}.json`)
      if (!existsSync(pocPath)) {
        missingPitchingPoc.push({
          npb,
          name: (p.name_ja ?? "").trim(),
          team: (p.team ?? "").trim(),
          pos,
        })
      }
    }
  }

  /** Phase 11 にある Yahoo ID が橋渡しで逆引きできない（URL が Yahoo でも API が落ちる） */
  const phase11YahooWithoutBridge: string[] = []
  if (existsSync(battingDir)) {
    for (const f of readdirSync(battingDir)) {
      const m = f.match(/^yahoo_(\d+)\.json$/)
      if (!m) continue
      const yid = m[1]!
      if (!resolveYahooPilotIdForStats(yid)) {
        phase11YahooWithoutBridge.push(yid)
      }
    }
  }

  console.log("=== 2026 今季データ欠け監査 ===\n")
  console.log(
    `【野手】名簿あり・打撃 bridge（npb→yahoo）なし: ${missingBattingBridge.length} 人`,
  )
  for (const r of missingBattingBridge.sort((a, b) => a.name.localeCompare(b.name, "ja"))) {
    console.log(`  ${r.npb}\t${r.name}\t${r.team}\t${r.pos}`)
  }

  console.log(
    `\n【投手】名簿あり・PoC JSON（player_season_pitching_poc）なし: ${missingPitchingPoc.length} 人`,
  )
  for (const r of missingPitchingPoc.sort((a, b) => a.name.localeCompare(b.name, "ja"))) {
    console.log(`  ${r.npb}\t${r.name}\t${r.team}\t${r.pos}`)
  }

  console.log(
    `\n【Phase 11 派生はあるが bridge に Yahoo が無い】yahoo_*.json: ${phase11YahooWithoutBridge.length} 件（API が Yahoo ID URL でも解決できない可能性）`,
  )
  if (phase11YahooWithoutBridge.length > 0) {
    console.log(`  例: ${phase11YahooWithoutBridge.slice(0, 20).join(", ")}${phase11YahooWithoutBridge.length > 20 ? " …" : ""}`)
  }

  console.log(
    "\n原因の典型: `_data/scraped_games/derived/*_batting_master_bridge.csv` に yahoo_player_id / npb_player_id の行が無いと、`resolveYahooPilotIdForStats` が null になり season-stats API が hasData:false。投手 PoC は canonical の pitchingLines と名簿照合で生成されない選手はファイル無し。",
  )
}

main()
