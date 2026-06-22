/**
 * rbiCreditFromPlayResult の簡易検証（CI 不要・手動実行用）
 * npx tsx scripts/validate_rbi_credit_from_play_result.ts
 */
import { rbiCreditFromPlayResult, type Bases } from "../lib/yahooGame/paSituationSim"

function assertEq(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

const loaded: Bases = { r1: true, r2: true, r3: true }
const risp: Bases = { r1: false, r2: false, r3: true }

assertEq(rbiCreditFromPlayResult(loaded, "左本塁打"), 4, "満塁本塁打")
assertEq(rbiCreditFromPlayResult(risp, "犠飛"), 1, "3塁犠飛")
assertEq(rbiCreditFromPlayResult(risp, "左安"), 1, "3塁単打")
assertEq(rbiCreditFromPlayResult({ r1: false, r2: true, r3: false }, "2点タイムリー"), 2, "明示2点")
assertEq(rbiCreditFromPlayResult({ r1: false, r2: false, r3: false }, "三振"), 0, "三振")

console.log("[validate_rbi_credit] ok")
