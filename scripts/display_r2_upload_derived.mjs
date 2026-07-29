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
 *   node scripts/display_r2_upload_derived.mjs --year 2026 --player-ids 03105157,1750223,11515133,1000138
 *   node scripts/display_r2_upload_derived.mjs --only npb_player_meta
 *   node scripts/display_r2_upload_derived.mjs --only npb_player_meta --player-ids 91193848
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DRY_RUN = process.argv.includes('--dry-run')
const FORCE_UPLOAD = process.argv.includes('--force-upload')
const yearArg = process.argv.find((a) => a.startsWith('--year='))?.split('=')[1]
  ?? (process.argv.includes('--year') ? process.argv[process.argv.indexOf('--year') + 1] : null)
const YEAR_FILTER = yearArg?.trim() || null
const playerIdsArg =
  process.argv.find((a) => a.startsWith('--player-ids='))?.split('=')[1]
  ?? (process.argv.includes('--player-ids')
    ? process.argv[process.argv.indexOf('--player-ids') + 1]
    : null)
const PLAYER_IDS = playerIdsArg
  ? playerIdsArg.split(',').map((s) => s.trim()).filter(Boolean)
  : null
const onlyArg =
  process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]
  ?? (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null)
const ONLY_CATEGORY = onlyArg?.trim() || null
const excludeArg =
  process.argv.find((a) => a.startsWith('--exclude='))?.split('=')[1]
  ?? (process.argv.includes('--exclude') ? process.argv[process.argv.indexOf('--exclude') + 1] : null)
const EXCLUDE_CATEGORIES = new Set(
  excludeArg ? excludeArg.split(',').map((s) => s.trim()).filter(Boolean) : [],
)
const CONCURRENCY = Math.max(1, Number(process.env.DERIVED_R2_UPLOAD_CONCURRENCY || 8))

function contentHashes(body) {
  return {
    md5: crypto.createHash('md5').update(body).digest('hex'),
    sha256: crypto.createHash('sha256').update(body).digest('hex'),
  }
}

function normalizeEtag(etag) {
  return String(etag ?? '').replace(/^"|"$/g, '').toLowerCase()
}

async function shouldUploadObject(client, bucket, key, hashes) {
  if (FORCE_UPLOAD) return true
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    const remoteSha256 =
      head.Metadata?.sha256 || head.Metadata?.['content-sha256'] || head.Metadata?.['x-amz-meta-sha256']
    if (remoteSha256 && String(remoteSha256).toLowerCase() === hashes.sha256) return false
    const etag = normalizeEtag(head.ETag)
    if (etag && !etag.includes('-') && etag === hashes.md5) return false
    return true
  } catch (e) {
    const status = e?.$metadata?.httpStatusCode
    const name = e?.name || e?.Code
    if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') return true
    throw e
  }
}

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
const DERIVED_CATEGORIES_BASE = [
  'player_season_batting',
  'player_season_batting_context',
  'player_season_batting_splits',
  'player_season_batting_count',
  'player_season_batting_period',
  'player_season_batting_vs_hand',
  'player_season_pitching_poc',
  'player_season_pitching_period',
  'pitcher_nf3_metrics',
  'player_pitch_from_canonical',
  'pitcher_zone_from_canonical',
  'player_catcher_appearances',
  'player_catcher_defense_basic',
  'player_catcher_pitcher_splits',
  'player_catcher_starting_summary',
  'player_catcher_pa_round_pitch_types',
  'pitcher_season_pitch_types',
  'player_matchup_batting',
  'player_matchup_pitching',
  'player_batter_vs_team_count_pitch_types',
  'player_fa_estimates',
  /** 通算タブ: profile-merged API（fetchDerivedJsonServer） */
  'player_profile',
]

/** 名簿外フルローマ名（profile-merged API）。--only で明示時のみアップロード */
const NPB_PLAYER_META_CATEGORY = 'npb_player_meta'

const DERIVED_CATEGORIES_ALL = [...DERIVED_CATEGORIES_BASE, NPB_PLAYER_META_CATEGORY]

function resolveDerivedCategories() {
  if (!ONLY_CATEGORY) return DERIVED_CATEGORIES_BASE
  if (!DERIVED_CATEGORIES_ALL.includes(ONLY_CATEGORY)) {
    console.error(`Unknown --only category: ${ONLY_CATEGORY}`)
    console.error(`  allowed: ${DERIVED_CATEGORIES_ALL.join(', ')}`)
    process.exit(1)
  }
  return [ONLY_CATEGORY]
}

const DERIVED_CATEGORIES = resolveDerivedCategories().filter((cat) => !EXCLUDE_CATEGORIES.has(cat))

