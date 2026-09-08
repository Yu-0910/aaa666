import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const required = {
  gaId: "G-J8EWRCJXYL",
  adsenseClient: "ca-pub-5927852752448438",
  searchConsoleVerification: "kKv1BMYikT9gulfJnk8IZvMreBFL9TURx42GS1nituI",
}

const checks = []

function readText(relativePath) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) {
    checks.push({ ok: false, message: `${relativePath} is missing` })
    return ""
  }
  checks.push({ ok: true, message: `${relativePath} exists` })
  return fs.readFileSync(absolutePath, "utf8")
}

function expect(label, condition) {
  checks.push({ ok: Boolean(condition), message: label })
}

const layout = readText("app/layout.tsx")
const googleAnalytics = readText("components/GoogleAnalytics.tsx")
const analyticsWrapper = readText("components/AnalyticsWrapper.tsx")

expect("app/layout.tsx imports GoogleAnalytics", /import\s+GoogleAnalytics\s+from\s+["']@\/components\/GoogleAnalytics["']/.test(layout))
expect("app/layout.tsx renders <GoogleAnalytics />", /<GoogleAnalytics\s*\/>/.test(layout))
expect("app/layout.tsx imports AnalyticsWrapper", /import\s+AnalyticsWrapper\s+from\s+["']@\/components\/AnalyticsWrapper["']/.test(layout))
expect("app/layout.tsx renders <AnalyticsWrapper />", /<AnalyticsWrapper\s*\/>/.test(layout))
expect(`components/GoogleAnalytics.tsx contains GA ID ${required.gaId}`, googleAnalytics.includes(required.gaId))
expect("components/GoogleAnalytics.tsx loads gtag script", googleAnalytics.includes("https://www.googletagmanager.com/gtag/js"))
expect("components/GoogleAnalytics.tsx disables implicit page_view", googleAnalytics.includes("send_page_view: false"))
expect(`app/layout.tsx contains AdSense client ${required.adsenseClient}`, layout.includes(required.adsenseClient))
expect(
  `app/layout.tsx contains Search Console verification ${required.searchConsoleVerification}`,
  layout.includes(required.searchConsoleVerification),
)
expect("components/AnalyticsWrapper.tsx exports AnalyticsWrapper", /export\s+default\s+function\s+AnalyticsWrapper/.test(analyticsWrapper))

const failures = checks.filter((check) => !check.ok)

for (const check of checks) {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.message}`)
}

if (failures.length > 0) {
  console.error(`guard:analytics failed with ${failures.length} issue(s).`)
  process.exit(1)
}

console.log("guard:analytics passed.")
