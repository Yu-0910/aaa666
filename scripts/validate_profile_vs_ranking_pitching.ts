import fs from "node:fs"
import path from "node:path"

type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue }

const root = process.cwd()

const profileDirs = [
  path.join(root, "_data", "derived", "player_profile", "profile_npb"),
  path.join(root, "public", "data", "player_profile", "profile_npb"),
]

const rankingDirs = [
  path.join(root, "public", "data", "rankings", "pitching"),
]

const masterCsvDir = path.join(root, "_data", "master_csv")

const numericId = /^\d{5,10}$/

const npbIdKeys = new Set([
  "npb_player_id",
  "npbPlayerId",
  "npb_id",
  "npbId",
  "npb_bis_id",
  "npbBisId",
  "bis_player_id",
  "bisPlayerId",
])

const yahooIdKeys = new Set([
  "yahoo_player_id",
  "yahooPlayerId",
  "yahoo_id",
  "yahooId",
  "sportsnavi_player_id",
  "sportsNaviPlayerId",
  "sports_navi_player_id",
  "sportsNaviId",
])

const genericIdKeys = new Set([
  "id",
  "player_id",
  "playerId",
])

const nameKeys = new Set([
  "name",
  "name_ja",
  "player_name",
  "player_name_ja",
  "playerName",
  "playerNameJa",
  "display_name",
])

function listFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return []

  const out: string[] = []

  function walk(current: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const p = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === ".next" || entry.name === "node_modules") continue
        walk(p)
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        out.push(p)
      }
    }
  }

  walk(dir)
  return out
}

function readJson(file: string): JsonValue | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as JsonValue
  } catch {
    return null
  }
}

function walkJson(value: JsonValue, fn: (obj: Record<string, JsonValue>) => void) {
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, fn)
    return
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, JsonValue>
    fn(obj)
    for (const v of Object.values(obj)) {
      walkJson(v, fn)
    }
  }
}

function asId(value: JsonValue | undefined): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const s = String(Math.trunc(value))
    return numericId.test(s) ? s : null
  }
  if (typeof value === "string") {
    const s = value.trim()
    return numericId.test(s) ? s : null
  }
  return null
}

function hasName(obj: Record<string, JsonValue>): boolean {
  for (const key of Object.keys(obj)) {
    if (nameKeys.has(key) && typeof obj[key] === "string" && obj[key].trim()) {
      return true
    }
  }
  return false
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuote = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    const next = line[i + 1]

    if (ch === '"' && inQuote && next === '"') {
      cur += '"'
      i++
      continue
    }

    if (ch === '"') {
      inQuote = !inQuote
      continue
    }

    if (ch === "," && !inQuote) {
      out.push(cur)
      cur = ""
      continue
    }

    cur += ch
  }

  out.push(cur)
  return out
}

function readCsvRows(file: string): Record<string, string>[] {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length <= 1) return []

  const headers = parseCsvLine(lines[0]).map((x) => x.trim())
  const rows: Record<string, string>[] = []

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = String(cols[i] ?? "").trim()
    })
    rows.push(row)
  }

  return rows
}

function collectProfileNpbIds(): Set<string> {
  const ids = new Set<string>()

  for (const dir of profileDirs) {
    for (const file of listFiles(dir, ".json")) {
      const base = path.basename(file)
      const m = base.match(/^npb_(\d+)\.json$/)
      if (m) ids.add(m[1])

      const data = readJson(file)
      if (!data) continue

      walkJson(data, (obj) => {
        for (const key of npbIdKeys) {
          const id = asId(obj[key])
          if (id) ids.add(id)
        }
      })
    }
  }

  return ids
}

function collectYahooToNpbMap(): Map<string, string> {
  const map = new Map<string, string>()

  // 1. profile JSON 内に両方ある場合
  for (const dir of profileDirs) {
    for (const file of listFiles(dir, ".json")) {
      const base = path.basename(file)
      const fileNpb = base.match(/^npb_(\d+)\.json$/)?.[1] ?? null

      const data = readJson(file)
      if (!data) continue

      walkJson(data, (obj) => {
        let npb = fileNpb

        for (const key of npbIdKeys) {
          const id = asId(obj[key])
          if (id) npb = id
        }

        if (!npb) return

        for (const key of yahooIdKeys) {
          const yahoo = asId(obj[key])
          if (yahoo) map.set(yahoo, npb)
        }
      })
    }
  }

  // 2. master_csv に npb_player_id と Yahoo 系IDが両方ある場合
  if (fs.existsSync(masterCsvDir)) {
    for (const file of listFiles(masterCsvDir, ".csv")) {
      const base = path.basename(file)
      if (!/^(pitching|batting)_\d{4}_(CL|PL)_from_master\.csv$/.test(base)) continue

      let rows: Record<string, string>[] = []
      try {
        rows = readCsvRows(file)
      } catch {
        continue
      }

      for (const row of rows) {
        const npb =
          row["npb_player_id"] ||
          row["npb_id"] ||
          row["npb_bis_id"] ||
          row["bis_player_id"] ||
          ""

        if (!numericId.test(npb)) continue

        const yahooCandidates = [
          row["yahoo_player_id"],
          row["yahoo_id"],
          row["sportsnavi_player_id"],
          row["sports_navi_player_id"],
        ].filter(Boolean)

        for (const yahoo of yahooCandidates) {
          if (numericId.test(yahoo)) map.set(yahoo, npb)
        }
      }
    }
  }

  return map
}

