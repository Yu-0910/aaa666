import type { PlateAppearance } from "./types"

/**
 * paId を `${gameId}-${回}-${表|裏}-${番号}` とみなせる打席について、番号を数値正規化したキーで重複を1件にまとめる。
 * canonical の打席と実況フォールバックで別 paId が立つと対左右の PA だけ膨らむため（loadVsHand 内コメント参照）。
 */
export function dedupePlateAppearancesByInningHalfOrder(
  pas: PlateAppearance[],
  gameId: string | undefined,
): PlateAppearance[] {
  const gid = String(gameId ?? "").trim()
  if (!gid || pas.length < 2) return pas

  const canonicalKey = (pa: PlateAppearance): string => {
    const id = String(pa.paId ?? "").trim()
    if (!id.startsWith(`${gid}-`)) return id
    const tail = id.slice(gid.length + 1)
    const parts = tail.split("-")
    if (parts.length < 3) return id
    const inn = parts[0]!
    const half = parts[1]!
    const orderStr = parts.slice(2).join("-")
    const ord = parseInt(orderStr, 10)
    if (!Number.isFinite(ord)) return id
    return `${gid}-${inn}-${half}-${ord}`
  }

  const richness = (pa: PlateAppearance): number => {
    const pe = Array.isArray(pa.pitchEvents) ? pa.pitchEvents.length : 0
    const r = String(pa.resultSummaryJa ?? "").trim().length
    return pe * 1000 + r
  }

  const best = new Map<string, PlateAppearance>()
  for (const pa of pas) {
    const k = canonicalKey(pa)
    const cur = best.get(k)
    if (!cur) {
      best.set(k, pa)
      continue
    }
    const ra = richness(pa)
    const rb = richness(cur)
    if (ra > rb) best.set(k, pa)
    else if (ra === rb && String(pa.paId ?? "").length < String(cur.paId ?? "").length) best.set(k, pa)
  }

  const sortParts = (k: string): [string, number, number, number] | null => {
    const p = k.split("-")
    if (p.length < 4) return null
    const ord = parseInt(p[p.length - 1]!, 10)
    const half = p[p.length - 2]!
    const inn = parseInt(p[p.length - 3]!, 10)
    const g = p.slice(0, -3).join("-")
    if (!Number.isFinite(ord) || !Number.isFinite(inn)) return null
    const ho = half === "表" ? 0 : half === "裏" ? 1 : 2
    return [g, inn, ho, ord]
  }

  const out = [...best.values()]
  out.sort((a, b) => {
    const ka = canonicalKey(a)
    const kb = canonicalKey(b)
    const pa = sortParts(ka)
    const pb = sortParts(kb)
    if (pa && pb) {
      for (let i = 0; i < 4; i++) {
        const c = pa[i]! < pb[i]! ? -1 : pa[i]! > pb[i]! ? 1 : 0
        if (c !== 0) return c
      }
      return 0
    }
    const c = ka.localeCompare(kb, "ja")
    if (c !== 0) return c
    return String(a.paId ?? "").localeCompare(String(b.paId ?? ""), "ja")
  })
  return out
}
