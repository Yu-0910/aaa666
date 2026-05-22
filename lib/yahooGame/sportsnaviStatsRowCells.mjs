/**
 * Sportsnavi 出場成績 `<tr>` の `<td>` から cells[] を組み立てる。
 * `sportsnaviStatsTextParse.mjs` の `parseSportsnaviStatsHtml` と同期すること。
 *
 * 同一イニングに複数打席があるとき、1つの `<td>` 内に `bb-statsTable__dataDetail` が複数並ぶ。
 * 旧実装は `<td>` 全体を stripTags して 1 セルに潰していた（例: "中飛 空三振"）。
 */

const DATA_DETAIL_OPEN = "<div"
const DATA_DETAIL_CLOSE = "</" + "div>"

/** @param {string} inner */
export function extractDataDetailTextsFromTdInner(inner) {
  /** @type {string[]} */
  const out = []
  const detailRe = new RegExp(
    DATA_DETAIL_OPEN + "[^>]*\\bbb-statsTable__dataDetail\\b[^>]*>([\\s\\S]*?)" + DATA_DETAIL_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "gi",
  )
  let dm
  while ((dm = detailRe.exec(inner)) !== null) {
    out.push(dm[1] ?? "")
  }
  return out
}

/** @param {string} attrs `<td ...>` の属性部分 */
export function isInningAppearanceStatsTd(attrs) {
  return /\bbb-statsTable__data--inning\b/.test(String(attrs ?? ""))
}

/**
 * 1 つの `<td>` を 1 個以上の stat セル文字列に展開する。
 * @param {string} attrs
 * @param {string} inner
 * @param {(html: string) => string} stripTags
 */
export function statCellEntriesFromTd(attrs, inner, stripTags) {
  const norm = (html) => stripTags(html).replace(/\s+/g, " ").trim()
  if (!isInningAppearanceStatsTd(attrs)) {
    return [norm(inner)]
  }
  const rawDetails = extractDataDetailTextsFromTdInner(inner)
  if (rawDetails.length === 0) return [""]
  return rawDetails.map((chunk) => norm(chunk))
}

/**
 * 打者行の `<td>` 列（選手リンク列の次から）を cells 用 stat 配列に平坦化する。
 * @param {{ attrs: string, inner: string }[]} tdParts
 * @param {number} playerIdx
 * @param {(html: string) => string} stripTags
 */
export function buildStatCellsFromTdParts(tdParts, playerIdx, stripTags) {
  /** @type {string[]} */
  const statCells = []
  for (let i = playerIdx + 1; i < tdParts.length; i++) {
    const { attrs, inner } = tdParts[i]
    statCellEntriesFromTd(attrs, inner, stripTags).forEach((cell) => statCells.push(cell))
  }
  return statCells
}
