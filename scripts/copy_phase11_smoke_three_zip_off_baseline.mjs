/**
 * スモーク用: Phase 11 の 3 打者 JSON を「旧（zip オフ）」ベースラインとしてコピーする。
 *   npm run smoke:phase11:copy-zip-off-baseline
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const srcDir = path.join(root, "_data", "derived", "player_season_batting", "2026")
const dstDir = path.join(root, "_data", "derived", "_smoke_phase11_zip_off_three_baseline")

const IDS = ["1000150", "1100082", "1900041"]

function main() {
  console.log("[smoke:baseline] 旧（zip オフ）3 ファイルをコピーします")
  console.log("[smoke:baseline] 先:", dstDir)

  if (!fs.existsSync(srcDir)) {
    console.error("[smoke:baseline] 元がありません:", srcDir)
    process.exit(1)
  }

  if (fs.existsSync(dstDir)) {
    fs.rmSync(dstDir, { recursive: true, force: true })
  }
  fs.mkdirSync(dstDir, { recursive: true })

  for (const id of IDS) {
    const name = `yahoo_${id}.json`
    const from = path.join(srcDir, name)
    const to = path.join(dstDir, name)
    if (!fs.existsSync(from)) {
      console.error("[smoke:baseline] 見つかりません（先に zip-off で phase11 を実行）:", from)
      process.exit(1)
    }
    fs.copyFileSync(from, to)
    console.log("[smoke:baseline] OK", name)
  }

  console.log("[smoke:baseline] 完了:", path.relative(root, dstDir).replace(/\\/g, "/"))
}

try {
  main()
} catch (e) {
  console.error("[smoke:baseline] 失敗:", e)
  process.exit(1)
}
