import { describe, expect, it } from "vitest"
import {
  basesBeforeForPlateAppearanceHybrid,
  applyMidPaStealChainOverride,
  applyTextScoreConflictOverride,
  basesBeforeFromScoreHybrid,
} from "./basesFromSportsnaviPlayLine"
import type { PlateAppearance } from "./types"

describe("basesBeforeFromScoreHybrid", () => {
  it("maps score entry r1-only to r2 (no-text pilot)", () => {
    expect(
      basesBeforeFromScoreHybrid({
        firstClass: { r1: true, r2: false, r3: false },
        chainStart: { r1: true, r2: true, r3: false },
        firstEm: null,
        lastClass: null,
      }),
    ).toEqual({ r1: false, r2: true, r3: false })
  })

  it("uses chain when first is not r1-only", () => {
    expect(
      basesBeforeFromScoreHybrid({
        firstClass: { r1: true, r2: true, r3: false },
        chainStart: { r1: true, r2: true, r3: false },
        firstEm: null,
        lastClass: null,
      }),
    ).toEqual({ r1: true, r2: true, r3: false })
  })

  it("uses chain for empty bases", () => {
    expect(
      basesBeforeFromScoreHybrid({
        firstClass: { r1: false, r2: false, r3: false },
        chainStart: { r1: false, r2: false, r3: false },
        firstEm: null,
        lastClass: null,
      }),
    ).toEqual({ r1: false, r2: false, r3: false })
  })
})

describe("basesBeforeForPlateAppearanceHybrid", () => {
  it("uses chain r2 when text is 無死一塁 and chain/last are r2-only (8842-7)", () => {
    const bases = basesBeforeForPlateAppearanceHybrid(
      { paId: "2021038842-7-裏-2", yahooBatterId: "2110164" },
      "2： 1番 平川 蓮 無死一塁 空振り三振",
      {
        firstClass: { r1: true, r2: false, r3: false },
        chainStart: { r1: false, r2: true, r3: false },
        firstEm: null,
        lastClass: { r1: false, r2: true, r3: false },
      },
    )
    expect(bases).toEqual({ r1: false, r2: true, r3: false })
  })

  it("keeps text r1 when chain/last are r2 but token is 二死一塁 (8782-2)", () => {
    const bases = basesBeforeForPlateAppearanceHybrid(
      { paId: "2021038782-2-表-4", yahooBatterId: "2110164" },
      "4： 7番 平川 蓮 二死一塁 二ゴロ",
      {
        firstClass: { r1: true, r2: false, r3: false },
        chainStart: { r1: false, r2: true, r3: false },
        firstEm: null,
        lastClass: { r1: false, r2: true, r3: false },
      },
    )
    expect(bases).toEqual({ r1: true, r2: false, r3: false })
  })

  it("keeps text r1 when 無死一塁 but last is r1-only (8776-4)", () => {
    const bases = basesBeforeForPlateAppearanceHybrid(
      { paId: "2021038776-4-表-2", yahooBatterId: "2110164" },
      "2： 7番 平川 蓮 無死一塁 四球",
      {
        firstClass: { r1: true, r2: false, r3: false },
        chainStart: { r1: false, r2: true, r3: false },
        firstEm: null,
        lastClass: { r1: true, r2: false, r3: false },
      },
    )
    expect(bases).toEqual({ r1: true, r2: false, r3: false })
  })

  it("keeps text r1 when chain is r12 not r2-only (8752-7)", () => {
    const bases = basesBeforeForPlateAppearanceHybrid(
      { paId: "2021038752-7-裏-3", yahooBatterId: "2110164" },
      "3： 1番 平川 蓮 一死一塁 左安",
      {
        firstClass: { r1: true, r2: false, r3: false },
        chainStart: { r1: true, r2: true, r3: false },
        firstEm: null,
        lastClass: { r1: true, r2: false, r3: false },
      },
    )
    expect(bases).toEqual({ r1: true, r2: false, r3: false })
  })

  it("keeps text r1 when baseBefore set but chain is not r2-only (8962-2)", () => {
    const pa: PlateAppearance = {
      paId: "2021038962-2-裏-4",
      yahooBatterId: "2110164",
      baseBefore: { r1: "1", r2: null, r3: null },
    }
    const bases = basesBeforeForPlateAppearanceHybrid(
      pa,
      "4： 7番 平川 蓮 一死一塁 右安",
      {
        firstClass: { r1: true, r2: false, r3: false },
        chainStart: { r1: true, r2: true, r3: false },
        firstEm: null,
        lastClass: { r1: true, r2: false, r3: false },
      },
    )
    expect(bases).toEqual({ r1: true, r2: false, r3: false })
  })

  it("uses chain r2 for pinch-hit line when chain/last are r2-only", () => {
    const bases = basesBeforeForPlateAppearanceHybrid(
      { paId: "2021038852-10-表-3", yahooBatterId: "2110164" },
      "3： 代打 平川 蓮 一死一塁 ボテボテのキャッチャーゴロ 2アウト二塁",
      {
        firstClass: { r1: true, r2: false, r3: false },
        chainStart: { r1: false, r2: true, r3: false },
        firstEm: null,
        lastClass: { r1: false, r2: true, r3: false },
      },
    )
    expect(bases).toEqual({ r1: false, r2: true, r3: false })
  })

  it("falls back to score hybrid when play line is empty", () => {
    const bases = basesBeforeForPlateAppearanceHybrid(
      { paId: "2021038962-10-裏-4", yahooBatterId: "2110164" },
      "",
      {
        firstClass: { r1: true, r2: false, r3: false },
        chainStart: { r1: true, r2: true, r3: false },
        firstEm: null,
        lastClass: null,
      },
    )
    expect(bases).toEqual({ r1: false, r2: true, r3: false })
  })
})

