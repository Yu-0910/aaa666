import { describe, expect, it } from "vitest"
import {
  SATO_TERUAKI_SITUATION_REF_2026,
  rispAbFromSatoTeruakiSituationRef,
} from "./sportsnaviSatoTeruakiSituationRef"

describe("SATO_TERUAKI_SITUATION_REF_2026", () => {
  it("得点圏 AB は なし・1塁 以外の打数合算と一致する", () => {
    expect(rispAbFromSatoTeruakiSituationRef(SATO_TERUAKI_SITUATION_REF_2026)).toBe(41)
  })

  it("全塁状況の打数合算は 205", () => {
    const totalAb = Object.values(SATO_TERUAKI_SITUATION_REF_2026).reduce((s, r) => s + r.ab, 0)
    expect(totalAb).toBe(205)
  })
})
