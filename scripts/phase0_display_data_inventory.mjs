#!/usr/bin/env node
/**
 * 表示用データ R2 一本化 — Phase 1 棚卸し（計画書の実行順）
 * ローカル public/data の存在確認・件数・代表パス・R2 キー対応表を出力する。
 *
 * 用法: node scripts/phase0_display_data_inventory.mjs
 * 任意: node scripts/phase0_display_data_inventory.mjs --json > output/phase0_inventory.json
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const PUBLIC_DATA = path.join(ROOT, "public", "data")

/** Phase 1 代表チェック（計画書と同一） */
const REPRESENTATIVE_CHECKS = [
  {
    id: "2026_batting_ops",
    label: "2026 打撃 OPS (CL)",
    sitePath: "/data/rankings/2026/CL/OPS.json",
    localPath: "public/data/rankings/2026/CL/OPS.json",
    r2Key: "data/rankings/2026/CL/OPS.json",
  },
  {
    id: "2026_pitching_era",
    label: "2026 投手 防御率 (CL)",
    sitePath: "/data/rankings/pitching/2026/CL/防御率.json",
    localPath: "public/data/rankings/pitching/2026/CL/防御率.json",
    r2Key: "data/rankings/pitching/2026/CL/防御率.json",
  },
  {
    id: "2026_top_batting",
    label: "2026 トップ今季 batting (CL)",
    sitePath: "/data/top-leaders/2026/CL/batting.json",
    localPath: "public/data/top-leaders/2026/CL/batting.json",
    r2Key: "data/top-leaders/2026/CL/batting.json",
  },
  {
    id: "2026_weekly_meta",
    label: "2026 週間 current-week",
    sitePath: "/data/rankings/weekly/2026/current-week.json",
    localPath: "public/data/rankings/weekly/2026/current-week.json",
    r2Key: "data/rankings/weekly/2026/current-week.json",
  },
  {
    id: "2025_ops",
    label: "2025 打撃 OPS (PL)",
    sitePath: "/data/rankings/2025/PL/OPS.json",
    localPath: "public/data/rankings/2025/PL/OPS.json",
    r2Key: "data/rankings/2025/PL/OPS.json",
  },
  {
    id: "1975_ops",
    label: "1975 打撃 OPS (PL)",
    sitePath: "/data/rankings/1975/PL/OPS.json",
    localPath: "public/data/rankings/1975/PL/OPS.json",
    r2Key: "data/rankings/1975/PL/OPS.json",
  },
]

const DISPLAY_ROOTS = [
  { key: "rankings", local: "public/data/rankings", r2Prefix: "data/rankings" },
  { key: "top-leaders", local: "public/data/top-leaders", r2Prefix: "data/top-leaders" },
]

function walkJsonFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walkJsonFiles(p, acc)
    else if (ent.isFile() && ent.name.endsWith(".json")) acc.push(p)
  }
  return acc
}

function dirStats(relRoot) {
  const abs = path.join(ROOT, relRoot.replace(/^public\//, "public/"))
  const files = walkJsonFiles(abs)
  let bytes = 0
  for (const f of files) {
    try {
      bytes += fs.statSync(f).size
    } catch {
      /* ignore */
    }
  }
  const years = new Set()
  for (const f of files) {
    const rel = path.relative(abs, f).replace(/\\/g, "/")
    const m = rel.match(/^(\d{4})\//) || rel.match(/^pitching\/(\d{4})\//) || rel.match(/^weekly\/(\d{4})\//)
    if (m) years.add(m[1])
  }
  return { exists: fs.existsSync(abs), fileCount: files.length, bytes, years: [...years].sort() }
}

function checkLocalFile(relPath) {
  const abs = path.join(ROOT, relPath)
  if (!fs.existsSync(abs)) {
    return { status: "missing", sizeBytes: 0, arrayLength: null }
  }
  const st = fs.statSync(abs)
  let arrayLength = null
  try {
    const raw = JSON.parse(fs.readFileSync(abs, "utf8"))
    if (Array.isArray(raw)) arrayLength = raw.length
    else if (raw && typeof raw === "object" && raw.leaders) {
      const keys = Object.keys(raw.leaders)
      arrayLength = keys.length ? `leaders:${keys.length} metrics` : "leaders:empty"
    }
  } catch (e) {
    return { status: "invalid_json", sizeBytes: st.size, error: String(e.message) }
  }
  return { status: "ok", sizeBytes: st.size, arrayLength }
}

async function probeUrl(url, timeoutMs = 8000) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } })
    const ct = res.headers.get("content-type") || ""
    let bodyPreview = ""
    if (res.ok) {
      const text = await res.text()
      bodyPreview = text.slice(0, 80).replace(/\s+/g, " ")
    }
    return { httpStatus: res.status, contentType: ct, bodyPreview }
  } catch (e) {
    return { httpStatus: null, error: e.name === "AbortError" ? "timeout" : String(e.message) }
  } finally {
    clearTimeout(t)
  }
}

