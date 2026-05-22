export type XRNf3Inputs = {
  singles: number // 1B
  doubles: number // 2B
  triples: number // 3B
  hr: number
  bb: number
  ibb: number
  hbp: number
  sb: number
  cs: number
  ab: number
  h: number
  so: number
  gidp: number
  sf: number
  sh: number
}

/**
 * nf3互換の Extrapolated Runs (XR)
 *
 * 丸めは呼び出し側（表示フォーマッタ）に委ねる。
 */
export function calculateXRNf3(i: XRNf3Inputs): number {
  return (
    0.5 * i.singles +
    0.72 * i.doubles +
    1.04 * i.triples +
    1.44 * i.hr +
    0.34 * (i.bb + i.hbp - i.ibb) +
    0.25 * i.ibb +
    0.18 * i.sb -
    0.32 * i.cs -
    0.09 * (i.ab - i.h - i.so) -
    0.098 * i.so -
    0.37 * i.gidp +
    0.37 * i.sf +
    0.04 * i.sh
  )
}

