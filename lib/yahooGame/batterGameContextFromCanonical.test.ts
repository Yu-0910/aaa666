import { describe, expect, it } from "vitest"
import {
  contextFromInningHalf,
  vsTeamSplitValueToTeamCode,
} from "./batterGameContextFromCanonical"
import type { CanonicalGameDocument } from "./types"

function minimalDoc(overrides: Partial<CanonicalGameDocument> = {}): CanonicalGameDocument {
  return {
    gameId: "2026032801",
    game: {
      scoreboard: [
        { teamName: "阪神タイガース" },
        { teamName: "読売ジャイアンツ" },
      ],
      teams: [],
    },
    domain: {
      plateAppearances: [],
      battingLines: [],
    },
    ...overrides,
  } as CanonicalGameDocument
}

describe("vsTeamSplitValueToTeamCode", () => {
  it("maps scoreboard team name to team code", () => {
    expect(vsTeamSplitValueToTeamCode("vs_読売ジャイアンツ")).toBe("G")
    expect(vsTeamSplitValueToTeamCode("vs_阪神タイガース")).toBe("H")
    expect(vsTeamSplitValueToTeamCode("vs_福岡ソフトバンクホークス")).toBe("Hs")
  })
})

describe("contextFromInningHalf", () => {
  it("visitor top half faces home team", () => {
    const doc = minimalDoc()
    const ctx = contextFromInningHalf(doc, "1表", new Map())
    expect(ctx?.vsTeamValue).toBe("vs_読売ジャイアンツ")
    expect(ctx?.homeAway).toBe("visitor")
    expect(vsTeamSplitValueToTeamCode(ctx!.vsTeamValue)).toBe("G")
  })

  it("home bottom half faces visitor team", () => {
    const doc = minimalDoc()
    const ctx = contextFromInningHalf(doc, "1裏", new Map())
    expect(ctx?.vsTeamValue).toBe("vs_阪神タイガース")
    expect(ctx?.homeAway).toBe("home")
    expect(vsTeamSplitValueToTeamCode(ctx!.vsTeamValue)).toBe("H")
  })
})
