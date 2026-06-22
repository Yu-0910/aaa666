import { describe, expect, it } from "vitest"
import {
  FUTAMATA_SITUATION_REF_2026,
  rispAbFromFutamataSituationRef,
} from "./sportsnaviFutamataSituationRef"

describe("FUTAMATA_SITUATION_REF_2026", () => {
  it("得点圏 AB は なし・1塁 以外の打数合算と一致する", () => {
    expect(rispAbFromFutamataSituationRef(FUTAMATA_SITUATION_REF_2026)).toBe(7)
  })

  it("全塁状況の打数合算は 43", () => {
    const totalAb = Object.values(FUTAMATA_SITUATION_REF_2026).reduce((s, r) => s + r.ab, 0)
    expect(totalAb).toBe(43)
  })
})
