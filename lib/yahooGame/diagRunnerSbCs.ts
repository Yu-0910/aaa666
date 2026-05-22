import type { CanonicalGameDocument } from "./typesCanonical"

type RunnerEventLike = {
  kind: "SB" | "CS"
  yahooRunnerId: string
  inningHalf?: string
  sourceLine?: string
}

function normalizeJaNameKey(s: string): string {
  return String(s ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[.．]/g, "")
}

function buildNameKeyToYahooIdMap(doc: CanonicalGameDocument): Map<string, string> {
  const m = new Map<string, string>()
  const surnameOwner = new Map<string, string | "__conflict__">()
  const ym = (doc.game as { yahooPlayersMentioned?: Record<string, string> } | undefined)?.yahooPlayersMentioned ?? {}
  for (const [id, name] of Object.entries(ym)) {
    const key = normalizeJaNameKey(name)
    const yid = String(id ?? "").trim()
    if (!key || !yid) continue
    if (!m.has(key)) m.set(key, yid)

    const raw = String(name ?? "").trim().normalize("NFKC")
    const tokens = raw.split(/\s+/).filter(Boolean)
    if (tokens.length >= 1) {
      const surnameKey = normalizeJaNameKey(tokens[0]!)
      if (surnameKey) {
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

// `canonicalBattingSeasonAgg.ts` の `sbCsFromTextPlayByPlay` と同等の入力を、
// 「どの行が加算根拠か」まで含めて返すデバッグ用。
export function sbCsFromTextPlayByPlayForDebug(doc: CanonicalGameDocument): RunnerEventLike[] {
  const out: RunnerEventLike[] = []
  const runnerEvents = (doc.domain as { runnerEvents?: Array<{ kind?: string; yahooRunnerId?: string; inningHalf?: string; sourceLine?: string }> })
    ?.runnerEvents

  if (Array.isArray(runnerEvents)) {
    for (const e of runnerEvents) {
      const kind = String(e?.kind ?? "").trim()
      const yahooRunnerId = String(e?.yahooRunnerId ?? "").trim()
      if (!yahooRunnerId) continue
      if (kind !== "SB" && kind !== "CS") continue
      out.push({
        kind,
        yahooRunnerId,
        inningHalf: e?.inningHalf,
        sourceLine: String(e?.sourceLine ?? "").trim() || undefined,
      })
    }
  }

  // textPlayByPlay（sportsnavi由来）の best-effort 抽出。
  const sections = doc.game?.textPlayByPlay ?? []
  if (!Array.isArray(sections) || sections.length === 0) return out

  const nameToId = buildNameKeyToYahooIdMap(doc)
  const patterns: Array<{ kind: RunnerEventLike["kind"]; re: RegExp }> = [
    { kind: "SB", re: /走者\s*([^\s:：]+)\s*[:：]\s*盗塁成功/ },
    { kind: "CS", re: /走者\s*([^\s:：]+)\s*[:：]\s*(盗塁死|盗塁失敗)/ },
    { kind: "SB", re: /ランナー\s*([^\s:：]+)\s*[:：]\s*盗塁成功/ },
    { kind: "CS", re: /ランナー\s*([^\s:：]+)\s*[:：]\s*(盗塁死|盗塁失敗)/ },
    { kind: "CS", re: /[一二三]塁走者\s*([^\s:：]+)\s*[:：]\s*盗塁(?:を)?試みるもアウト/ },
  ]

  for (const sec of sections) {
    for (const line of sec.lines ?? []) {
      const s = String(line ?? "")
      for (const { kind, re } of patterns) {
        const m = s.match(re)
        if (!m) continue
        const nameKey = normalizeJaNameKey(m[1] ?? "")
        const yid = nameToId.get(nameKey)
        if (!yid) continue
        out.push({ kind, yahooRunnerId: yid, inningHalf: sec.sectionTitle, sourceLine: s.trim() })
      }
    }
  }

  return out
}

