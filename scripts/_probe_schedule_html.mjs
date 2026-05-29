const ymd = process.argv[2] || "2026-05-20"
const url = `https://baseball.yahoo.co.jp/npb/schedule/first/league?date=${ymd}`
const res = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "ja" },
})
const html = await res.text()
const month = parseInt(ymd.slice(5, 7), 10)
const day = parseInt(ymd.slice(8, 10), 10)
const jaNeedle = `${month}月${day}日`
let scoped = ""
for (const rowspan of [6, 5, 7, 8, 4, 9]) {
  const dayThNeedle = `bb-scheduleTable__head" scope="row" rowspan="${rowspan}">${jaNeedle}`
  const start = html.indexOf(dayThNeedle)
  if (start >= 0) {
    const afterStart = start + dayThNeedle.length
    const tbodyEnd = html.indexOf("</tbody>", afterStart)
    scoped = tbodyEnd >= 0 ? html.slice(start, tbodyEnd) : html.slice(start)
    break
  }
}
const re = /<tr[^>]*>[\s\S]*?href="\/npb\/game\/(\d+)\/index"[\s\S]*?<\/tr>/g
let m
while ((m = re.exec(scoped))) {
  const row = m[0]
  const gid = m[1]
  const stadiumTd = row.match(/<td[^>]*class="[^"]*bb-scheduleTable__stadium[^"]*"[^>]*>([\s\S]*?)<\/td>/i)
  const plain = row.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)
  console.log(gid, stadiumTd ? stadiumTd[1].replace(/<[^>]+>/g, "").trim() : "(no stadium td)", plain.slice(0, 80))
}
