#!/usr/bin/env node
/**
 * 速報公開用: 2026 のうち、更新優先の表示データだけを R2 へアップロードする。
 *
 * 対象:
 * - ランキングページ（season / weekly を含む public/data/rankings 配下）
 * - TOPページの leaders スナップショット（public/data/top-leaders 配下）
 * - 順位表（public/data/standings 配下）
 * - 個人ページ「今季の成績」タブで使う最小派生
 *   - player_season_batting
 *   - player_season_batting_period
 *   - player_pitch_from_canonical
 *   - player_season_batting_count
 *   - player_batter_vs_team_count_pitch_types
 *   - player_season_pitching_poc
 *   - player_season_pitching_period
 *   - pitcher_season_pitch_types
 *
 * 用法:
 *   node scripts/display_publish_fast_2026.mjs --year 2026
 *   node scripts/display_publish_fast_2026.mjs --year 2026 --dry-run
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const DRY_RUN = process.argv.includes("--dry-run")
const CONCURRENCY = Math.max(1, Number(process.env.FAST_PUBLISH_CONCURRENCY || 8))
const UPLOAD_TIMEOUT_MS = Math.max(5000, Number(process.env.FAST_PUBLISH_UPLOAD_TIMEOUT_MS || 45000))
const RETRIES = Math.max(1, Number(process.env.FAST_PUBLISH_RETRIES || 3))
const yearArg =
  process.argv.find((a) => a.startsWith("--year="))?.split("=")[1] ??
  (process.argv.includes("--year") ? process.argv[process.argv.indexOf("--year") + 1] : null)
const YEAR = (yearArg?.trim() || "2026")

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false
  let text = fs.readFileSync(filePath, "utf8")
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
  return true
}

function walkJsonFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walkJsonFiles(p, acc)
    else if (ent.isFile() && ent.name.endsWith(".json")) acc.push(p)
  }
  return acc
}

function loadEnv() {
  loadDotEnvFile(path.join(ROOT, ".env.local"))
  loadDotEnvFile(path.join(ROOT, ".env"))

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim()
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim()
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Missing R2 credentials in .env.local / .env")
  }
  return { accountId, accessKeyId, secretAccessKey, bucket }
}

function collectFastFiles(year) {
  const files = []

  const rankingsRoot = path.join(ROOT, "public", "data", "rankings")
  for (const f of walkJsonFiles(rankingsRoot)) {
    const rel = path.relative(rankingsRoot, f).replace(/\\/g, "/")
    const match =
      rel.startsWith(`${year}/`) ||
      rel.startsWith(`pitching/${year}/`) ||
      rel.startsWith(`weekly/${year}/`)
    if (!match) continue
    files.push({ local: f, key: `data/rankings/${rel}` })
  }

  const standingsRoot = path.join(ROOT, "public", "data", "standings")
  for (const f of walkJsonFiles(standingsRoot)) {
    const rel = path.relative(standingsRoot, f).replace(/\\/g, "/")
    if (!rel.startsWith(`${year}/`)) continue
    files.push({ local: f, key: `data/standings/${rel}` })
  }

  const topLeadersRoot = path.join(ROOT, "public", "data", "top-leaders")
  for (const f of walkJsonFiles(topLeadersRoot)) {
    const rel = path.relative(topLeadersRoot, f).replace(/\\/g, "/")
    if (!(rel.startsWith(`${year}/`) || rel.startsWith(`weekly/${year}/`))) continue
    files.push({ local: f, key: `data/top-leaders/${rel}` })
  }

  const derivedCategories = [
    "player_season_batting",
    "player_season_batting_period",
    "player_pitch_from_canonical",
    "player_season_batting_count",
    "player_batter_vs_team_count_pitch_types",
    "player_season_pitching_poc",
    "player_season_pitching_period",
    "pitcher_season_pitch_types",
  ]
  for (const category of derivedCategories) {
    const categoryRoot = path.join(ROOT, "_data", "derived", category, year)
    for (const f of walkJsonFiles(categoryRoot)) {
      const rel = path.relative(categoryRoot, f).replace(/\\/g, "/")
      files.push({ local: f, key: `data/derived/${category}/${year}/${rel}` })
    }
  }

  return files
}

async function sendWithTimeout(client, command, timeoutMs) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    return await client.send(command, { abortSignal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function uploadWithRetry(client, bucket, file) {
  let lastError = null
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const body = fs.readFileSync(file.local)
      await sendWithTimeout(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: file.key,
          Body: body,
          ContentType: "application/json",
        }),
        UPLOAD_TIMEOUT_MS,
      )
      return
    } catch (e) {
      lastError = e
      const msg = e?.name === "AbortError" ? `timeout ${UPLOAD_TIMEOUT_MS}ms` : e?.message || String(e)
      console.warn(`  retry ${attempt}/${RETRIES}: ${file.key}: ${msg}`)
      if (attempt < RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
      }
    }
  }
  throw new Error(`Failed to upload ${file.key}: ${lastError?.message || lastError}`)
}

async function uploadAll(client, bucket, files) {
  let nextIndex = 0
  let ok = 0
  async function worker(workerId) {
    while (nextIndex < files.length) {
      const index = nextIndex
      nextIndex += 1
      const file = files[index]
      await uploadWithRetry(client, bucket, file)
      ok += 1
      if (ok % 50 === 0 || ok === files.length) {
        console.log(`  uploaded ${ok}/${files.length}...`)
      }
    }
  }

  const workerCount = Math.min(CONCURRENCY, files.length)
  console.log(`Uploading: concurrency=${workerCount}, timeout=${UPLOAD_TIMEOUT_MS}ms, retries=${RETRIES}`)
  await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i + 1)))
  return ok
}

async function main() {
  console.log(`=== Fast publish ${DRY_RUN ? "(dry-run) " : ""}year=${YEAR} ===`)

  const files = collectFastFiles(YEAR)
  console.log(`JSON files: ${files.length}`)
  if (files.length === 0) {
    throw new Error(`No fast-publish files found for year=${YEAR}`)
  }

  if (DRY_RUN) {
    for (const f of files.slice(0, 12)) console.log(`  would put: ${f.key}`)
    if (files.length > 12) console.log(`  ... and ${files.length - 12} more`)
    return
  }

  const { accountId, accessKeyId, secretAccessKey, bucket } = loadEnv()
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  })

  await sendWithTimeout(client, new HeadBucketCommand({ Bucket: bucket }), UPLOAD_TIMEOUT_MS)
  console.log(`Bucket OK: ${bucket}`)

  const ok = await uploadAll(client, bucket, files)

  console.log(`Done: ${ok} uploaded`)
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
