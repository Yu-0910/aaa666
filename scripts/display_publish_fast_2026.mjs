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
 *   - player_season_batting_count
 *   - player_season_pitching_poc
 *
 * 用法:
 *   node scripts/display_publish_fast_2026.mjs --year 2026
 *   node scripts/display_publish_fast_2026.mjs --year 2026 --player-ids 1000035,91095136
 *   node scripts/display_publish_fast_2026.mjs --year 2026 --from 2026-08-07 --to 2026-08-07
 *   node scripts/display_publish_fast_2026.mjs --year 2026 --dry-run
 */

import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import { HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const DRY_RUN = process.argv.includes("--dry-run")
const FORCE_UPLOAD = process.argv.includes("--force-upload")
const CONCURRENCY = Math.max(1, Number(process.env.FAST_PUBLISH_CONCURRENCY || 8))
const UPLOAD_TIMEOUT_MS = Math.max(5000, Number(process.env.FAST_PUBLISH_UPLOAD_TIMEOUT_MS || 45000))
const RETRIES = Math.max(1, Number(process.env.FAST_PUBLISH_RETRIES || 3))
const yearArg =
  process.argv.find((a) => a.startsWith("--year="))?.split("=")[1] ??
  (process.argv.includes("--year") ? process.argv[process.argv.indexOf("--year") + 1] : null)
const YEAR = (yearArg?.trim() || "2026")
const playerIdsArg =
  process.argv.find((a) => a.startsWith("--player-ids="))?.split("=")[1] ??
  (process.argv.includes("--player-ids") ? process.argv[process.argv.indexOf("--player-ids") + 1] : null)
const PLAYER_IDS = playerIdsArg
  ? playerIdsArg.split(",").map((s) => s.trim()).filter(Boolean)
  : null
const fromArg =
  process.argv.find((a) => a.startsWith("--from="))?.split("=")[1] ??
  (process.argv.includes("--from") ? process.argv[process.argv.indexOf("--from") + 1] : null)
const toArg =
  process.argv.find((a) => a.startsWith("--to="))?.split("=")[1] ??
  (process.argv.includes("--to") ? process.argv[process.argv.indexOf("--to") + 1] : null)
const WEEK_KEYS = weekKeysForRange(fromArg?.trim(), toArg?.trim())

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

function matchesPlayerFilter(rel, ids) {
  if (!ids?.length) return true
  const base = path.basename(rel, ".json")
  return ids.some((id) => {
    if (base === id || base === `yahoo_${id}` || base === `npb_${id}`) return true
    return base.endsWith(`_${id}`)
  })
}

function ymdToUtcDate(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 3, 0, 0))
}

function formatYmdUtc(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
}

function addDaysYmd(ymd, days) {
  const date = ymdToUtcDate(ymd)
  if (!date) return ""
  date.setUTCDate(date.getUTCDate() + days)
  return formatYmdUtc(date)
}

function tuesdayWeekKeyFromYmd(ymd) {
  const date = ymdToUtcDate(ymd)
  if (!date) return ""
  const day = date.getUTCDay()
  const diff = day >= 2 ? day - 2 : day + 5
  date.setUTCDate(date.getUTCDate() - diff)
  return formatYmdUtc(date)
}

function weekKeysForRange(from, to) {
  if (!from && !to) return null
  const start = from || to
  const end = to || from
  if (!start || !end) return null
  const keys = new Set()
  let cur = start
  for (let guard = 0; guard < 370 && cur <= end; guard += 1) {
    const wk = tuesdayWeekKeyFromYmd(cur)
    if (wk) keys.add(wk)
    cur = addDaysYmd(cur, 1)
    if (!cur) break
  }
  return keys.size > 0 ? keys : null
}

function matchesWeeklyScope(rel, weekKeys) {
  if (!weekKeys) return true
  const normalized = rel.replace(/\\/g, "/")
  if (normalized === `weekly/${YEAR}/current-week.json`) return true
  const batting = normalized.match(new RegExp(`^weekly/${YEAR}/([^/]+)/`))
  if (batting) return weekKeys.has(batting[1])
  const pitching = normalized.match(new RegExp(`^pitching/weekly/${YEAR}/([^/]+)/`))
  if (pitching) return weekKeys.has(pitching[1])
  return true
}

function matchesTopLeadersWeeklyScope(rel, weekKeys) {
  if (!weekKeys) return true
  const normalized = rel.replace(/\\/g, "/")
  const weekly = normalized.match(new RegExp(`^weekly/${YEAR}/([^/]+)/`))
  if (weekly) return weekKeys.has(weekly[1])
  return true
}