function collectRankingNpbIds(yahooToNpb: Map<string, string>, profileNpbIds: Set<string>) {
  const npbIds = new Set<string>()
  const unmappedYahoo = new Set<string>()
  const ambiguousGeneric = new Set<string>()
  let rankingFiles = 0

  for (const dir of rankingDirs) {
    for (const file of listFiles(dir, ".json")) {
      rankingFiles++
      const data = readJson(file)
      if (!data) continue

      walkJson(data, (obj) => {
        // 明示的なNPB ID
        for (const key of npbIdKeys) {
          const id = asId(obj[key])
          if (id) npbIds.add(id)
        }

        // 明示的なYahoo IDは map できる場合だけNPBへ変換
        for (const key of yahooIdKeys) {
          const yahoo = asId(obj[key])
          if (!yahoo) continue

          const npb = yahooToNpb.get(yahoo)
          if (npb) {
            npbIds.add(npb)
          } else {
            unmappedYahoo.add(yahoo)
          }
        }

        // id/player_id は危険なので、profile_npbに同名IDがある場合だけNPB扱い
        // または yahooToNpb に存在する場合だけYahoo→NPB扱い
        if (hasName(obj)) {
          for (const key of genericIdKeys) {
            const id = asId(obj[key])
            if (!id) continue

            if (profileNpbIds.has(id)) {
              npbIds.add(id)
            } else {
              const npb = yahooToNpb.get(id)
              if (npb) {
                npbIds.add(npb)
              } else {
                ambiguousGeneric.add(id)
              }
            }
          }
        }
      })
    }
  }

  return { npbIds, unmappedYahoo, ambiguousGeneric, rankingFiles }
}

const profileNpbIds = collectProfileNpbIds()
const yahooToNpb = collectYahooToNpbMap()
const ranking = collectRankingNpbIds(yahooToNpb, profileNpbIds)

const rankingNpbIds = ranking.npbIds

const missingProfile = [...rankingNpbIds]
  .filter((id) => !profileNpbIds.has(id))
  .sort()

const profileOnly = [...profileNpbIds]
  .filter((id) => !rankingNpbIds.has(id))
  .sort()

console.log("[validate_profile_vs_ranking_pitching]")
console.log(`  profile npb ids: ${profileNpbIds.size}`)
console.log(`  yahoo->npb map: ${yahooToNpb.size}`)
console.log(`  ranking files: ${ranking.rankingFiles}`)
console.log(`  ranking npb ids resolved: ${rankingNpbIds.size}`)
console.log(`  ranking without profile: ${missingProfile.length}`)
console.log(`  profile only, safe: ${profileOnly.length}`)
console.log(`  unmapped explicit yahoo ids, warning: ${ranking.unmappedYahoo.size}`)
console.log(`  ignored ambiguous generic ids, warning: ${ranking.ambiguousGeneric.size}`)

if (profileOnly.length > 0) {
  console.log("")
  console.log("  note: profile only は正常扱いです。")
  console.log("  reason: プロフィール対象には投手ランキング外の選手も含まれます。")
  console.log("  sample profile-only npb ids:")
  for (const id of profileOnly.slice(0, 20)) {
    console.log(`    ${id}`)
  }
}

if (ranking.unmappedYahoo.size > 0) {
  console.log("")
  console.log("  warning: 明示的なYahoo IDだが NPB ID に変換できなかったものがあります。")
  for (const id of [...ranking.unmappedYahoo].slice(0, 30)) {
    console.log(`    ${id}`)
  }
}

if (ranking.ambiguousGeneric.size > 0) {
  console.log("")
  console.log("  warning: id/player_id は Yahoo/NPB 判定が曖昧なため、検証対象から除外しました。")
  console.log("  sample ignored generic ids:")
  for (const id of [...ranking.ambiguousGeneric].slice(0, 30)) {
    console.log(`    ${id}`)
  }
}

if (profileNpbIds.size === 0) {
  console.error("")
  console.error("[validate_profile_vs_ranking_pitching] ERROR: profile_npb が見つかりません。")
  console.error("  expected: _data/derived/player_profile/profile_npb/npb_*.json")
  process.exit(1)
}

if (rankingNpbIds.size === 0) {
  console.log("")
  console.log("[validate_profile_vs_ranking_pitching] SKIP:")
  console.log("  投手ランキングから確実なNPB IDを解決できなかったため、不一致判定は行いません。")
  console.log("  これはランキングJSONがYahoo ID中心で、Yahoo→NPB bridge が不足している場合に起きます。")
  process.exit(0)
}

if (missingProfile.length > 0) {
  console.error("")
  console.error("[validate_profile_vs_ranking_pitching] 不一致:")
  console.error("  投手ランキングに存在するNPB IDのプロフィールが見つかりません。")
  for (const id of missingProfile.slice(0, 80)) {
    console.error(`  missing profile for ranking NPB ID: ${id}`)
  }
  if (missingProfile.length > 80) {
    console.error(`  ... 他 ${missingProfile.length - 80} 件`)
  }
  process.exit(1)
}

console.log("[validate_profile_vs_ranking_pitching] OK")
