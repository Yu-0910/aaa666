/**
 * 投手ランキング JSON の再発防止チェック。
 * Yahoo 数値 playerId の行は、UI の帯色・英字表示のため team と romanName が必須。
 */

import { existsSync, readdirSync, readFileSync } from "fs"
import { join } from "path"

function isYahooNumericId(v: unknown): v is string {
  return typeof v === "string" && /^\d+$/.test(v.trim())
}

/**
 * @returns 人間可読なエラー行（空なら OK）
 */
export function verifyPitchingRankingJsonFiles(projectRoot: string, year: string): string[] {
  const errors: string[] = []
  const base = join(projectRoot, "public", "data", "rankings", "pitching", year)

  for (const lg of ["CL", "PL"] as const) {
    const leagueDir = join(base, lg)
    if (!existsSync(leagueDir)) {
      errors.push(`[pitching ${lg}] ディレクトリがありません: ${leagueDir}`)
      continue
    }
    const files = readdirSync(leagueDir).filter(
      (f) => f.endsWith(".json") && !f.endsWith("_all.json"),
    )
    const badByPlayer = new Map<
      string,
      { player: string; missing: string[]; sampleFile: string }
    >()

    for (const f of files) {
      const p = join(leagueDir, f)
      let rows: unknown
      try {
        rows = JSON.parse(readFileSync(p, "utf8"))
      } catch {
        errors.push(`[pitching ${lg}] JSON 読み込み失敗: ${f}`)
        continue
      }
      if (!Array.isArray(rows)) {
        errors.push(`[pitching ${lg}] 配列ではない: ${f}`)
        continue
      }
      for (const row of rows) {
        if (!row || typeof row !== "object") continue
        const r = row as Record<string, unknown>
        const pid = r.playerId
        if (!isYahooNumericId(pid)) continue
        const team = String(r.team ?? "").trim()
        const roman = String(r.romanName ?? "").trim()
        const name = String(r.name ?? r.player ?? "").trim()
        const miss: string[] = []
        if (!team) miss.push("team")
        if (!roman) miss.push("romanName")
        if (miss.length === 0) continue
        const cur = badByPlayer.get(pid)
        if (!cur) {
          badByPlayer.set(pid, {
            player: name || pid,
            missing: [...miss],
            sampleFile: f,
          })
        } else {
          cur.missing = [...new Set([...cur.missing, ...miss])]
        }
      }
    }

    for (const [pid, info] of badByPlayer) {
      errors.push(
        `[pitching ${lg}] playerId=${pid} (${info.player}) 欠損: ${info.missing.join(", ")} （例: ${info.sampleFile}）`,
      )
    }
  }

  return errors
}

export function assertPitchingRankingRosterComplete(projectRoot: string, year: string): void {
  const errs = verifyPitchingRankingJsonFiles(projectRoot, year)
  if (errs.length === 0) return
  console.error("[verify pitching rankings] team / romanName が空の Yahoo ID 行があります。")
  for (const e of errs) console.error(" ", e)
  console.error(
    "  対処: _data/.../batting_master_bridge.csv に yahoo↔npb を追加するか、lib/yahooNpbBatterIdMap.manual.ts に手動マップを追加。名簿の「Ｘ．苗字」と canonical 名がずれる場合は lib/npbRoster.ts の別名キーを確認。",
  )
  process.exit(1)
}
