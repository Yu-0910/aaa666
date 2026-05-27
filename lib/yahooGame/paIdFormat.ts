/**
 * canonical `paId` の形式（SSOT）。
 *
 * `{gameId}-{inning}-{表|裏}-{paSeqInHalf}`
 *
 * - **paSeqInHalf** … その半回（表/裏）における **打席の通し番号**（1 始まり）。
 *   Yahoo 一球 `score?index=` のキー（Phase10 行の `bat_order`）および
 *   `textPlayByPlay` 行頭の「`N：`」の **N** と一致する。
 * - **打順（1〜9番のスタメン位置）ではない。**
 *   例: `2021038681-4-表-6` = 4回表の **6番目の打席**（1番・桑原のけん制盗塁死）。
 *   外崎の 6番打者 HR は **`4-表-2`**（2番目の打席）に `pitchEvents` がある。
 */

export type ParsedPaId = {
  gameId: string
  inning: number
  half: "表" | "裏"
  /** 半回内打席通し番号（打順ではない） */
  paSeqInHalf: number
  raw: string
}

const PAID_RE = /^(\d+)-(\d+)-(表|裏)-(\d+)$/

export function parsePaId(paId: string): ParsedPaId | null {
  const m = String(paId ?? "").trim().match(PAID_RE)
  if (!m) return null
  return {
    gameId: m[1]!,
    inning: Number(m[2]),
    half: m[3] as "表" | "裏",
    paSeqInHalf: Number(m[4]),
    raw: String(paId).trim(),
  }
}

export function buildPaId(
  gameId: string,
  inning: number,
  half: "表" | "裏",
  paSeqInHalf: number,
): string {
  return `${gameId}-${inning}-${half}-${paSeqInHalf}`
}

/** `score?index=` の 7 桁プレフィックス（例: 4回表6番目 → `0410600`） */
export function paSeqInHalfToScoreIndexPrefix(
  inning: number,
  half: "表" | "裏",
  paSeqInHalf: number,
): string {
  const tb = half === "表" ? "1" : "2"
  return `${String(inning).padStart(2, "0")}${tb}${String(paSeqInHalf).padStart(2, "0")}00`
}

/** 文字列 sort だと 11回が 2回より前に来るため、構造化比較 */
export function comparePaIdChronological(a: string, b: string): number {
  const pa = parsePaId(a)
  const pb = parsePaId(b)
  if (!pa || !pb) return String(a).localeCompare(String(b), "ja")
  if (pa.inning !== pb.inning) return pa.inning - pb.inning
  if (pa.half !== pb.half) return pa.half.localeCompare(pb.half, "ja")
  return pa.paSeqInHalf - pb.paSeqInHalf
}
