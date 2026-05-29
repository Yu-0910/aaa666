/**
 * phase2RawCanonicalSync の単体チェック（CSR 空 → raw 更新 → 再ビルド判定）。
 *   node scripts/validate_phase2_raw_canonical_sync_unit.mjs
 */

import assert from "node:assert/strict"
import {
  computePhase2RawFingerprint,
  sportsnaviCanonicalNeedsRebuild,
  preservePhase10DomainOnSportsnaviRebuild,
} from "../lib/yahooGame/phase2RawCanonicalSync.mjs"

const fpA = computePhase2RawFingerprint("main-a", "stats-a", "text-a")
const fpB = computePhase2RawFingerprint("main-b", "stats-a", "text-a")
assert.notEqual(fpA, fpB, "fingerprint should change when main changes")

const thin = {
  sourceCompositeFingerprint: fpA,
  game: {
    statsPlayerLinkedRows: [],
    textPlayByPlay: [],
    missingOrPartial: ["phase2: stats HTML present but no player rows parsed"],
  },
  domain: { battingLines: [], plateAppearances: [{ paId: "x" }] },
  game: {
    statsPlayerLinkedRows: [],
    textPlayByPlay: [],
    missingOrPartial: ["phase2: stats HTML present but no player rows parsed"],
    pitchByPitchNote: { status: "restored_phase10" },
  },
}

// fix thin object - I duplicated game key by mistake in draft
const thinDoc = {
  sourceCompositeFingerprint: fpA,
  game: {
    statsPlayerLinkedRows: [],
    textPlayByPlay: [],
    missingOrPartial: ["phase2: stats HTML present but no player rows parsed"],
    pitchByPitchNote: { status: "restored_phase10" },
  },
  domain: {
    battingLines: [],
    plateAppearances: [{ paId: "2021038856-1-表-1" }],
    pitchEvents: [{ pitchIndex: 1 }],
  },
}

const d1 = sportsnaviCanonicalNeedsRebuild(thinDoc, {
  rawFingerprint: fpB,
  parsedStatsRowCount: 30,
  parsedTextSectionCount: 10,
  gameCancelled: false,
})
assert.equal(d1.rebuild, true)
assert.equal(d1.reason, "raw_fingerprint_changed")

const d2 = sportsnaviCanonicalNeedsRebuild(thinDoc, {
  rawFingerprint: fpA,
  parsedStatsRowCount: 30,
  parsedTextSectionCount: 10,
  gameCancelled: false,
})
assert.equal(d2.rebuild, true)
assert.ok(["stale_empty_stats", "stale_phase2_hint"].includes(d2.reason))

const rebuilt = preservePhase10DomainOnSportsnaviRebuild(
  {
    game: { statsPlayerLinkedRows: [{ yahooPlayerId: "1" }], missingOrPartial: ["phase2: ok"] },
    domain: { plateAppearances: [], battingLines: [{ yahooPlayerId: "1" }] },
  },
  thinDoc,
)
assert.equal(rebuilt.domain.plateAppearances.length, 1)
assert.equal(rebuilt.game.pitchByPitchNote.status, "restored_phase10")

const upToDate = sportsnaviCanonicalNeedsRebuild(
  {
    sourceCompositeFingerprint: fpA,
    game: { statsPlayerLinkedRows: [{}, {}], textPlayByPlay: [{}] },
    domain: { battingLines: [{}] },
  },
  {
    rawFingerprint: fpA,
    parsedStatsRowCount: 2,
    parsedTextSectionCount: 1,
    gameCancelled: false,
  },
)
assert.equal(upToDate.rebuild, false)

console.log("[validate_phase2_raw_canonical_sync_unit] ok")
