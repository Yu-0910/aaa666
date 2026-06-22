import { describe, expect, it } from "vitest"
import {
  basesAtResultBallForSituationSplit,
  basesBeforeFromScoreIllustration,
  rbiFromScoreResultHtml,
} from "./basesFromSportsnaviScoreSnapshot"

const ctx8962 = {
  firstEm: { r1: false, r2: true, r3: false },
  firstClass: { r1: true, r2: false, r3: false },
  chainStart: { r1: false, r2: true, r3: false },
  lastClass: { r1: false, r2: true, r3: false },
}

describe("basesBeforeFromScoreIllustration", () => {
  it("prefers firstClass illustration over em and chain when no conflict", () => {
    expect(
      basesBeforeFromScoreIllustration({
        firstEm: { r1: false, r2: true, r3: false },
        firstClass: { r1: true, r2: false, r3: false },
        chainStart: { r1: true, r2: true, r3: false },
        lastClass: null,
      }),
    ).toEqual({ r1: true, r2: false, r3: false })
  })

  it("uses chainStart when class is absent", () => {
    expect(
      basesBeforeFromScoreIllustration({
        firstEm: { r1: false, r2: true, r3: false },
        firstClass: null,
        chainStart: { r1: true, r2: true, r3: false },
        lastClass: null,
      }),
    ).toEqual({ r1: true, r2: true, r3: false })
  })

  it("overrides entry r12 to chain r23 when chain/em/last agree (8734-9裏-4)", () => {
    expect(
      basesBeforeFromScoreIllustration({
        firstEm: { r1: false, r2: true, r3: true },
        firstClass: { r1: true, r2: true, r3: false },
        chainStart: { r1: false, r2: true, r3: true },
        lastClass: { r1: false, r2: true, r3: true },
      }),
    ).toEqual({ r1: false, r2: true, r3: true })
  })

  it("overrides entry r1 to chain r2 (8962-9裏-2)", () => {
    expect(
      basesBeforeFromScoreIllustration(
        ctx8962,
        "2： 代打 平川 蓮 無死一塁 空振り三振",
      ),
    ).toEqual({ r1: false, r2: true, r3: false })
  })

  it("PB on line → r3 not r2 (8636-4裏-3)", () => {
    expect(
      basesBeforeFromScoreIllustration(
        {
          firstEm: { r1: false, r2: true, r3: false },
          firstClass: { r1: true, r2: false, r3: false },
          chainStart: { r1: false, r2: true, r3: false },
          lastClass: { r1: false, r2: true, r3: false },
        },
        "3： 6番 菊池 涼介 一死一塁 石伊 (捕):パスボール 二塁 サードゴロ",
      ),
    ).toEqual({ r1: false, r2: false, r3: true })
  })

  it("steal then walk → none (8734-3裏-3)", () => {
    expect(
      basesBeforeFromScoreIllustration(
        {
          firstEm: { r1: false, r2: true, r3: false },
          firstClass: { r1: true, r2: false, r3: false },
          chainStart: { r1: false, r2: true, r3: false },
          lastClass: { r1: false, r2: true, r3: false },
        },
        "3： 2番 菊池 涼介 一死一塁 盗塁成功 二塁 フォアボール",
      ),
    ).toEqual({ r1: false, r2: false, r3: false })
  })

  it("pickoff DP → none (8699-1表-2)", () => {
    expect(
      basesBeforeFromScoreIllustration(
        {
          firstEm: null,
          firstClass: { r1: true, r2: false, r3: false },
          chainStart: { r1: true, r2: false, r3: false },
          lastClass: { r1: true, r2: false, r3: false },
        },
        "2： 2番 菊池 涼介 無死一塁 けん制 ダブルプレー",
      ),
    ).toEqual({ r1: false, r2: false, r3: false })
  })

  it("walk at 二死一塁 with chain r12 → r3 (8788-6表-4)", () => {
    expect(
      basesBeforeFromScoreIllustration(
        {
          firstEm: { r1: true, r2: true, r3: false },
          firstClass: { r1: true, r2: false, r3: false },
          chainStart: { r1: true, r2: true, r3: false },
          lastClass: { r1: true, r2: false, r3: false },
        },
        "4： 2番 菊池 涼介 二死一塁 フォアボール",
      ),
    ).toEqual({ r1: false, r2: false, r3: true })
  })

  it("hit at 二死一塁 with chain/em r2 → r2 (8852-12表-4)", () => {
    expect(
      basesBeforeFromScoreIllustration(
        {
          firstEm: { r1: false, r2: true, r3: false },
          firstClass: { r1: true, r2: false, r3: false },
          chainStart: { r1: false, r2: true, r3: false },
          lastClass: { r1: true, r2: false, r3: true },
        },
        "4： 2番 菊池 涼介 二死一塁 一塁走者 大盛 :盗塁成功 二塁 ランナー二塁からど真ん中のストレートをレフトへ打ってヒット 一三塁",
      ),
    ).toEqual({ r1: false, r2: true, r3: false })
  })

  it("sac fly with chain/em r3 (8920-6裏-3)", () => {
    expect(
      basesBeforeFromScoreIllustration(
        {
          firstEm: { r1: false, r2: false, r3: true },
          firstClass: { r1: false, r2: true, r3: false },
          chainStart: { r1: false, r2: false, r3: true },
          lastClass: { r1: false, r2: false, r3: true },
        },
        "3： 3番 菊池 涼介 一死二塁 犠牲フライ",
      ),
    ).toEqual({ r1: false, r2: false, r3: true })
  })

  it("returns null when context is missing", () => {
    expect(basesBeforeFromScoreIllustration(null)).toBeNull()
    expect(basesBeforeFromScoreIllustration(undefined)).toBeNull()
  })
})

