#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://short-stop.jp"
const DEFAULT_SAMPLE_SIZE = 20
const DEFAULT_TIMEOUT_MS = 15000

const args = new Map()
for (const arg of process.argv.slice(2)) {
  const [key, ...rest] = arg.replace(/^--/, "").split("=")
  args.set(key, rest.length > 0 ? rest.join("=") : "true")
}

const baseUrl = String(args.get("base-url") || DEFAULT_BASE_URL).replace(/\/+$/, "")
const sampleSize = Number(args.get("sample-size") || DEFAULT_SAMPLE_SIZE)
const timeoutMs = Number(args.get("timeout-ms") || DEFAULT_TIMEOUT_MS)
const outputJson = args.has("json")
const failOnWarn = args.has("fail-on-warn")

const errors = []
const warnings = []

function absoluteUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return `${baseUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`
}

async function fetchText(pathOrUrl) {
  const url = absoluteUrl(pathOrUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Short-Stop-AdSense-Audit/1.0" },
      signal: controller.signal,
    })
    const text = await response.text()
    return {
      url,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      text,
    }
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      contentType: "",
      text: "",
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function extractCanonical(html) {
  return /<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i.exec(html)?.[1] || ""
}

function extractRobotsMeta(html) {
  return /<meta\s+[^>]*name=["']robots["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(html)?.[1] || ""
}

function extractSitemapLocs(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1])
}

