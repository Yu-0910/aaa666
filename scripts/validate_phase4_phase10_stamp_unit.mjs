/**
 * Phase4 merge stamp: pitchRows 指紋まわり（2026-05-31 再発対策の回帰）。
 *   node scripts/validate_phase4_phase10_stamp_unit.mjs
 */

import assert from "node:assert/strict"
import { createHash } from "node:crypto"

const EMPTY_PHASE10_ROWS_FINGERPRINT = createHash("sha256").update("[]", "utf8").digest("hex")

function pitchRowsFromPhase10Json(restoredJson) {
  return Array.isArray(restoredJson?.pitchRows) ? restoredJson.pitchRows : []
}

function computePhase10RowsFingerprint(rows) {
  const stable = [...rows].sort((a, b) => {
    const innA = parseInt(String(a?.inning ?? "0"), 10) || 0
    const innB = parseInt(String(b?.inning ?? "0"), 10) || 0
    if (innA !== innB) return innA - innB
    const tbA = String(a?.top_bottom ?? "")
    const tbB = String(b?.top_bottom ?? "")
    if (tbA !== tbB) return tbA < tbB ? -1 : 1
    const boA = parseInt(String(a?.bat_order ?? "0"), 10) || 0
    const boB = parseInt(String(b?.bat_order ?? "0"), 10) || 0
    if (boA !== boB) return boA - boB
    const pnA = parseInt(String(a?.pitch_no ?? "0"), 10) || 0
    const pnB = parseInt(String(b?.pitch_no ?? "0"), 10) || 0
    return pnA - pnB
  })
  return createHash("sha256").update(JSON.stringify(stable), "utf8").digest("hex")
}

function shouldSkipMergeByStamp(stamp, expected, { pitchRowCount = 0 } = {}) {
  if (!stamp || stamp.schemaVersion !== "phase4-yahoo-phase10-merge-stamp-v1") return false
  if (
    pitchRowCount > 0 &&
    stamp.phase10RowsFingerprint === EMPTY_PHASE10_ROWS_FINGERPRINT &&
    expected.phase10RowsFingerprint !== EMPTY_PHASE10_ROWS_FINGERPRINT
  ) {
    return false
  }
  return (
    stamp.mergeVersion === expected.mergeVersion &&
    stamp.phase10RowsFingerprint === expected.phase10RowsFingerprint &&
    stamp.gameId === expected.gameId
  )
}

// 旧バグ: `rows` キーは常に空 → 空指紋
const withPitchRows = {
  pitchRows: [{ inning: 1, top_bottom: "表", bat_order: 1, pitch_no: 1 }],
  rows: [{ inning: 99 }],
}
assert.equal(pitchRowsFromPhase10Json(withPitchRows).length, 1, "must read pitchRows not rows")
const fp = computePhase10RowsFingerprint(pitchRowsFromPhase10Json(withPitchRows))
assert.notEqual(fp, EMPTY_PHASE10_ROWS_FINGERPRINT, "non-empty pitchRows must not hash to []")

// 誤 stamp（空指紋）+ 実データあり → skip しない
const badStamp = {
  schemaVersion: "phase4-yahoo-phase10-merge-stamp-v1",
  gameId: "2021038939",
  mergeVersion: "mergePhase10IntoCanonical@2026-05-31",
  phase10RowsFingerprint: EMPTY_PHASE10_ROWS_FINGERPRINT,
}
assert.equal(
  shouldSkipMergeByStamp(
    badStamp,
    {
      gameId: "2021038939",
      mergeVersion: "mergePhase10IntoCanonical@2026-05-31",
      phase10RowsFingerprint: fp,
    },
    { pitchRowCount: 1 },
  ),
  false,
  "must not skip merge when stamp has empty fingerprint but pitchRows exist",
)

// 正しい stamp → skip 可
const goodStamp = { ...badStamp, phase10RowsFingerprint: fp }
assert.equal(
  shouldSkipMergeByStamp(
    goodStamp,
    {
      gameId: "2021038939",
      mergeVersion: "mergePhase10IntoCanonical@2026-05-31",
      phase10RowsFingerprint: fp,
    },
    { pitchRowCount: 1 },
  ),
  true,
)

console.log("[validate_phase4_phase10_stamp_unit] ok")