describe("basesAtResultBallForSituationSplit", () => {
  it("prefers resultBallClass over pa-start fallback", () => {
    expect(
      basesAtResultBallForSituationSplit(
        {
          firstClass: { r1: true, r2: false, r3: false },
          chainStart: { r1: true, r2: false, r3: false },
          firstEm: null,
          lastClass: { r1: false, r2: false, r3: true },
          resultBallClass: { r1: true, r2: false, r3: false },
        },
        { r1: false, r2: true, r3: false },
      ),
    ).toEqual({ r1: true, r2: false, r3: false })
  })

  it("falls back when resultBallClass is absent", () => {
    expect(
      basesAtResultBallForSituationSplit(
        {
          firstClass: { r1: true, r2: false, r3: false },
          chainStart: null,
          firstEm: null,
          lastClass: null,
          resultBallClass: null,
        },
        { r1: true, r2: false, r3: false },
      ),
    ).toEqual({ r1: true, r2: false, r3: false })
  })
})

describe("rbiFromScoreResultHtml", () => {
  it("parses ＋N点 from batting terminal result span", () => {
    expect(
      rbiFromScoreResultHtml(
        '<div id="result"><span class="red">右安打 ＋1点</span></div>',
      ),
    ).toBe(1)
    expect(
      rbiFromScoreResultHtml(
        '<div id="result"><span class="red">右2塁打 ＋1点</span></div>',
      ),
    ).toBe(1)
    expect(
      rbiFromScoreResultHtml(
        '<div id="result"><span class="red">右中本塁打 ＋3点</span></div>',
      ),
    ).toBe(3)
  })

  it("returns 0 when terminal result has no +点", () => {
    expect(
      rbiFromScoreResultHtml('<div id="result"><span>右2塁打</span></div>'),
    ).toBe(0)
  })

  it("returns null for non-terminal admin span", () => {
    expect(
      rbiFromScoreResultHtml(
        '<div id="result"><span>【代走】二俣→辰見</span></div>',
      ),
    ).toBeNull()
  })
})

describe("isBattingTerminalScoreResultHtml", () => {
  it("accepts walk and rejects pinch-runner follow-up", async () => {
    const { isBattingTerminalScoreResultHtml } = await import("./basesFromSportsnaviScoreSnapshot")
    expect(
      isBattingTerminalScoreResultHtml(
        '<div id="result"><span>四球</span><em>ランナー1塁</em></div>',
      ),
    ).toBe(true)
    expect(
      isBattingTerminalScoreResultHtml(
        '<div id="result"><span>【代走】二俣→辰見</span></div>',
      ),
    ).toBe(false)
  })
})
