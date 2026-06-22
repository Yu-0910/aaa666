import { describe, expect, it } from "vitest"
import { matchupOpponentDisplayNameJa } from "./playerNameNormalize"

describe("matchupOpponentDisplayNameJa", () => {
  it("漢字を含む日本人名はそのまま", () => {
    expect(matchupOpponentDisplayNameJa("菅野智之")).toBe("菅野智之")
    expect(matchupOpponentDisplayNameJa("金子京介")).toBe("金子京介")
  })

  it("漢字とアルファベットの複合登録名はアルファベットを残す", () => {
    expect(matchupOpponentDisplayNameJa("GG佐藤")).toBe("GG佐藤")
    expect(matchupOpponentDisplayNameJa("T-岡田")).toBe("T-岡田")
    expect(matchupOpponentDisplayNameJa("Ｔ-岡田")).toBe("Ｔ-岡田")
  })

  it("外国人登録名はイニシャルとドットを除く", () => {
    expect(matchupOpponentDisplayNameJa("Ｔ．ハーン")).toBe("ハーン")
    expect(matchupOpponentDisplayNameJa("Ａ．ジャクソン")).toBe("ジャクソン")
    expect(matchupOpponentDisplayNameJa("Ｊ．ルイーズ")).toBe("ルイーズ")
  })

  it("カタカナのみの外国人名はそのまま", () => {
    expect(matchupOpponentDisplayNameJa("キャベッジ")).toBe("キャベッジ")
    expect(matchupOpponentDisplayNameJa("モイセエフ・ニキータ")).toBe("モイセエフ・ニキータ")
  })
})
