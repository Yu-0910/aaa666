/** 捕手タブ「基本成績」: 投手別 splits の合算から被打指標を算出（投手 PoC と同一定義） */



import { formatRankingStatDisplay } from "@/lib/formatStat"



export type PitcherAgainstCountTotals = {

  bf: number

  h: number

  hr: number

  so: number

  bb: number

  hbp: number

}



const na = "—"



export function obpAgainstRatioFromCounts(c: PitcherAgainstCountTotals): number | null {

  if (c.bf <= 0) return null

  return (c.h + c.bb + c.hbp) / c.bf

}



export function babipAgainstRatioFromCounts(c: PitcherAgainstCountTotals): number | null {

  const abApprox = c.bf - c.bb - c.hbp

  if (abApprox <= 0) return null

  const denom = abApprox - c.so - c.hr

  if (denom <= 0) return null

  return (c.h - c.hr) / denom

}



export function slgAgainstRatioFromCounts(c: PitcherAgainstCountTotals): number | null {

  const abApprox = c.bf - c.bb - c.hbp

  if (abApprox <= 0) return null

  const tbMin = c.h + 3 * c.hr

  return tbMin / abApprox

}



export function formatObpAgainstFromCounts(c: PitcherAgainstCountTotals): string {

  const v = obpAgainstRatioFromCounts(c)

  return v == null ? na : formatRankingStatDisplay("被出塁率", v)

}



export function formatBabipAgainstFromCounts(c: PitcherAgainstCountTotals): string {

  const v = babipAgainstRatioFromCounts(c)

  return v == null ? na : formatRankingStatDisplay("被BABIP", v)

}



export function formatSlgAgainstFromCounts(c: PitcherAgainstCountTotals): string {

  const v = slgAgainstRatioFromCounts(c)

  return v == null ? na : formatRankingStatDisplay("被長打率", v)

}



export function formatGoAoFromBattedBallOuts(ground: number, air: number): string {

  if (air > 0) return (ground / air).toFixed(2)

  return na

}



/** 9イニング当たりのパスボール（捕逸含む）。母数は背後回数（アウト数） */

export function pbPer9FromCounts(pb: number, ipOuts: number): number | null {

  if (ipOuts <= 0) return null

  return (pb * 27) / ipOuts

}



export function formatPbPer9FromCounts(pb: number, ipOuts: number): string {

  const v = pbPer9FromCounts(pb, ipOuts)

  return v == null ? na : v.toFixed(2)

}


