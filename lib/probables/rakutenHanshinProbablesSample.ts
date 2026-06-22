import type {
  TopProbablesCard,
  TopProbablesGame,
  TopProbablesOpponentBatter,
  TopProbablesPitcherSlot,
} from "@/lib/probables/types"

export function isRakutenHanshinCard(card: TopProbablesCard): boolean {
  const codes = new Set(card.teamCodes)
  return codes.has("E") && codes.has("H")
}

const SAMPLE_VS_RAKUTEN: TopProbablesOpponentBatter[] = [
  {
    opponentName: "浅村 栄斗",
    opponentPublicId: "11015157",
    ops: "1.250",
    avg: ".385",
    hr: 2,
    ab: 13,
  },
  {
    opponentName: "阿部 寿樹",
    opponentPublicId: "61165132",
    ops: "1.000",
    avg: ".333",
    hr: 1,
    ab: 12,
  },
  {
    opponentName: "銀次",
    opponentPublicId: "21325136",
    ops: ".875",
    avg: ".286",
    hr: 0,
    ab: 14,
  },
]

const SAMPLE_VS_HANSHIN: TopProbablesOpponentBatter[] = [
  {
    opponentName: "佐藤 輝明",
    opponentPublicId: "41045153",
    ops: "1.083",
    avg: ".333",
    hr: 3,
    ab: 15,
  },
  {
    opponentName: "近本 光司",
    opponentPublicId: "01005157",
    ops: ".958",
    avg: ".310",
    hr: 1,
    ab: 18,
  },
  {
    opponentName: "髙寺 望夢",
    opponentPublicId: "61565150",
    ops: ".750",
    avg: ".250",
    hr: 0,
    ab: 8,
  },
]

const SAMPLE_PITCHER_BY_DATE: Record<
  string,
  { homePitcherNameJa?: string; awayPitcherNameJa?: string }
> = {
  "2026-06-16": { awayPitcherNameJa: "早川隆久" },
  "2026-06-18": { homePitcherNameJa: "岩貞", awayPitcherNameJa: "前田健太" },
}

function sampleOpponentsForPitcher(slot: TopProbablesPitcherSlot): TopProbablesOpponentBatter[] {
  return slot.teamCode === "H" ? SAMPLE_VS_RAKUTEN : SAMPLE_VS_HANSHIN
}

function withSamplePitcherSlot(
  slot: TopProbablesPitcherSlot | null,
  samplePitcherNameJa: string | undefined,
): TopProbablesPitcherSlot | null {
  if (!slot) return null

  const pitcherNameJa = slot.pitcherNameJa ?? samplePitcherNameJa ?? null
  if (!pitcherNameJa) return slot

  const topOpponentBatters =
    slot.topOpponentBatters.length > 0 ? slot.topOpponentBatters : sampleOpponentsForPitcher(slot)

  return {
    ...slot,
    pitcherNameJa,
    topOpponentBatters,
  }
}

function withSampleGame(game: TopProbablesGame): TopProbablesGame {
  const samplePitchers = SAMPLE_PITCHER_BY_DATE[game.dateJst] ?? {}

  return {
    ...game,
    homeProbable: withSamplePitcherSlot(game.homeProbable, samplePitchers.homePitcherNameJa),
    awayProbable: withSamplePitcherSlot(game.awayProbable, samplePitchers.awayPitcherNameJa),
  }
}

/** 楽天 vs 阪神カードの空枠を、本番 JSON と同形式のサンプルで埋める（UI プレビュー用） */
export function withRakutenHanshinProbablesSample(card: TopProbablesCard): TopProbablesCard {
  if (!isRakutenHanshinCard(card)) return card
  return {
    ...card,
    games: card.games.map(withSampleGame),
  }
}
