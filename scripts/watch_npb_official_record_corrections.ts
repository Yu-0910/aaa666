/**
 * NPB公式ニュースの「公式記録の訂正に関するお知らせ」を定点観察する。
 *
 * 新規告知を見つけた場合は、訂正を登録したうえで再生成・再公開すべき対象を出力する。
 * 2回目公開後の観察用なので、通常は警告ログとして扱い、--fail-on-unconfigured の時だけ失敗させる。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

type ObservedCorrection = {
  publishedDate: string
  title: string
  url: string
  configured: boolean
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

const REQUIRED_REGEN_SURFACES = [
  "公式訂正設定: _data/official_record_corrections/{year}/corrections.json",
  "該当試合 canonical JSON: _data/scraped_games/canonical/{gameId}.json",
  "個人打撃ページ: phase11, phase13, phase15, phase16, phase17",
  "個人投手ページ: phase:pitcher-poc1, phase7, phase14, phase25（投手成績・投球内容に影響する場合）",
  "ランキングページ: phase12 batting rankings, phase19 pitching rankings, phase28 weekly rankings",
  "順位表指標: phase29 team standings",
  "トップ表示: top-leaders, top-weekly-leaders",
  "その他 canonical 由来の派生: 捕手系 phase22-26, 対戦 phase30, 配球/カウント/状況別 phase20/33/34（訂正内容が影響する場合）",
  "本番公開: display:r2:upload:2026 と display:r2:upload:derived:2026、公開確認",
]

function parseArgs(): { year: string; pages: number; failOnUnconfigured: boolean; writeSnapshot: boolean } {
  const out = { year: "2026", pages: 8, failOnUnconfigured: false, writeSnapshot: true }
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) out.year = args[++i]!
    else if (args[i] === "--pages" && args[i + 1]) out.pages = Math.max(1, Number(args[++i]) || out.pages)
    else if (args[i] === "--fail-on-unconfigured") out.failOnUnconfigured = true
    else if (args[i] === "--no-write-snapshot") out.writeSnapshot = false
  }
  return out
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim())
}

function absNpbUrl(href: string): string {
  return new URL(decodeHtmlEntities(href), "https://npb.jp/news/").toString()
}

function dateFromUrl(url: string): string {
  const m = url.match(/\/detail\/(\d{4})(\d{2})(\d{2})_/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ""
}

function candidateListUrls(pages: number): string[] {
  const urls = new Set<string>(["https://npb.jp/news/npb_stats.html"])
  for (let i = 2; i <= pages; i++) {
    urls.add(`https://npb.jp/news/npb_stats.html?page=${i}`)
  }
  return [...urls]
}

async function fetchText(url: string): Promise<string | null> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": "TopPage official-record-correction observer",
        },
      })
      if (!res.ok) {
        if (res.status === 404) return null
        throw new Error(`fetch failed ${res.status} ${url}`)
      }
      const buf = await res.arrayBuffer()
      return new TextDecoder("utf-8").decode(buf)
    } catch (e) {
      lastError = e
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 3000))
    }
  }
  console.warn(`[npb-official-corrections:observe] list fetch skipped after retries: ${url} ${lastError}`)
  return null
}

function extractCorrectionsFromList(html: string): ObservedCorrection[] {
  const out: ObservedCorrection[] = []
  const re = /<a\s+[^>]*href=["']([^"']*\/?detail\/\d{8}_\d+\.html)["'][^>]*>([\s\S]*?)<\/a>/g
  for (const m of html.matchAll(re)) {
    const title = stripTags(m[2] ?? "")
    if (!title.includes("公式記録の訂正")) continue
    const url = absNpbUrl(m[1] ?? "")
    out.push({
      publishedDate: dateFromUrl(url),
      title,
      url,
      configured: false,
    })
  }
  return out
}

function loadConfiguredUrls(year: string): Set<string> {
  const p = path.join(root, "_data", "official_record_corrections", year, "corrections.json")
  const payload = JSON.parse(fs.readFileSync(p, "utf8"))
  const urls = new Set<string>()
  for (const c of Array.isArray(payload?.corrections) ? payload.corrections : []) {
    const url = String(c?.url ?? "").trim()
    if (url) urls.add(url)
  }
  return urls
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function main(): Promise<void> {
  const args = parseArgs()
  const configuredUrls = loadConfiguredUrls(args.year)
  const byUrl = new Map<string, ObservedCorrection>()
  const visitedListUrls: string[] = []

  for (const listUrl of candidateListUrls(args.pages)) {
    const html = await fetchText(listUrl)
    if (!html) continue
    visitedListUrls.push(listUrl)
    for (const item of extractCorrectionsFromList(html)) byUrl.set(item.url, item)
  }
  if (visitedListUrls.length === 0) {
    throw new Error("no NPB official stats news list pages could be fetched")
  }

  const observed = [...byUrl.values()]
    .filter((item) => item.publishedDate.startsWith(`${args.year}-`))
    .map((item) => ({ ...item, configured: configuredUrls.has(item.url) }))
    .sort((a, b) => b.publishedDate.localeCompare(a.publishedDate) || a.url.localeCompare(b.url))
  const unconfigured = observed.filter((item) => !item.configured)

  const snapshot = {
    schemaVersion: "npb-official-record-correction-observation-v1",
    year: args.year,
    observedAt: new Date().toISOString(),
    sourceListUrls: visitedListUrls,
    requiredRegenerationSurfaces: REQUIRED_REGEN_SURFACES.map((s) => s.replaceAll("{year}", args.year)),
    observed,
    unconfigured,
  }
  if (args.writeSnapshot) {
    writeJson(
      path.join(root, "_data", "official_record_corrections", args.year, "npb_observation_latest.json"),
      snapshot,
    )
  }

  console.log(`[npb-official-corrections:observe] observed=${observed.length} configured=${observed.length - unconfigured.length} unconfigured=${unconfigured.length}`)
  for (const item of observed) {
    const mark = item.configured ? "configured" : "UNCONFIGURED"
    console.log(`- ${mark} ${item.publishedDate} ${item.title} ${item.url}`)
  }
  if (unconfigured.length > 0) {
    console.warn("\n未登録のNPB公式記録訂正があります。訂正内容を登録・反映した後、以下を再生成・再公開してください。")
    for (const surface of snapshot.requiredRegenerationSurfaces) console.warn(`- ${surface}`)
  }
  if (args.failOnUnconfigured && unconfigured.length > 0) process.exitCode = 2
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
