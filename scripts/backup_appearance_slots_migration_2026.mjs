/**
 * Phase 2（appearance_slots 計画）: hybrid 時代の Phase11 + PL 打撃ランキング JSON を退避。
 *
 *   npm run appearance-slots:phase2:backup
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const stamp = new Date().toISOString().replace(/[:.]/g, "-")

const jobs = [
  {
    label: "player_season_batting/2026",
    src: path.join(root, "_data", "derived", "player_season_batting", "2026"),
    dst: path.join(root, "_data", "derived", "_backup_before_appearance_slots_2026", "player_season_batting"),
  },
  {
    label: "rankings/2026/PL",
    src: path.join(root, "public", "data", "rankings", "2026", "PL"),
    dst: path.join(root, "_data", "derived", "_backup_before_appearance_slots_2026", "rankings_pl"),
  },
]

function copyDirFiles(src, dst) {
  if (!fs.existsSync(src)) {
    console.warn(`[backup] skip (missing): ${src}`)
    return 0
  }
  if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true })
  fs.mkdirSync(dst, { recursive: true })
  const names = fs.readdirSync(src).filter((n) => {
    const p = path.join(src, n)
    return fs.statSync(p).isFile()
  })
  for (const name of names) {
    fs.copyFileSync(path.join(src, name), path.join(dst, name))
  }
  return names.length
}

function main() {
  console.log(`[appearance-slots:phase2:backup] startedAt=${stamp}`)
  let total = 0
  for (const job of jobs) {
    const n = copyDirFiles(job.src, job.dst)
    total += n
    console.log(`[backup] ${job.label}: ${n} files → ${path.relative(root, job.dst)}`)
  }
  const meta = {
    schemaVersion: "appearance-slots-backup-stamp-v1",
    backedUpAt: new Date().toISOString(),
    fileCount: total,
    jobs: jobs.map((j) => ({ label: j.label, dst: path.relative(root, j.dst) })),
  }
  const metaDir = path.join(root, "_data", "derived", "_backup_before_appearance_slots_2026")
  fs.mkdirSync(metaDir, { recursive: true })
  fs.writeFileSync(path.join(metaDir, "BACKUP_STAMP.json"), JSON.stringify(meta, null, 2), "utf8")
  console.log(`[appearance-slots:phase2:backup] done (${total} files)`)
}

try {
  main()
} catch (e) {
  console.error("[appearance-slots:phase2:backup] failed:", e)
  process.exit(1)
}