function contentHashes(body) {
  return {
    md5: crypto.createHash("md5").update(body).digest("hex"),
    sha256: crypto.createHash("sha256").update(body).digest("hex"),
  }
}

function normalizeEtag(etag) {
  return String(etag ?? "").replace(/^"|"$/g, "").toLowerCase()
}

async function shouldUploadObject(client, bucket, key, hashes) {
  if (FORCE_UPLOAD) return true
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    const remoteSha256 =
      head.Metadata?.sha256 || head.Metadata?.["content-sha256"] || head.Metadata?.["x-amz-meta-sha256"]
    if (remoteSha256 && String(remoteSha256).toLowerCase() === hashes.sha256) return false
    const etag = normalizeEtag(head.ETag)
    if (etag && !etag.includes("-") && etag === hashes.md5) return false
    return true
  } catch (e) {
    const status = e?.$metadata?.httpStatusCode
    const name = e?.name || e?.Code
    if (status === 404 || name === "NotFound" || name === "NoSuchKey") return true
    throw e
  }
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
      rel.startsWith(`pitching/weekly/${year}/`) ||
      rel.startsWith(`weekly/${year}/`)
    if (!match) continue
    if (!matchesWeeklyScope(rel, WEEK_KEYS)) continue
    files.push({ local: f, key: `data/rankings/${rel}` })
  }

  const standingsRoot = path.join(ROOT, "public", "data", "standings")
  for (const f of walkJsonFiles(standingsRoot)) {
    const rel = path.relative(standingsRoot, f).replace(/\\/g, "/")
    const match =
      rel.startsWith(`${year}/`) || rel.startsWith(`weekly/${year}/`)
    if (!match) continue
    files.push({ local: f, key: `data/standings/${rel}` })
  }

  const topLeadersRoot = path.join(ROOT, "public", "data", "top-leaders")
  for (const f of walkJsonFiles(topLeadersRoot)) {
    const rel = path.relative(topLeadersRoot, f).replace(/\\/g, "/")
    if (!(rel.startsWith(`${year}/`) || rel.startsWith(`weekly/${year}/`))) continue
    if (!matchesTopLeadersWeeklyScope(rel, WEEK_KEYS)) continue
    files.push({ local: f, key: `data/top-leaders/${rel}` })
  }

  const derivedCategories = [
    "player_season_batting",
    "player_season_batting_period",
    "player_season_batting_count",
    "player_season_pitching_poc",
  ]
  for (const category of derivedCategories) {
    const categoryRoot = path.join(ROOT, "_data", "derived", category, year)
    for (const f of walkJsonFiles(categoryRoot)) {
      const rel = path.relative(categoryRoot, f).replace(/\\/g, "/")
      if (PLAYER_IDS && !matchesPlayerFilter(rel, PLAYER_IDS)) continue
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
      const hashes = contentHashes(body)
      if (!(await shouldUploadObject(client, bucket, file.key, hashes))) {
        return "skipped"
      }
      await sendWithTimeout(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: file.key,
          Body: body,
          ContentType: "application/json",
          Metadata: { sha256: hashes.sha256 },
        }),
        UPLOAD_TIMEOUT_MS,
      )
      return "uploaded"
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
  let uploaded = 0
  let skipped = 0
  let processed = 0
  async function worker(workerId) {
    while (nextIndex < files.length) {
      const index = nextIndex
      nextIndex += 1
      const file = files[index]
      const result = await uploadWithRetry(client, bucket, file)
      if (result === "skipped") skipped += 1
      else uploaded += 1
      processed += 1
      if (processed % 50 === 0 || processed === files.length) {
        console.log(`  checked ${processed}/${files.length} (uploaded=${uploaded}, skipped=${skipped})...`)
      }
    }
  }

  const workerCount = Math.min(CONCURRENCY, files.length)
  console.log(`Uploading: concurrency=${workerCount}, timeout=${UPLOAD_TIMEOUT_MS}ms, retries=${RETRIES}`)
  await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i + 1)))
  return { uploaded, skipped, processed }
}

async function main() {
  console.log(`=== Fast publish ${DRY_RUN ? "(dry-run) " : ""}year=${YEAR} ===`)

  const files = collectFastFiles(YEAR)
  if (PLAYER_IDS?.length) console.log(`Filter: player-ids=${PLAYER_IDS.join(",")} (derived only)`)
  if (WEEK_KEYS?.size) console.log(`Filter: weekly weekKeys=${[...WEEK_KEYS].join(",")}`)
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

  const { uploaded, skipped, processed } = await uploadAll(client, bucket, files)

  console.log(`Done: checked=${processed} uploaded=${uploaded} skipped=${skipped}`)
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
