/**
 * player_season_pitching_poc の npb_*.json から Yahoo 投手 ID → NPB player_id のインデックスを生成する。
 * 打席橋渡し CSV に載らない「救援のみ」投手の URL（/players/{yahooId}）が名簿に繋がるようにする。
 *
 * 出力: _data/scraped_games/derived/yahoo_pitcher_to_npb.json
 *
 * 使い方: node scripts/build_yahoo_pitcher_npb_index.mjs
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const pocBase = path.join(root, "_data", "derived", "player_season_pitching_poc")
const outPath = path.join(
  root,
  "_data",
  "scraped_games",
  "derived",
  "yahoo_pitcher_to_npb.json",
)

function main() {
  /** @type {Record<string, string>} */
  const map = {}
  const conflicts = []

  if (!fs.existsSync(pocBase)) {
    console.warn("[build_yahoo_pitcher_npb_index] skip: no dir", pocBase)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          schemaVersion: "yahoo-pitcher-to-npb-v1",
          generatedAt: new Date().toISOString(),
          source: "player_season_pitching_poc (empty)",
          map: {},
        },
        null,
        2,
      ),
      "utf8",
    )
    return
  }

  const years = fs.readdirSync(pocBase).filter((d) => {
    const p = path.join(pocBase, d)
    return fs.statSync(p).isDirectory() && /^\d{4}$/.test(d)
  })

  for (const year of years) {
    const dir = path.join(pocBase, year)
    const files = fs.readdirSync(dir).filter((f) => f.startsWith("npb_") && f.endsWith(".json"))
    for (const f of files) {
      const m = f.match(/^npb_(\d+)\.json$/)
      const npbFromName = m ? m[1] : ""
      const full = path.join(dir, f)
      let raw
      try {
        raw = JSON.parse(fs.readFileSync(full, "utf8"))
      } catch {
        continue
      }
      const npb = String(raw.npbPlayerId ?? npbFromName ?? "").replace(/[^\d]/g, "")
      if (!npb) continue
      const ids = raw.yahooPitcherIds
      if (!Array.isArray(ids)) continue
      for (const y of ids) {
        const yid = String(y ?? "").trim().replace(/[^\d]/g, "")
        if (!yid) continue
        if (map[yid] && map[yid] !== npb) {
          conflicts.push({ yahoo: yid, a: map[yid], b: npb, file: f })
        } else {
          map[yid] = npb
        }
      }
    }
  }

  if (conflicts.length > 0) {
    console.warn("[build_yahoo_pitcher_npb_index] npb 衝突（先勝ち）:", conflicts.length)
    for (const c of conflicts.slice(0, 8)) {
      console.warn(`  yahoo ${c.yahoo}: ${c.a} vs ${c.b} (${c.file})`)
    }
  }

  const payload = {
    schemaVersion: "yahoo-pitcher-to-npb-v1",
    generatedAt: new Date().toISOString(),
    source: "player_season_pitching_poc/*/npb_*.json",
    map,
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8")
  console.log(
    "[build_yahoo_pitcher_npb_index] wrote",
    Object.keys(map).length,
    "yahoo→npb →",
    outPath,
  )
}

main()
