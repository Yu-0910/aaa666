/**
 * 打率丸め（第4位小数四捨五入）のスモークテスト。
 *   npx tsx scripts/verify_batting_rate_round.ts
 */
import {
  formatSlashStatDisplay,
  slashRate3FromCounts,
  battingSlashRatesFromCounts,
} from "../lib/battingRateFormat"

const cases: Array<[number, number, string]> = [
  [23, 80, ".288"], // 近藤 対右
  [37, 135, ".274"], // 近藤 通算
  [1, 3, ".333"],
  [0, 0, ".000"],
]

let failed = 0
for (const [h, ab, exp] of cases) {
  const got = slashRate3FromCounts(h, ab)
  if (got !== exp) {
    console.error(`slashRate3FromCounts(${h},${ab}) = ${got}, expected ${exp}`)
    failed++
  }
}

const kondoVsR = battingSlashRatesFromCounts({ h: 23, ab: 80, tb: 54, bb: 19, hbp: 3, sf: 2 })
if (kondoVsR.avg !== ".288") {
  console.error(`近藤対右 avg = ${kondoVsR.avg}, expected .288`)
  failed++
}

// 近藤 対オリックス: OBP .389 + SLG .462 を先に丸めて足すと .851（誤）。実数足しで .850。
const kondoVsOrix = battingSlashRatesFromCounts({ h: 2, ab: 13, tb: 6, bb: 3, hbp: 2, sf: 0 })
if (kondoVsOrix.obp !== ".389" || kondoVsOrix.slg !== ".462" || kondoVsOrix.ops !== ".850") {
  console.error(
    `近藤対オリックス obp/slg/ops = ${kondoVsOrix.obp}/${kondoVsOrix.slg}/${kondoVsOrix.ops}, expected .389/.462/.850`,
  )
  failed++
}

if (formatSlashStatDisplay("0.346") !== ".346") {
  console.error(`formatSlashStatDisplay(0.346) = ${formatSlashStatDisplay("0.346")}`)
  failed++
}
if (formatSlashStatDisplay(1.052) !== "1.052") {
  console.error(`formatSlashStatDisplay(1.052) = ${formatSlashStatDisplay(1.052)}`)
  failed++
}

if (failed > 0) {
  process.exit(1)
}
console.log("[verify_batting_rate_round] OK", cases.length, "cases + 近藤対右・対オリックス OPS")
