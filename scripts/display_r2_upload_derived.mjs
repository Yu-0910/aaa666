#!/usr/bin/env node
/**
 * 個人ページ用派生 JSON（_data/derived/*）を R2 へアップロード
 *
 * R2 キー例:
 *   _data/derived/player_season_batting/2026/yahoo_2000051.json
 *   → data/derived/player_season_batting/2026/yahoo_2000051.json
 *
 * 必要な環境変数（.env.local）:
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID,
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME
 *
 * 用法:
 *   npm run display:r2:upload:derived:2026
 *   npm run display:r2:upload:derived
 *   npm run display:r2:upload:derived:dry
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DRY_RUN = process.argv.includes('--dry-run')
const yearArg = process.argv.find((a) => a.startsWith('--year='))?.split('=')[1]
  ?? (process.argv.includes('--year') ? process.argv[process.argv.indexOf('--year') + 1] : null)
const YEAR_FILTER = yearArg?.trim() || null

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false
  let text = fs.readFileSync(filePath, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
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

const ENV_LOCAL = path.join(ROOT, '.env.local')
const ENV_FILE = path.join(ROOT, '.env')
const loadedLocal = loadDotEnvFile(ENV_LOCAL)
const loadedEnv = loadDotEnvFile(ENV_FILE)

/** 個人ページ API が参照する派生カテゴリ（_backup* は除外） */
const DERIVED_CATEGORIES = [
  'player_season_batting',
  'player_season_batting_context',
  'player_season_batting_splits',
  'player_season_batting_count',
  'player_season_batting_period',
  'player_season_batting_vs_hand',
  'player_season_pitching_poc',
  'player_season_pitching_period',
  'player_pitch_from_canonical',
  'pitcher_zone_from_canonical',
  'player_catcher_appearances',
  'player_catcher_defense_basic',
  'player_catcher_pitcher_splits',
  'player_catcher_starting_summary',
  'player_catcher_pa_round_pitch_types',
]

const UPLOADS = DERIVED_CATEGORIES.map((cat) => ({
  local: `_data/derived/${cat}`,
  keyPrefix: `data/derived/${cat}`,
}))

function shouldSkipDirName(name) {
  return name.startsWith('_') || name.startsWith('.')
}

function walkJsonFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (shouldSkipDirName(ent.name)) continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walkJsonFiles(p, acc)
    else if (ent.isFile() && ent.name.endsWith('.json')) acc.push(p)
  }
  return acc
}

function matchesYearFilter(rel, year) {
  return rel === year || rel.startsWith(`${year}/`) || rel.includes(`/${year}/`)
}

function loadEnv() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim()
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim()
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.error('Missing R2 credentials.\n')
    console.error(`  .env.local: ${loadedLocal ? 'found' : 'NOT FOUND'} → ${ENV_LOCAL}`)
    if (loadedEnv) console.error(`  .env: found → ${ENV_FILE}`)
    const missing = []
    if (!accountId) missing.push('CLOUDFLARE_ACCOUNT_ID')
    if (!accessKeyId) missing.push('CLOUDFLARE_R2_ACCESS_KEY_ID')
    if (!secretAccessKey) missing.push('CLOUDFLARE_R2_SECRET_ACCESS_KEY')
    if (!bucket) missing.push('CLOUDFLARE_R2_BUCKET_NAME')
    console.error(`  Missing keys: ${missing.join(', ')}`)
    console.error('\n  See docs/phase5_r2_upload_setup.md')
    process.exit(1)
  }
  return { accountId, accessKeyId, secretAccessKey, bucket }
}

async function main() {
  console.log(`=== Derived R2 upload ${DRY_RUN ? '(dry-run)' : ''} ===\n`)

  const files = []
  for (const u of UPLOADS) {
    const abs = path.join(ROOT, u.local)
    if (!fs.existsSync(abs)) {
      console.warn(`Skip missing: ${u.local}`)
      continue
    }
    for (const f of walkJsonFiles(abs)) {
      const rel = path.relative(abs, f).replace(/\\/g, '/')
      if (YEAR_FILTER && !matchesYearFilter(rel, YEAR_FILTER)) continue
      files.push({ local: f, key: `${u.keyPrefix}/${rel}` })
    }
  }

  if (YEAR_FILTER) console.log(`Filter: year=${YEAR_FILTER}`)
  console.log(`JSON files: ${files.length}`)
  if (files.length === 0) {
    console.error('Nothing to upload. Check _data/derived/ and --year filter.')
    process.exit(1)
  }

  if (DRY_RUN) {
    for (const f of files.slice(0, 8)) console.log(`  would put: ${f.key}`)
    if (files.length > 8) console.log(`  ... and ${files.length - 8} more`)
    return
  }

  const { accountId, accessKeyId, secretAccessKey, bucket } = loadEnv()
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    console.log(`Bucket OK: ${bucket}\n`)
  } catch (e) {
    console.error(`Bucket check failed (${bucket}):`, e.message || e)
    process.exit(1)
  }

  let ok = 0
  let fail = 0
  for (const f of files) {
    try {
      const body = fs.readFileSync(f.local)
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: f.key,
          Body: body,
          ContentType: 'application/json',
        })
      )
      ok++
      if (ok % 200 === 0) console.log(`  uploaded ${ok}/${files.length}...`)
    } catch (e) {
      fail++
      if (fail <= 3) console.error(`  FAIL ${f.key}:`, e.message || e)
      else if (fail === 4) console.error('  ... (further errors omitted)')
    }
  }

  console.log(`\nDone: ${ok} ok, ${fail} failed`)
  if (fail > 0) process.exit(1)
  console.log('\nVerify:')
  console.log('  https://pub-41ff9f32fcf748529b7036f73f9e04e5.r2.dev/data/derived/player_season_batting/2026/yahoo_2000051.json')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
