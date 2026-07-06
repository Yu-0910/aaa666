const teamNameToCode: Record<string, string> = {
  阪神: "H",
  阪神タイガース: "H",
  巨人: "G",
  読売ジャイアンツ: "G",
  DeNA: "DB",
  横浜DeNAベイスターズ: "DB",
  広島: "C",
  広島東洋カープ: "C",
  中日: "D",
  中日ドラゴンズ: "D",
  ヤクルト: "S",
  東京ヤクルトスワローズ: "S",
  オリックス: "Bs",
  "オリックス・バファローズ": "Bs",
  ロッテ: "M",
  千葉ロッテマリーンズ: "M",
  日本ハム: "F",
  北海道日本ハムファイターズ: "F",
  楽天: "E",
  東北楽天ゴールデンイーグルス: "E",
  西武: "L",
  埼玉西武ライオンズ: "L",
  ソフトバンク: "Hs",
  福岡ソフトバンクホークス: "Hs",
}

export function rankingTeamCodeFromLabel(team: string): string {
  const t = String(team ?? "").trim()
  if (teamNameToCode[t]) return teamNameToCode[t]
  for (const [name, code] of Object.entries(teamNameToCode)) {
    if (t.includes(name) || name.includes(t)) return code
  }
  return t
}

function normalizeNpbId(raw: string | undefined): string | undefined {
  const id = String(raw ?? "").trim().replace(/[^\d]/g, "")
  return id || undefined
}

/**
 * クライアント共有版:
 * ランキング JSON に NPB ID が明示されている場合のみ採用する。
 * 追加の名簿/橋渡し解決は server 側 helper に寄せる。
 */
export function resolveRankingNpbPlayerId(opts: {
  name: string
  team: string
  playerId?: string
  explicitNpb?: string
}): string | undefined {
  return normalizeNpbId(opts.explicitNpb)
}