function classifyUrls(urls) {
  return {
    total: urls.length,
    ranking: urls.filter((url) => url.includes("/ranking")).length,
    players: urls.filter((url) => url.includes("/players/")).length,
    playerTabs: urls.filter((url) => /\/players\/[^/]+\/(pitch|situation|matchup|vs-team|catcher)(?:[/?#]|$)/.test(url)).length,
    teams: urls.filter((url) => url.includes("/teams/")).length,
    standings: urls.filter((url) => url.includes("/standings")).length,
    howToUse: urls.filter((url) => url.endsWith("/how-to-use")).length,
  }
}

async function auditRobots() {
  const result = await fetchText("/robots.txt")
  const looksHtml = /text\/html/i.test(result.contentType) || /<html[\s>]/i.test(result.text)
  const hasSitemap = result.text.includes(`${baseUrl}/sitemap.xml`) || /Sitemap:\s*https?:\/\//i.test(result.text)
  if (!result.ok) errors.push(`robots.txt returned HTTP ${result.status}`)
  if (looksHtml) errors.push("robots.txt looks like HTML, not a robots file")
  if (!hasSitemap) errors.push("robots.txt does not include a Sitemap directive")
  return {
    status: result.status,
    contentType: result.contentType,
    hasSitemap,
    looksHtml,
  }
}

async function auditSitemap() {
  const result = await fetchText("/sitemap.xml")
  if (!result.ok) {
    errors.push(`sitemap.xml returned HTTP ${result.status}`)
    return { status: result.status, contentType: result.contentType, counts: classifyUrls([]), urls: [] }
  }
  if (!/xml/i.test(result.contentType)) {
    warnings.push(`sitemap.xml content-type is ${result.contentType || "(empty)"}`)
  }
  const urls = extractSitemapLocs(result.text)
  const counts = classifyUrls(urls)
  if (counts.total === 0) errors.push("sitemap.xml has no <loc> URLs")
  if (counts.playerTabs > 0) warnings.push(`sitemap includes ${counts.playerTabs} player tab URLs`)
  if (counts.ranking < 4) warnings.push(`sitemap includes only ${counts.ranking} ranking URLs`)
  if (counts.teams === 0) warnings.push("sitemap includes no team URLs")
  return { status: result.status, contentType: result.contentType, counts, urls }
}

async function auditCanonicals() {
  const expected = {
    "/": `${baseUrl}/`,
    "/weekly-stats": `${baseUrl}/weekly-stats`,
    "/probable-pitchers": `${baseUrl}/probable-pitchers`,
    "/news": `${baseUrl}/news`,
    "/standings": `${baseUrl}/standings`,
  }
  const results = []
  for (const [path, canonical] of Object.entries(expected)) {
    const result = await fetchText(path)
    const found = extractCanonical(result.text)
    const ok = found === canonical
    if (!result.ok) errors.push(`${path} returned HTTP ${result.status}`)
    if (!ok) warnings.push(`${path} canonical is "${found || "(missing)"}", expected "${canonical}"`)
    results.push({ path, status: result.status, canonical: found, expected: canonical, ok })
  }
  return results
}

async function auditThinPages(sitemapUrls) {
  const fixedPaths = [
    "/",
    "/weekly-stats",
    "/probable-pitchers",
    "/standings",
    "/ranking/2026/CL",
    "/ranking/pitching/2026/PL",
  ].map(absoluteUrl)
  const playerUrls = sitemapUrls.filter((url) => url.includes("/players/")).slice(0, sampleSize)
  const urls = [...new Set([...fixedPaths, ...playerUrls])]
  const results = []
  for (const url of urls) {
    const result = await fetchText(url)
    const text = htmlToText(result.text)
    const robots = extractRobotsMeta(result.text)
    const hasErrorText = /Failed to fetch|JSON\s*未配置|エラー|データの取得に失敗/.test(text)
    const thin = result.ok && text.length < 120
    if (!result.ok) warnings.push(`${url} returned HTTP ${result.status}`)
    if (thin) warnings.push(`${url} initial HTML text is thin (${text.length} chars)`)
    if (hasErrorText) warnings.push(`${url} contains error-like text in initial HTML`)
    results.push({
      url,
      status: result.status,
      textLength: text.length,
      robots,
      thin,
      hasErrorText,
      snippet: text.slice(0, 120),
    })
  }
  return results
}

async function auditJsonEndpoints() {
  const paths = [
    "/data/rankings/2026/CL/OPS.json",
    "/data/rankings/2026/PL/OPS.json",
    "/data/rankings/pitching/2026/CL/%E9%98%B2%E5%BE%A1%E7%8E%87.json",
    "/data/rankings/pitching/2026/PL/%E9%98%B2%E5%BE%A1%E7%8E%87.json",
    "/data/rankings/1994/CL/OPS.json",
    "/data/rankings/pitching/1994/CL/%E9%98%B2%E5%BE%A1%E7%8E%87.json",
  ]
  const results = []
  for (const path of paths) {
    const result = await fetchText(path)
    if (!result.ok) warnings.push(`${path} returned HTTP ${result.status}`)
    if (result.ok && !/json/i.test(result.contentType)) {
      warnings.push(`${path} content-type is ${result.contentType || "(empty)"}`)
    }
    results.push({ path, status: result.status, contentType: result.contentType, ok: result.ok })
  }
  return results
}

const robots = await auditRobots()
const sitemap = await auditSitemap()
const canonicals = await auditCanonicals()
const thinPages = await auditThinPages(sitemap.urls)
const jsonEndpoints = await auditJsonEndpoints()

const report = {
  baseUrl,
  generatedAt: new Date().toISOString(),
  robots,
  sitemap: {
    status: sitemap.status,
    contentType: sitemap.contentType,
    counts: sitemap.counts,
  },
  canonicals,
  thinPages,
  jsonEndpoints,
  warnings,
  errors,
}

if (outputJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`AdSense readiness audit: ${baseUrl}`)
  console.log(`robots: HTTP ${robots.status}, content-type=${robots.contentType || "(empty)"}, sitemap=${robots.hasSitemap}`)
  console.log(`sitemap: HTTP ${sitemap.status}, total=${sitemap.counts.total}, ranking=${sitemap.counts.ranking}, players=${sitemap.counts.players}, playerTabs=${sitemap.counts.playerTabs}, teams=${sitemap.counts.teams}`)
  console.log(`canonicals checked: ${canonicals.length}`)
  console.log(`HTML pages sampled: ${thinPages.length}`)
  console.log(`JSON endpoints checked: ${jsonEndpoints.length}`)
  if (warnings.length > 0) {
    console.log("\nWarnings:")
    for (const warning of warnings) console.log(`- ${warning}`)
  }
  if (errors.length > 0) {
    console.log("\nErrors:")
    for (const error of errors) console.log(`- ${error}`)
  }
}

if (errors.length > 0 || (failOnWarn && warnings.length > 0)) {
  process.exitCode = 1
}
