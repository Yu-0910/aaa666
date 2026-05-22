/**
 * 打率・出塁率・長打率など `.xxx` 表記。
 *
 * NPB / Yahoo 公式と同型: **第4位小数を四捨五入して第3位まで表示**。
 * H/AB 系は `round(分子 × 1000 / 分母) / 1000` の整数演算で求め、
 * `23/80` が浮動小数で 0.287499… になり `.287` になる誤差を避ける。
 *
 * **OPS**: 表示用に丸めた OBP・SLG を足さない。
 * `(H+BB+HBP)/(AB+BB+HBP+SF) + TB/AB` を実数で足してから第4位四捨五入（Yahoo 対チーム表と同型）。
 */

export function parseSlash3(s: string): number {
  const t = (s ?? "").trim()
  if (!t || t === "—") return 0
  return parseFloat(t.startsWith(".") ? `0${t}` : t)
}

/** 分子/分母から率を .xxx に（分母0は .000） */
export function slashRate3FromCounts(numerator: number, denominator: number): string {
  if (denominator <= 0) return ".000"
  const scaled = Math.round((numerator * 1000) / denominator)
  const s = (scaled / 1000).toFixed(3)
  return s.startsWith("0") ? s.slice(1) : s
}

/** 既に求まった率（OPS 合成など）を .xxx に */
export function slashRate3FromRatio(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return ".000"
  const scaled = Math.round(rate * 10000)
  const s = (scaled / 10000).toFixed(3)
  return s.startsWith("0") ? s.slice(1) : s
}

/** カウントから OPS（未丸め OBP+SLG を一度だけ四捨五入） */
export function slashOps3FromCounts(input: {
  h: number
  ab: number
  tb: number
  bb: number
  hbp: number
  sf: number
}): string {
  const obpNum = input.h + input.bb + input.hbp
  const obpDen = input.ab + input.bb + input.hbp + input.sf
  const obpRatio = obpDen > 0 ? obpNum / obpDen : 0
  const slgRatio = input.ab > 0 ? input.tb / input.ab : 0
  return slashRate3FromRatio(obpRatio + slgRatio)
}

/**
 * @deprecated 表示済み OBP/SLG の足し算（.389+.462→.851 になり Yahoo とズレる）。
 * 新規コードは `slashOps3FromCounts` を使う。
 */
export function slashOps3FromObpSlg(obp: string, slg: string): string {
  return slashRate3FromRatio(parseSlash3(obp) + parseSlash3(slg))
}

export function battingSlashRatesFromCounts(input: {
  h: number
  ab: number
  tb: number
  bb: number
  hbp: number
  sf: number
}): { avg: string; obp: string; slg: string; ops: string } {
  const obpNum = input.h + input.bb + input.hbp
  const obpDen = input.ab + input.bb + input.hbp + input.sf
  const obp = slashRate3FromCounts(obpNum, obpDen)
  const slg = slashRate3FromCounts(input.tb, input.ab)
  const avg = slashRate3FromCounts(input.h, input.ab)
  const ops = slashOps3FromCounts(input)
  return { avg, obp, slg, ops }
}

/** @deprecated 率の実数値のみ渡す旧 API。可能なら slashRate3FromCounts を使う */
export function fmtSlash3(rate: number | null): string {
  return slashRate3FromRatio(rate)
}