const META_UPLOADS = [{ local: '_data/scraped_games/derived/yahoo_to_npb_full.json', key: 'data/derived/meta/yahoo_to_npb_full.json' }]

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

function matchesPlayerFilter(rel, ids) {
  if (!ids?.length) return true
  const base = path.basename(rel, '.json')
  return ids.some((id) => {
    if (base === id || base === `yahoo_${id}` || base === `npb_${id}`) return true
    return base.endsWith(`_${id}`)
  })
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
    const skipYearFilter =
      u.keyPrefix.endsWith('/player_profile') || u.keyPrefix.endsWith(`/${NPB_PLAYER_META_CATEGORY}`)
    for (const f of walkJsonFiles(abs)) {
      const rel = path.relative(abs, f).replace(/\\/g, '/')
      if (YEAR_FILTER && !skipYearFilter && !matchesYearFilter(rel, YEAR_FILTER)) continue
      if (PLAYER_IDS && !matchesPlayerFilter(rel, PLAYER_IDS)) continue
      files.push({ local: f, key: `${u.keyPrefix}/${rel}` })
    }
  }
  for (const m of META_UPLOADS) {
    if (ONLY_CATEGORY) continue
    const abs = path.join(ROOT, m.local)
    if (!fs.existsSync(abs)) {
      console.warn(`Skip missing meta: ${m.local}`)
      continue
    }
    files.push({ local: abs, key: m.key })
  }
  if (YEAR_FILTER && !PLAYER_IDS?.length && !ONLY_CATEGORY) {
    const faLocal = path.join(ROOT, `_data/derived/player_fa_estimates/${YEAR_FILTER}/npb_fa_estimates.json`)
    if (fs.existsSync(faLocal)) {
      files.push({
        local: faLocal,
        key: `data/derived/player_fa_estimates/${YEAR_FILTER}/npb_fa_estimates.json`,
      })
    }
  }
  if (PLAYER_IDS?.length && !ONLY_CATEGORY) {
    const faYear = YEAR_FILTER || '2026'
    const faLocal = path.join(ROOT, `_data/derived/player_fa_estimates/${faYear}/npb_fa_estimates.json`)
    if (fs.existsSync(faLocal)) {
      files.push({
        local: faLocal,
        key: `data/derived/player_fa_estimates/${faYear}/npb_fa_estimates.json`,
      })
    }
  }

  if (ONLY_CATEGORY) console.log(`Filter: only=${ONLY_CATEGORY}`)
  if (EXCLUDE_CATEGORIES.size > 0) console.log(`Filter: exclude=${[...EXCLUDE_CATEGORIES].join(',')}`)
  if (YEAR_FILTER) console.log(`Filter: year=${YEAR_FILTER}`)
  if (PLAYER_IDS?.length) console.log(`Filter: player-ids=${PLAYER_IDS.join(',')}`)
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

  let nextIndex = 0
  let uploaded = 0
  let skipped = 0
  let fail = 0
  let processed = 0
  async function worker() {
    while (nextIndex < files.length) {
      const index = nextIndex
      nextIndex += 1
      const f = files[index]
      try {
        const body = fs.readFileSync(f.local)
        const hashes = contentHashes(body)
        if (await shouldUploadObject(client, bucket, f.key, hashes)) {
          await client.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: f.key,
              Body: body,
              ContentType: 'application/json',
              Metadata: { sha256: hashes.sha256 },
            })
          )
          uploaded++
        } else {
          skipped++
        }
        processed++
        if (processed % 200 === 0 || processed === files.length) {
          console.log(`  checked ${processed}/${files.length} (uploaded=${uploaded}, skipped=${skipped})...`)
        }
      } catch (e) {
        fail++
        if (fail <= 3) console.error(`  FAIL ${f.key}:`, e.message || e)
        else if (fail === 4) console.error('  ... (further errors omitted)')
      }
    }
  }

  const workerCount = Math.min(CONCURRENCY, files.length)
  console.log(`Uploading changed files only: concurrency=${workerCount}${FORCE_UPLOAD ? ' force-upload' : ''}`)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  console.log(`\nDone: ${uploaded} uploaded, ${skipped} skipped, ${fail} failed`)
  if (fail > 0) process.exit(1)
  console.log('\nVerify:')
  if (ONLY_CATEGORY === NPB_PLAYER_META_CATEGORY) {
    const sample = PLAYER_IDS?.[0] || '91193848'
    console.log(`  https://pub-41ff9f32fcf748529b7036f73f9e04e5.r2.dev/data/derived/npb_player_meta/${sample}.json`)
  } else {
    console.log('  https://pub-41ff9f32fcf748529b7036f73f9e04e5.r2.dev/data/derived/player_season_batting/2026/yahoo_2000051.json')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
