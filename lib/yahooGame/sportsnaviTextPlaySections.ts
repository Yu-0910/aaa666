import type { TextPlaySection } from "./types"

function stripTags(s: string): string {
  return String(s ?? "").replace(/<[^>]+>/g, " ")
}

function normWs(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * `raw_sportsnavi_text/*.html` から `parseSportsnaviTextHtml`（sportsnaviStatsTextParse.mjs）と
 * 同じ粒度でイニング別実況＋プレー見出しを取り出す（TS 側の冪等補完用）。
 */
export function parseSportsnaviTextPlaySectionsFromHtml(html: string): TextPlaySection[] {
  if (!html || html.length < 50) return []

  const out: TextPlaySection[] = []
  const parts = html.split('class="bb-liveText"')
  for (let p = 1; p < parts.length; p++) {
    const block = parts[p]
    const titleM = block.match(/bb-liveText__inning[^>]*>([\s\S]*?)<\/h1>/i)
    const sectionTitle = titleM ? normWs(stripTags(titleM[1] ?? "")) : ""

    const lines: string[] = []
    const playHeadlineJa: (string | null)[] = []
    const liRe = /<li[^>]*bb-liveText__item[^>]*>([\s\S]*?)<\/li>/gi
    let lm: RegExpExecArray | null
    while ((lm = liRe.exec(block)) !== null) {
      const itemHtml = lm[1] ?? ""
      const htM = itemHtml.match(/<p\s+class="bb-liveText__itemTitle"[^>]*>([\s\S]*?)<\/p>/i)
      const headline = htM ? normWs(stripTags(htM[1] ?? "")) : ""
      const t = normWs(stripTags(itemHtml))
      if (t) {
        lines.push(t)
        playHeadlineJa.push(headline || null)
      }
    }

    if (sectionTitle || lines.length > 0) {
      out.push({ sectionTitle, lines, playHeadlineJa })
    }
  }
  return out
}

/**
 * canonical の textPlayByPlay に、生テキスト HTML から取った playHeadlineJa をマージする。
 * `lines` がパース結果と完全一致するイニングだけ更新する（粒度違いの canonical は触らない）。
 */
export function mergePlayHeadlinesIntoTextPlayByPlay(
  sections: TextPlaySection[] | undefined,
  parsed: TextPlaySection[],
): TextPlaySection[] {
  if (!sections || sections.length === 0) return sections ?? []
  const byTitle = new Map<string, TextPlaySection>()
  for (const s of parsed) {
    const k = String(s.sectionTitle ?? "").trim()
    if (k) byTitle.set(k, s)
  }

  return sections.map((sec) => {
    const psec = byTitle.get(String(sec.sectionTitle ?? "").trim())
    if (!psec || !psec.playHeadlineJa || psec.lines.length !== sec.lines.length) {
      return sec
    }
    for (let i = 0; i < sec.lines.length; i++) {
      if (normWs(sec.lines[i] ?? "") !== normWs(psec.lines[i] ?? "")) {
        return sec
      }
    }
    return { ...sec, playHeadlineJa: [...psec.playHeadlineJa] }
  })
}

/**
 * `lines` の粒度がパース結果と違う canonical 向け。
 * 各パース行（1プレー＝1 `li` の全文）について、それに **部分文字列として含まれる canonical 行のうち先頭インデックス** に
 * そのプレーの `playHeadlineJa` を1件だけ付与する（長い後続行より、けん制ミス等の先頭行を優先）。
 */
export function mergePlayHeadlinesLooseIntoTextPlayByPlay(
  sections: TextPlaySection[] | undefined,
  parsed: TextPlaySection[],
): TextPlaySection[] {
  if (!sections || sections.length === 0) return sections ?? []
  const byTitle = new Map<string, TextPlaySection>()
  for (const s of parsed) {
    const k = String(s.sectionTitle ?? "").trim()
    if (k) byTitle.set(k, s)
  }

  return sections.map((sec) => {
    const psec = byTitle.get(String(sec.sectionTitle ?? "").trim())
    if (!psec?.playHeadlineJa?.length) return sec
    const headlines: (string | null)[] = sec.lines.map(() => null)
    const usedCi = new Set<number>()

    for (let pi = 0; pi < psec.lines.length; pi++) {
      const pl = normWs(psec.lines[pi] ?? "")
      const h = psec.playHeadlineJa[pi] ?? null
      if (!pl || !h) continue
      let bestCi = -1
      for (let ci = 0; ci < sec.lines.length; ci++) {
        if (usedCi.has(ci)) continue
        const cl = normWs(sec.lines[ci] ?? "")
        if (cl.length < 6) continue
        if (pl.includes(cl)) {
          bestCi = ci
          break
        }
      }
      if (bestCi >= 0) {
        headlines[bestCi] = h
        usedCi.add(bestCi)
      }
    }

    return headlines.some((x) => x != null && String(x).trim() !== "") ? { ...sec, playHeadlineJa: headlines } : sec
  })
}