describe("applyTextScoreConflictOverride", () => {
  it("prefers chain r2 for 無死一塁 when chain and last are r2-only", () => {
    expect(
      applyTextScoreConflictOverride(
        { r1: true, r2: false, r3: false },
        "2： 1番 平川 蓮 無死一塁",
        { paId: "x" },
        {
          firstClass: { r1: true, r2: false, r3: false },
          chainStart: { r1: false, r2: true, r3: false },
          firstEm: null,
        lastClass: { r1: false, r2: true, r3: false },
        },
      ),
    ).toEqual({ r1: false, r2: true, r3: false })
  })

  it("keeps r1 for 二死一塁 even when chain/last are r2-only", () => {
    expect(
      applyTextScoreConflictOverride(
        { r1: true, r2: false, r3: false },
        "4： 7番 平川 二死一塁",
        { paId: "x" },
        {
          firstClass: { r1: true, r2: false, r3: false },
          chainStart: { r1: false, r2: true, r3: false },
          firstEm: null,
        lastClass: { r1: false, r2: true, r3: false },
        },
      ),
    ).toEqual({ r1: true, r2: false, r3: false })
  })

  it("uses firstEm r3 for text r2 sac fly when chain/em are r3-only (8920-6)", () => {
    expect(
      applyTextScoreConflictOverride(
        { r1: false, r2: true, r3: false },
        "3： 3番 菊池 涼介 一死二塁 二塁走者 大盛 :盗塁成功 三塁 1アウト1-2からレフトへの犠牲フライ",
        { paId: "2021038920-6-裏-3" },
        {
          firstClass: { r1: false, r2: true, r3: false },
          chainStart: { r1: false, r2: false, r3: true },
          firstEm: { r1: false, r2: false, r3: true },
          lastClass: { r1: false, r2: false, r3: true },
        },
      ),
    ).toEqual({ r1: false, r2: false, r3: true })
  })

  it("uses none for r1 text steal-then-walk when chain is r2-only (8734-3)", () => {
    expect(
      applyTextScoreConflictOverride(
        { r1: true, r2: false, r3: false },
        "3： 2番 菊池 涼介 一死一塁 一塁走者 大盛 :盗塁成功 二塁 フォアボール",
        { paId: "2021038734-3-裏-3" },
        {
          firstClass: { r1: true, r2: false, r3: false },
          chainStart: { r1: false, r2: true, r3: false },
          firstEm: { r1: false, r2: true, r3: false },
          lastClass: { r1: false, r2: true, r3: false },
        },
      ),
    ).toEqual({ r1: false, r2: false, r3: false })
  })

  it("uses none for pickoff-involved double play (8699-1)", () => {
    expect(
      applyTextScoreConflictOverride(
        { r1: true, r2: false, r3: false },
        "2： 2番 菊池 涼介 無死一塁 一塁けん制:ランナー 大盛 帰塁 また一塁けん制:ランナー 大盛 帰塁 内角のストレートを打つもファーストライナー 一塁走者 大盛 は塁を飛び出しておりダブルプレー！ 2アウト",
        { paId: "2021038699-1-表-2" },
        {
          firstClass: { r1: true, r2: false, r3: false },
          chainStart: { r1: true, r2: false, r3: false },
          firstEm: null,
          lastClass: { r1: true, r2: false, r3: false },
        },
      ),
    ).toEqual({ r1: false, r2: false, r3: false })
  })

  it("keeps r1 for 無死一塁 hit to 一二塁 when text and chain disagree on runner count (8624/8817)", () => {
    const scoreCtx = {
      firstClass: { r1: true, r2: false, r3: false },
      chainStart: { r1: true, r2: true, r3: false },
      firstEm: { r1: true, r2: true, r3: false },
      lastClass: { r1: true, r2: false, r3: false },
    }
    for (const paId of ["2021038624-9-裏-2", "2021038817-2-表-2"]) {
      expect(
        applyTextScoreConflictOverride(
          { r1: true, r2: false, r3: false },
          "2： 6番 菊池 涼介 無死一塁 レフトへのヒットを放つ 一二塁",
          { paId },
          scoreCtx,
        ),
      ).toEqual({ r1: true, r2: false, r3: false })
    }
  })
})

