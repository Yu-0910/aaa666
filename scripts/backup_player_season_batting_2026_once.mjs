/**
 * Phase 11 退避: player_season_batting/2026 を丸ごとコピーする（上書き前のバックアップ）。
 * OneDrive 等で `fs.cpSync` が不安定な場合に備え、1 ファイルずつコピーする。
 *
 *   npm run backup:player-season-batting:2026
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const src = path.join(root, "_data", "derived", "player_season_batting", "2026")
const dst = path.join(root, "_data", "derived", "_backup_player_season_batting_2026_before_smoke")

function log(msg) {
  console.log(msg)
}

function main() {
  log("[backup] 開始")
  log(`[backup] 元: ${src}`)
  log(`[backup] 先: ${dst}`)

  if (!fs.existsSync(src)) {
    console.error("[backup] エラー: 元フォルダがありません（phase11 を一度実行済みか確認）")
    process.exit(1)
  }

  if (fs.existsSync(dst)) {
    log("[backup] 既存の退避先を削除します")
    fs.rmSync(dst, { recursive: true, force: true })
  }
  fs.mkdirSync(dst, { recursive: true })

  const entries = fs.readdirSync(src, { withFileTypes: true })
  const files = entries.filter((e) => e.isFile()).map((e) => e.name)
  log(`[backup] コピー対象: ${files.length} ファイル`)

  let done = 0
  for (const name of files) {
    fs.copyFileSync(path.join(src, name), path.join(dst, name))
    done++
    if (done % 80 === 0 || done === files.length) {
      log(`[backup] … ${done}/${files.length}`)
    }
  }

  const verify = fs.readdirSync(dst).length
  log(`[backup] 完了: ${verify} ファイル（相対: ${path.relative(root, dst).replace(/\\/g, "/")}）`)
}

try {
  main()
} catch (e) {
  console.error("[backup] 失敗:", e)
  process.exit(1)
}
