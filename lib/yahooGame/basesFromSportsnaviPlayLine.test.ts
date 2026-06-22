import { describe, expect, it } from "vitest"
import {
  basesFromPaBaseBeforeField,
  basesFromSportsnaviSituationToken,
  basesToPaBaseBeforeField,
  extractSportsnaviSituationTokenFromPlayLine,
} from "./basesFromSportsnaviPlayLine"

describe("basesFromSportsnaviSituationToken", () => {
  it("parses compound and empty bases", () => {
    expect(basesFromSportsnaviSituationToken("二死走者なし")).toEqual({
      r1: false,
      r2: false,
      r3: false,
    })
    expect(basesFromSportsnaviSituationToken("二死一二塁")).toEqual({
      r1: true,
      r2: true,
      r3: false,
    })
    expect(basesFromSportsnaviSituationToken("一死二三塁")).toEqual({
      r1: false,
      r2: true,
      r3: true,
    })
    expect(basesFromSportsnaviSituationToken("無死一塁")).toEqual({
      r1: true,
      r2: false,
      r3: false,
    })
  })
})

describe("basesFromPaBaseBeforeField roundtrip", () => {
  it("converts occupancy flags", () => {
    const b = { r1: true, r2: false, r3: true }
    expect(basesFromPaBaseBeforeField(basesToPaBaseBeforeField(b))).toEqual(b)
  })
})

describe("extractSportsnaviSituationTokenFromPlayLine", () => {
  it("extracts token after batter name", () => {
    const line =
      "4： 4番 佐藤 輝明 二死二塁 2アウト二塁の3-0からレフトへのタイムリーヒットで阪神先制！"
    expect(extractSportsnaviSituationTokenFromPlayLine(line)).toBe("二死二塁")
  })

  it("extracts token from pinch-hit line", () => {
    const line =
      "5： 代打 平川 蓮 二死一二塁 ハーン →代打: 平川 空振り三振 3アウト"
    expect(extractSportsnaviSituationTokenFromPlayLine(line)).toBe("二死一二塁")
  })
})
