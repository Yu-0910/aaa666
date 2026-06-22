import { describe, expect, it } from "vitest"
import {
  HIRAKAWA_SITUATION_REF_2026,
  rispAbFromSituationRef,
} from "./sportsnaviHirakawaSituationRef"

describe("HIRAKAWA_SITUATION_REF_2026", () => {
  it("得点圏 AB は なし・1塁 以外の打数合算と一致する", () => {
    expect(rispAbFromSituationRef(HIRAKAWA_SITUATION_REF_2026)).toBe(24)
  })

  it("全塁状況の打数合算は 95", () => {
    const totalAb = Object.values(HIRAKAWA_SITUATION_REF_2026).reduce((s, r) => s + r.ab, 0)
    expect(totalAb).toBe(95)
  })
})
