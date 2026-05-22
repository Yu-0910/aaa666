import type { RunnerEvent } from "./types"

function inningHalfFromYahooTextHeading(heading: string): string | undefined {
  const s = String(heading ?? "").trim()
  const m = s.match(/^(\d+)回(表|裏)$/)
  if (!m) return undefined
  return `${m[1]}回${m[2]}`
}

/**
 * Yahoo の実況 `.../text` HTML から盗塁/盗塁死の走者IDを抽出する。
 *
 * DOM 実例（抜粋）:
 * - `<span class="bb-liveText__state">一塁走者</span>`
 * - `<a class="bb-liveText__player" href="/npb/player/2000089/top">小川</a>`
 * - `<span class="bb-liveText__state">:盗塁成功 二塁</span>`
 *
 * 注意:
 * - 走者IDリンクが無い行（＝単なる状況表示だけの行）は対象外。
 * - inningHalf は直近の `<h1 class="bb-liveText__inning">...</h1>` を採用（best-effort）。
 */
export function runnerEventsFromYahooTextHtml(args: {
  gameId: string
  html: string
}): RunnerEvent[] {
  const { gameId } = args
  const html = String(args.html ?? "")
  const out: RunnerEvent[] = []

  // innings をまたぐので、HTMLを先頭から走査して「直近 inningHalf」を状態として持つ。
  // 走者イベントは「1つの <p class="bb-liveText__summary..."> ... </p> の中だけ」で判定する
  // （ページ全体をまたいでマッチしてしまうと inningHalf が壊れるため）。
  const tokenRe =
    /<h1 class="bb-liveText__inning">([^<]+)<\/h1>|<p class="bb-liveText__summary[^"]*"[^>]*>([\s\S]*?)<\/p>/g

  const runnerInsideRe =
    /<span class="bb-liveText__state">(一塁走者|二塁走者|三塁走者)<\/span>[\s\S]*?<a class="bb-liveText__player"[^>]*href="\/npb\/player\/(\d+)\/top"[^>]*>([^<]+)<\/a>[\s\S]*?<span class="bb-liveText__state">\s*:?([^<]+)<\/span>/

  // 一部の盗塁死は「末尾の state span」が無く、summary 文章内にそのまま埋め込まれる。
  // 例（概念）: "空振り三振！一塁走者 <a ...>西川</a> も盗塁失敗でダブルプレー"
  // この場合でも走者リンク自体は存在することがあるため、ゆるい抽出を行う。
  const runnerLooseRe =
    /(一塁走者|二塁走者|三塁走者)[\s\S]*?<a class="bb-liveText__player"[^>]*href="\/npb\/player\/(\d+)\/top"[^>]*>([^<]+)<\/a>[\s\S]*?(盗塁成功|盗塁死|盗塁失敗|盗塁を試みるもアウト)/ 

  // 例:
  // - `<span class="bb-liveText__state">一塁けん制:ランナー</span> ... <a ...>西川</a> ... <span ...>帰塁</span>`
  // - `<span class="bb-liveText__state">一塁けん制:ランナー</span> ... <a ...>辰己</a> ... <span ...>アウト</span>`
  const pickoffInsideRe =
    /<span class="bb-liveText__state">([一二三]塁(?:けん制|牽制):ランナー)<\/span>[\s\S]*?<a class="bb-liveText__player"[^>]*href="\/npb\/player\/(\d+)\/top"[^>]*>([^<]+)<\/a>[\s\S]*?<span class="bb-liveText__state">\s*:?([^<]+)<\/span>/

  let inningHalf: string | undefined
  let seq = 0
  for (let mm = tokenRe.exec(html); mm; mm = tokenRe.exec(html)) {
    const heading = mm[1]
    const pInner = mm[2]

    if (heading) {
      const ih = inningHalfFromYahooTextHeading(heading)
      if (ih) inningHalf = ih
      continue
    }
    if (!pInner) continue

    const m =
      pInner.match(runnerInsideRe) ?? pInner.match(pickoffInsideRe) ?? pInner.match(runnerLooseRe)
    if (!m) continue

    const runnerLabel = String(m[1] ?? "").trim()
    const yahooRunnerId = String(m[2] ?? "").trim()
    const runnerNameJa = String(m[3] ?? "").trim()
    const tail = String(m[4] ?? "").trim()

    // 盗塁死の表現が複数ある。
    // 例:
    // - "盗塁死 二塁"
    // - "盗塁失敗でダブルプレー"
    // - "盗塁を試みるもアウト"
    // - "すかさず初球から盗塁を試みるもアウト"
    const isCaughtStealingText = (s: string): boolean =>
      /(盗塁死|盗塁失敗|盗塁を試みるも(?:アウト|タッチアウト)|盗塁を試みるもアウト)/.test(
        String(s ?? "")
      )

    const kind: RunnerEvent["kind"] | null =
      /盗塁成功/.test(tail)
        ? "SB"
        : isCaughtStealingText(tail)
          ? "CS"
          : /(けん制|牽制)/.test(runnerLabel) &&
              /^(アウト|タッチアウト|挟殺)/.test(tail) &&
              !/帰塁/.test(tail) &&
              !/バッターアウト/.test(tail)
            ? "CS"
            : null
    if (!kind) continue
    if (!yahooRunnerId) continue

    seq += 1
    out.push({
      eventId: `${gameId}-yahooText-runner-${seq}`,
      inningHalf,
      kind,
      yahooRunnerId,
      runnerNameJa: runnerNameJa || undefined,
      sourceLine: `${runnerLabel}${runnerNameJa}:${tail}`.trim() || undefined,
      sourceTier: "yahooTextDom",
    })
  }

  return out
}

