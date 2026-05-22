import type { CanonicalGameDocument, RunnerEvent } from "./types"

export function normalizeJaNameKey(s: string): string {
  return String(s ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[.．]/g, "")
}

export function buildNameKeyToYahooIdMap(doc: CanonicalGameDocument): Map<string, string> {
  const m = new Map<string, string>()
  const surnameOwner = new Map<string, string | "__conflict__">()
  const ym = doc.game?.yahooPlayersMentioned ?? {}
  for (const [id, name] of Object.entries(ym)) {
    const yid = String(id ?? "").trim()
    const raw = String(name ?? "").trim()
    const fullKey = normalizeJaNameKey(raw)
    if (fullKey && yid && !m.has(fullKey)) m.set(fullKey, yid)

    const tokens = raw.normalize("NFKC").split(/\s+/).filter(Boolean)
    if (tokens.length >= 1) {
      const surnameKey = normalizeJaNameKey(tokens[0]!)
      if (surnameKey && yid) {
        const cur = surnameOwner.get(surnameKey)
        if (!cur) surnameOwner.set(surnameKey, yid)
        else if (cur !== yid) surnameOwner.set(surnameKey, "__conflict__")
      }
    }
  }
  for (const [k, owner] of surnameOwner.entries()) {
    if (owner && owner !== "__conflict__" && !m.has(k)) m.set(k, owner)
  }
  return m
}

function inningHalfFromSectionTitle(sectionTitle: string): string | undefined {
  const s = String(sectionTitle ?? "").trim()
  const m = s.match(/^(\d+)回(表|裏)$/)
  if (!m) return undefined
  return `${m[1]}回${m[2]}`
}

/**
 * `game.textPlayByPlay`（実況）から盗塁/盗塁死を抽出して正規化する（best-effort）。
 * - 打席外イベントのため plateAppearances からは取得できない
 * - 同姓の曖昧さは「同一試合内で一意なときだけ姓キーを使う」方針
 */
export function runnerEventsFromTextPlayByPlay(doc: CanonicalGameDocument): RunnerEvent[] {
  const out: RunnerEvent[] = []
  const sections = doc.game?.textPlayByPlay ?? []
  if (!Array.isArray(sections) || sections.length === 0) return out

  const nameToId = buildNameKeyToYahooIdMap(doc)

  const patterns: Array<{ kind: RunnerEvent["kind"]; re: RegExp; label: string }> = [
    { kind: "SB", re: /走者\s*([^\s:：]+)\s*[:：]\s*盗塁成功/, label: "走者:盗塁成功" },
    { kind: "CS", re: /走者\s*([^\s:：]+)\s*[:：]\s*(盗塁死|盗塁失敗)/, label: "走者:盗塁死/失敗" },
    { kind: "SB", re: /ランナー\s*([^\s:：]+)\s*[:：]\s*盗塁成功/, label: "ランナー:盗塁成功" },
    { kind: "CS", re: /ランナー\s*([^\s:：]+)\s*[:：]\s*(盗塁死|盗塁失敗)/, label: "ランナー:盗塁死/失敗" },
  ]

  let seq = 0
  for (const sec of sections) {
    const inningHalf = inningHalfFromSectionTitle(sec.sectionTitle)
    for (const line of sec.lines ?? []) {
      const s = String(line ?? "")
      for (const p of patterns) {
        const m = s.match(p.re)
        if (!m) continue
        const rawName = String(m[1] ?? "")
        const key = normalizeJaNameKey(rawName)
        const yid = nameToId.get(key)
        if (!yid) continue
        seq += 1
        out.push({
          eventId: `${doc.gameId}-runner-${seq}`,
          inningHalf,
          kind: p.kind,
          yahooRunnerId: yid,
          runnerNameJa: rawName.trim() || undefined,
          sourceLine: s.trim() || undefined,
          sourceTier: "textPbp",
        })
      }
    }
  }
  return out
}

