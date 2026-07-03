import { compactPlayerName, rosterNameMatchKey } from "@/lib/playerNameNormalize"

const OFFICIAL_ROMAN_BY_NPB_ID: Record<string, string> = {
  "11913885": "Ichiro",
  "31735119": "G.G.Sato",
  "01903828": "Higashio Osamu",
  "1903828": "Higashio Osamu",
  "13515135": "Brad Eldred",
}

const OFFICIAL_ROMAN_BY_NAME: Record<string, string> = {
  イチロー: "Ichiro",
  "G.G.佐藤": "G.G.Sato",
  "Ｇ．Ｇ．佐藤": "G.G.Sato",
  "東尾修": "Higashio Osamu",
  "東尾　修": "Higashio Osamu",
  "東尾 修": "Higashio Osamu",
  "B.エルドレッド": "Brad Eldred",
}

function normalizeNpbId(id: string | null | undefined): string {
  return String(id ?? "").replace(/\D/g, "")
}

function nameKeys(name: string | null | undefined): string[] {
  const raw = String(name ?? "").trim()
  if (!raw) return []
  const keys = new Set<string>()
  keys.add(raw)
  keys.add(raw.normalize("NFKC"))
  keys.add(compactPlayerName(raw))
  keys.add(rosterNameMatchKey(raw))
  return [...keys].filter(Boolean)
}

export function resolveOfficialRomanOverride(input: {
  npbPlayerId?: string | null
  name?: string | null
}): string | undefined {
  const id = normalizeNpbId(input.npbPlayerId)
  if (id) {
    const byExactId = OFFICIAL_ROMAN_BY_NPB_ID[id]
    if (byExactId) return byExactId
    const withoutLeadingZero = id.replace(/^0+/, "") || "0"
    const byNormalizedId = OFFICIAL_ROMAN_BY_NPB_ID[withoutLeadingZero]
    if (byNormalizedId) return byNormalizedId
  }

  for (const key of nameKeys(input.name)) {
    const byName = OFFICIAL_ROMAN_BY_NAME[key]
    if (byName) return byName
  }
  return undefined
}

export function withOfficialRomanOverride(input: {
  romanName?: string | null
  npbPlayerId?: string | null
  name?: string | null
}): string {
  return (
    resolveOfficialRomanOverride({
      npbPlayerId: input.npbPlayerId,
      name: input.name,
    }) ?? String(input.romanName ?? "").trim()
  )
}
