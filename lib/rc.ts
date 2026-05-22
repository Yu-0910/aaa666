export type RCNf3Inputs = {
  h: number
  bb: number
  hbp: number
  cs: number
  gidp: number
  tb: number
  sf: number
  sh: number
  sb: number
  so: number
  ab: number
}

/**
 * nf3互換 Runs Created (RC)（Technical RC）
 *
 * C が 0 以下のときは null（表示側は "—" にする）。
 * 丸めは呼び出し側（表示フォーマッタ）に委ねる。
 */
export function calculateRCNf3(i: RCNf3Inputs): number | null {
  const A = i.h + i.bb + i.hbp - i.cs - i.gidp
  const B =
    i.tb +
    0.26 * (i.bb + i.hbp) +
    0.53 * (i.sf + i.sh) +
    0.64 * i.sb -
    0.03 * i.so
  const C = i.ab + i.bb + i.hbp + i.sf + i.sh
  if (!(C > 0)) return null

  // RC = (((A + 2.4 * C) * (B + 3 * C)) / (9 * C)) - (0.9 * C)
  return (((A + 2.4 * C) * (B + 3 * C)) / (9 * C)) - 0.9 * C
}

export type RC27Nf3Inputs = RCNf3Inputs & {
  /** TO = AB - H + SH + SF + CS + GDP */
  to?: number
}

/**
 * nf3互換 RC27
 *
 * TO = AB - H + SH + SF + CS + GDP
 * RC27 = RC * 27 / TO
 *
 * TO が 0 以下、または RC が null のときは null。
 */
export function calculateRC27Nf3(i: RC27Nf3Inputs): number | null {
  const rc = calculateRCNf3(i)
  if (rc == null) return null
  const to =
    typeof i.to === "number" && Number.isFinite(i.to)
      ? i.to
      : i.ab - i.h + i.sh + i.sf + i.cs + i.gidp
  if (!(to > 0)) return null
  return (rc * 27) / to
}