describe("applyMidPaStealChainOverride", () => {
  it("uses score chain r23 when text entry is r13 (8752 pilot)", () => {
    expect(
      applyMidPaStealChainOverride(
        { r1: true, r2: false, r3: true },
        {
          firstClass: { r1: true, r2: false, r3: true },
          chainStart: { r1: false, r2: true, r3: true },
          firstEm: null,
        lastClass: null,
        },
      ),
    ).toEqual({ r1: false, r2: true, r3: true })
  })

  it("uses score chain r23 when text entry is r12 (8734-9 pilot)", () => {
    expect(
      applyMidPaStealChainOverride(
        { r1: true, r2: true, r3: false },
        {
          firstClass: { r1: true, r2: true, r3: false },
          chainStart: { r1: false, r2: true, r3: true },
          firstEm: null,
          lastClass: null,
        },
      ),
    ).toEqual({ r1: false, r2: true, r3: true })
  })

  it("uses chain r23 for 8734-9 full hybrid path", () => {
    const bases = basesBeforeForPlateAppearanceHybrid(
      { paId: "2021038734-9-裏-4", yahooBatterId: "2112143" },
      "4： 9番 佐藤 啓介 一死一二塁 堀岡",
      {
        firstClass: { r1: true, r2: true, r3: false },
        chainStart: { r1: false, r2: true, r3: true },
        firstEm: null,
        lastClass: { r1: false, r2: true, r3: true },
      },
    )
    expect(bases).toEqual({ r1: false, r2: true, r3: true })
  })

  it("keeps text r13 when chain is not r23", () => {
    expect(
      applyMidPaStealChainOverride(
        { r1: true, r2: false, r3: true },
        {
          firstClass: { r1: true, r2: false, r3: true },
          chainStart: { r1: false, r2: true, r3: false },
          firstEm: null,
        lastClass: null,
        },
      ),
    ).toEqual({ r1: true, r2: false, r3: true })
  })
})
