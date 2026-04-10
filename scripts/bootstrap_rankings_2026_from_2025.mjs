/**
 * Phase 7: public/data/rankings/2026/{CL,PL} を 2025 からコピー（暫定ブートストラップ）
 * 本番の計算済み JSON が揃ったら差し替え・再実行で上書きする。
 */
import { cpSync, existsSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const srcBase = join(root, "public", "data", "rankings", "2025")
const dstBase = join(root, "public", "data", "rankings", "2026")

for (const league of ["CL", "PL"]) {
  const src = join(srcBase, league)
  const dst = join(dstBase, league)
  if (!existsSync(src)) {
    console.error("[bootstrap_rankings_2026] missing:", src)
    process.exit(1)
  }
  mkdirSync(dst, { recursive: true })
  cpSync(src, dst, { recursive: true })
  console.log("[bootstrap_rankings_2026] copied", league)
}
console.log("[bootstrap_rankings_2026] done ->", dstBase)
