const ymd = process.argv[2]
if (!ymd) {
  console.error("usage: node scripts/_tmp_extract_schedule_ids.mjs YYYY-MM-DD")
  process.exit(1)
}

const url = `https://baseball.yahoo.co.jp/npb/schedule/first/league?date=${encodeURIComponent(ymd)}`
const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "ja" } })
const html = await res.text()

const jaNeedle = `${parseInt(ymd.slice(5, 7), 10)}月${parseInt(ymd.slice(8, 10), 10)}日`
const titleNeedle = `bb-head01__title\">${jaNeedle}`
const idxJa = html.indexOf(titleNeedle)
const aroundJa = idxJa >= 0 ? html.slice(Math.max(0, idxJa - 200), idxJa + 400) : null
const needle = ymd
const idx = html.indexOf(needle)
const around = idx >= 0 ? html.slice(Math.max(0, idx - 200), idx + 400) : null
const hasTime = html.includes(`datetime="${ymd}"`)
const hasDateAttr = html.includes(`data-date="${ymd}"`) || html.includes(`data-date='${ymd}'`)

let scoped = html
if (idxJa >= 0) {
  const tableStart = html.indexOf("bb-scheduleTable", idxJa)
  const nextTitle = html.indexOf("bb-head01__title\">", tableStart + 1)
  scoped = tableStart >= 0 ? html.slice(tableStart, nextTitle >= 0 ? nextTitle : undefined) : html
}
const reScoped = /bb-scheduleTable__status[\s\S]*?href="\/npb\/game\/(\d+)\/index"/g
const setScoped = new Set()
let mm
while ((mm = reScoped.exec(scoped))) setScoped.add(mm[1])

const firstId = [...setScoped][0]
const firstNeedle = firstId ? `/npb/game/${firstId}/index` : null
const firstIdx = firstNeedle ? scoped.indexOf(firstNeedle) : -1
const firstAround = firstIdx >= 0 ? scoped.slice(Math.max(0, firstIdx - 250), firstIdx + 500) : null

const re = /bb-scheduleTable__status[\s\S]*?href="\/npb\/game\/(\d+)\/index"/g
const set = new Set()
let m
while ((m = re.exec(html))) set.add(m[1])
const ids = [...set].sort()
console.log(
  JSON.stringify(
    {
      ymd,
      ids: ids.length,
      jaNeedle,
      idxJa,
      aroundJa,
      scopedIds: setScoped.size,
      firstId,
      firstAround,
      hasTime,
      hasDateAttr,
      idxInHtml: idx,
      around,
      gameIds: ids,
    },
    null,
    2,
  ),
)

