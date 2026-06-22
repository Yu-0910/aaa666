import { describe, expect, it } from "vitest"
import type { PitchEvent } from "./types"
import {
  advanceBs,
  countBeforeLastPitch,
  countBeforePitchAtIndex,
  ORDERED_PITCH_COUNT_KEYS,
} from "./pitchCountSim"

function pe(results: string[]): PitchEvent[] {
  return results.map((resultJa, pitchIndex) => ({ pitchIndex, resultJa }))
}

describe("countBeforePitchAtIndex (Phase 32 SSOT)", () => {
  it("1 球のみ → 0-0", () => {
    const events = pe(["空振り"])
    expect(countBeforePitchAtIndex(events, 0)).toBe("0-0")
    expect(countBeforeLastPitch(events)).toBe("0-0")
  })

  it("2 ストライク後ファウル → カウント不変", () => {
    const events = pe(["見逃し", "空振り", "ファウル", "ファウル"])
    expect(countBeforePitchAtIndex(events, 2)).toBe("0-2")
    expect(countBeforePitchAtIndex(events, 3)).toBe("0-2")
  })

  it("ボール 4 球目直前 → 3-0", () => {
    const events = pe(["ボール", "ボール", "ボール", "ボール"])
    expect(countBeforePitchAtIndex(events, 3)).toBe("3-0")
  })

  it("countBeforeLastPitch は最終球直前と一致", () => {
    const events = pe(["ボール", "見逃し", "空振り", "ゴロ"])
    const last = events.length - 1
    expect(countBeforeLastPitch(events)).toBe(countBeforePitchAtIndex(events, last))
  })

  it("ORDERED_PITCH_COUNT_KEYS は 12 件", () => {
    expect(ORDERED_PITCH_COUNT_KEYS).toHaveLength(12)
    expect(ORDERED_PITCH_COUNT_KEYS[0]).toBe("0-0")
    expect(ORDERED_PITCH_COUNT_KEYS[11]).toBe("3-2")
  })

  it("advanceBs: 2 ストライク後ファウルは s=2 のまま", () => {
    expect(advanceBs(0, 2, "ファウル")).toEqual({ b: 0, s: 2 })
  })
})
