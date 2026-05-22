import type { BatterEvent } from "./types"

function inningHalfFromYahooTextHeading(heading: string): string | undefined {
  const s = String(heading ?? "").trim()
  const m = s.match(/^(\d+)回(表|裏)$/)
  if (!m) return undefined
  return `${m[1]}回${m[2]}`
}

function stripTags(s: string): string {
  return String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isGidpSummaryText(tail: string): boolean {
  const s = String(tail ?? "").trim()
  if (!s) return false
  if (/併殺崩れ/.test(s)) return false
  // 走者イベントや三振併殺は打者GIDPではない
  if (/盗塁/.test(s)) return false
  if (/三振/.test(s)) return false
  // 典型: "4-6-3のダブルプレー 3アウト" / "併殺打 2アウト"
  if (/併殺打|併打|併殺/.test(s)) return true
  if (/(ダブルプレー|ゲッツー)/.test(s) && /\d-\d-\d/.test(s)) return true
  return false
}

/**
 * Yahoo の実況 `.../text` HTML から、打者ID付きの「併殺打（GIDP）」イベントを抽出する。
 *
 * DOM 実例（抜粋）:
 * - `<p class="bb-liveText__batter"> ... <a class="bb-liveText__player" href="/npb/player/1900101/top">海野 隆司</a> ... </p>`
 * - `<p class="bb-liveText__summary"><span class="bb-liveText__state">4-6-3のダブルプレー 3アウト</span></p>`
 */
export function batterEventsFromYahooTextHtml(args: { gameId: string; html: string }): BatterEvent[] {
  const { gameId } = args
  const html = String(args.html ?? "")
  const out: BatterEvent[] = []

  const tokenRe =
    /<h1 class="bb-liveText__inning">([^<]+)<\/h1>|<p class="bb-liveText__batter">([\s\S]*?)<\/p>|<p class="bb-liveText__summary[^"]*"[^>]*>([\s\S]*?)<\/p>/g

  const batterInsideRe =
    /<a class="bb-liveText__player"[^>]*href="\/npb\/player\/(\d+)\/top"[^>]*>([^<]+)<\/a>/

  let inningHalf: string | undefined
  let lastBatterId: string | undefined
  let lastBatterName: string | undefined
  let seq = 0

  for (let mm = tokenRe.exec(html); mm; mm = tokenRe.exec(html)) {
    const heading = mm[1]
    const batterInner = mm[2]
    const summaryInner = mm[3]

    if (heading) {
      const ih = inningHalfFromYahooTextHeading(heading)
      if (ih) inningHalf = ih
      continue
    }

    if (batterInner) {
      const m = batterInner.match(batterInsideRe)
      if (!m) {
        lastBatterId = undefined
        lastBatterName = undefined
        continue
      }
      lastBatterId = String(m[1] ?? "").trim() || undefined
      lastBatterName = String(m[2] ?? "").trim() || undefined
      continue
    }

    if (summaryInner) {
      if (!lastBatterId) continue
      const tail = stripTags(summaryInner)
      if (!isGidpSummaryText(tail)) continue

      seq += 1
      out.push({
        eventId: `${gameId}-yahooText-batter-${seq}`,
        inningHalf,
        kind: "GIDP",
        yahooBatterId: lastBatterId,
        batterNameJa: lastBatterName,
        sourceLine: tail || undefined,
        sourceTier: "yahooTextDom",
      })
    }
  }

  return out
}

