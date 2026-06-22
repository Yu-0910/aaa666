import { describe, expect, it } from "vitest"
import {
  KIKUCHI_SITUATION_REF_2026,
  rispAbFromKikuchiSituationRef,
} from "./sportsnaviKikuchiSituationRef"

describe("KIKUCHI_SITUATION_REF_2026", () => {
  it("得点圏 AB は なし・1塁 以外の打数合算と一致する", () => {
    expect(rispAbFromKikuchiSituationRef(KIKUCHI_SITUATION_REF_2026)).toBe(26)
  })

  it("全塁状況の打数合算は 155", () => {
    const totalAb = Object.values(KIKUCHI_SITUATION_REF_2026).reduce((s, r) => s + r.ab, 0)
    expect(totalAb).toBe(155)
  })
})