async function main() {
  const jsonOut = process.argv.includes("--json")
  const r2Base = process.env.RANKINGS_BASE_URL?.replace(/\/+$/, "") || null
  const siteBase =
    process.env.DISPLAY_R2_SITE_BASE_URL?.replace(/\/+$/, "") ||
    process.env.PHASE0_SITE_BASE_URL?.replace(/\/+$/, "") ||
    null

  const inventory = {
    phase: 1,
    generatedAt: new Date().toISOString(),
    projectRoot: ROOT,
    gitignoreNote: "public/data/rankings and top-leaders are gitignored; local may be empty on fresh clone",
    displayRoots: {},
    representative: [],
    r2BaseUrlConfigured: Boolean(r2Base),
    siteBaseUrlConfigured: Boolean(siteBase),
  }

  for (const dr of DISPLAY_ROOTS) {
    inventory.displayRoots[dr.key] = {
      ...dirStats(dr.local),
      r2Prefix: dr.r2Prefix,
    }
  }

  for (const item of REPRESENTATIVE_CHECKS) {
    const local = checkLocalFile(item.localPath)
    const row = {
      ...item,
      local,
      r2Url: r2Base ? `${r2Base}/${item.r2Key}` : null,
      r2: null,
      production: null,
    }
    if (r2Base) {
      row.r2 = await probeUrl(row.r2Url)
    }
    if (siteBase) {
      row.production = await probeUrl(`${siteBase}${item.sitePath}`)
    }
    inventory.representative.push(row)
  }

  if (jsonOut) {
    console.log(JSON.stringify(inventory, null, 2))
    return
  }

  console.log("=== Phase 1: 表示用データ 棚卸し ===\n")
  console.log(`プロジェクト: ${ROOT}`)
  console.log(`実行時刻: ${inventory.generatedAt}\n`)

  console.log("--- 表示層ルート（ローカル工場出力） ---")
  for (const dr of DISPLAY_ROOTS) {
    const s = inventory.displayRoots[dr.key]
    const mb = (s.bytes / (1024 * 1024)).toFixed(2)
    console.log(`[${dr.key}]`)
    console.log(`  ローカル: ${dr.local}`)
    console.log(`  R2接頭辞: ${dr.r2Prefix}`)
    console.log(`  存在: ${s.exists ? "yes" : "NO"}`)
    console.log(`  JSON件数: ${s.fileCount}`)
    console.log(`  合計サイズ: ${mb} MB`)
    console.log(`  検出年度: ${s.years.length ? s.years.join(", ") : "(なし)"}`)
    console.log("")
  }

  console.log("--- 代表パス（Phase 1 チェックリスト） ---")
  for (const row of inventory.representative) {
    const loc = row.local.status === "ok" ? `OK (${row.local.sizeBytes} B, ${row.local.arrayLength ?? "object"})` : row.local.status.toUpperCase()
    console.log(`${row.label}`)
    console.log(`  サイト: ${row.sitePath}`)
    console.log(`  ローカル: ${loc}`)
    console.log(`  R2キー: ${row.r2Key}`)
    if (row.r2) {
      const r2s = row.r2.httpStatus != null ? `HTTP ${row.r2.httpStatus}` : row.r2.error
      console.log(`  R2直: ${r2s}`)
    }
    if (row.production) {
      const ps = row.production.httpStatus != null ? `HTTP ${row.production.httpStatus}` : row.production.error
      console.log(`  本番: ${ps}`)
    }
    console.log("")
  }

  console.log("--- 次の Phase ---")
  const missingLocal = inventory.representative.filter((r) => r.local.status !== "ok")
  if (missingLocal.length) {
    console.log(`ローカル未生成: ${missingLocal.length} 件 → Phase 3（npm run rankings:rebuild）`)
  } else {
    console.log("ローカル代表パス: すべて存在 → Phase 5（R2アップロード）へ")
  }
  if (!r2Base) {
    console.log("R2未検証: 環境変数 RANKINGS_BASE_URL を設定して再実行すると R2直アクセスも表示")
  }
  if (!siteBase) {
    console.log("本番未検証: DISPLAY_R2_SITE_BASE_URL=https://your-site.example を設定して再実行")
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
