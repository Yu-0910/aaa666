const gameId = process.argv[2]
const indexes = process.argv.slice(3)

if (!gameId || indexes.length === 0) {
  console.error(
    "usage: node scripts/probe_score_indexes.mjs <gameId> <index1> <index2> ..."
  )
  process.exit(1)
}

const base = `https://baseball.yahoo.co.jp/npb/game/${gameId}/score?index=`

for (const idx of indexes) {
  const url = base + idx
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "ja" },
  })
  const html = await res.text()
  const m = html.match(/<div id="base" class="(b[0-9]{3})"/)
  const cls = m ? m[1] : "?"
  const playerLinks = [...html.matchAll(/\/npb\/player\/(\d+)\/top/g)].map(
    (x) => x[1]
  )
  const uniqPlayers = new Set(playerLinks)
  const hasRunnerWord = /runner/i.test(html)

  console.log(
    JSON.stringify(
      {
        idx,
        status: res.status,
        baseClass: cls,
        playerLinks: playerLinks.length,
        uniqPlayers: uniqPlayers.size,
        hasRunnerWord,
      },
      null,
      2
    )
  )
}

