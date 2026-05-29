/**
 * Phase 3 検証 / 計画 Phase 5 手順②: ゴールデン試合の N/M・zip 件数を詳細化し、canonical 先頭サンプルで全体傾向を集計する。
 * 成果物: `docs/batting_appearance_phase3_last_run.md`（上書き）
 *
 *   npm run appearance:phase3
 *   npm run appearance:phase3 -- --game-ids 2021038624,2021038735 --scan-first 0
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { getProjectRoot } from "../lib/projectRoot"
import type { BattingLine, CanonicalGameDocument } from "../lib/yahooGame/types"
import { mergePhase10RestoredIntoDocIfPresent } from "../lib/seasonStatsPilot"
import {
  buildAppearanceZipResultOverrides,
  diagnoseBattingAppearanceSlotsVsPlateAppearances,
} from "../lib/yahooGame/appearanceStatsTrailingCells"
import { isAppearancePrimaryZipEnabled } from "../lib/yahooGame/appearancePrimaryFeatureFlag"

const DEFAULT_GOLDEN = ["2021038624", "2021038735"]
const DEFAULT_SCAN_FIRST = 120

function parseGameIds(argv: string[]): string[] | null {
  const i = argv.indexOf("--game-ids")
  if (i < 0 || argv[i + 1] == null) return null
  return String(argv[i + 1])
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseScanFirst(argv: string[]): number {
  const i = argv.indexOf("--scan-first")
  if (i < 0 || argv[i + 1] == null) return DEFAULT_SCAN_FIRST
  return Math.max(0, parseInt(String(argv[i + 1]), 10) || 0)
}

function listCanonicalGameIds(root: string, max: number): string[] {
  const dir = join(root, "_data", "scraped_games", "canonical")
  const names = readdirSync(dir).filter((n) => /^\d+\.json$/u.test(n))
  names.sort()
  return names.slice(0, max).map((n) => n.replace(/\.json$/u, ""))
}

function loadMergedDoc(root: string, gameId: string): CanonicalGameDocument | null {
  const p = join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
  try {
    const raw = readFileSync(p, "utf-8")
    const doc = JSON.parse(raw) as CanonicalGameDocument
    return mergePhase10RestoredIntoDocIfPresent(doc)
  } catch {
    return null
  }
}

function nameByBatterId(doc: CanonicalGameDocument): Map<string, string> {
  const m = new Map<string, string>()
  for (const line of doc.domain?.battingLines ?? []) {
    const id = String(line.yahooPlayerId ?? "").trim()
    if (!id) continue
    const nm = String(line.playerName ?? "").trim()
    m.set(id, nm || id)
  }
  return m
}

type GameMetrics = {
  gameId: string
  readOk: boolean
  battersWithSlots: number
  zipSize: number
  diagRows: number
  okFalse: number
  badRows: { yahooBatterId: string; playerName: string; n: number; m: number }[]
}

function analyzeDoc(gameId: string, doc: CanonicalGameDocument | null): GameMetrics {
  if (!doc) {
    return {
      gameId,
      readOk: false,
      battersWithSlots: 0,
      zipSize: 0,
      diagRows: 0,
      okFalse: 0,
      badRows: [],
    }
  }
  const batting = doc.domain?.battingLines ?? []
  const battersWithSlots = batting.filter(
    (b: BattingLine) =>
      Array.isArray(b.appearancePaSlotsJa) &&
      b.appearancePaSlotsJa.some((c) => String(c ?? "").trim() !== ""),
  ).length
  const zip = buildAppearanceZipResultOverrides(doc)
  const diag = diagnoseBattingAppearanceSlotsVsPlateAppearances(doc)
  const names = nameByBatterId(doc)
  const badRows = diag
    .filter((r) => !r.ok)
    .map((r) => ({
      yahooBatterId: r.yahooBatterId,
      playerName: names.get(r.yahooBatterId) ?? "",
      n: r.nSlotsNonEmpty,
      m: r.mPlateAppearances,
    }))
  return {
    gameId,
    readOk: true,
    battersWithSlots,
    zipSize: zip.size,
    diagRows: diag.length,
    okFalse: badRows.length,
    badRows,
  }
}

function escMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")
}

function main(): void {
  const root = getProjectRoot()
  const argv = process.argv.slice(2)
  const gameIdsArg = parseGameIds(argv)
  const golden = gameIdsArg && gameIdsArg.length > 0 ? gameIdsArg : [...DEFAULT_GOLDEN]
  const scanFirst = parseScanFirst(argv)

  const scanIds = listCanonicalGameIds(root, scanFirst)
  const allIds = [...new Set([...golden, ...scanIds])]

  const rows: GameMetrics[] = []
  for (const gid of allIds) {
    rows.push(analyzeDoc(gid, loadMergedDoc(root, gid)))
  }

  const goldenSet = new Set(golden)
  const scanOnly = rows.filter((r) => !goldenSet.has(r.gameId))
  const goldenRows = rows.filter((r) => goldenSet.has(r.gameId))

  const withMismatch = scanOnly.filter((r) => r.readOk && r.okFalse > 0).sort((a, b) => b.okFalse - a.okFalse)

  const lines: string[] = []
  lines.push("# Phase 3 実行ログ（出場成績 zip / N≠M）")
  lines.push("")
  lines.push(`自動生成: ${new Date().toISOString()}`)
  lines.push("")
  lines.push("## 実行条件")
  lines.push("")
  lines.push(`- \`TOPPAGE_APPEARANCE_PRIMARY\` … 生値: \`${String(process.env.TOPPAGE_APPEARANCE_PRIMARY ?? "") || "(未設定)"}\` / zip 有効 = **${isAppearancePrimaryZipEnabled()}**`)
  lines.push(`- 入力 … canonical + Phase10 マージ（\`mergePhase10RestoredIntoDocIfPresent\`）`)
  lines.push(`- ゴールデン gameId … ${golden.join(", ")}`)
  lines.push(`- スキャン … canonical 先頭 **${scanFirst}** 試合（ゴールデンと重複除外後の集計用）`)
  lines.push("")
  lines.push("## ゴールデン試合（詳細）")
  lines.push("")
  for (const r of goldenRows) {
    lines.push(`### ${r.gameId}`)
    lines.push("")
    if (!r.readOk) {
      lines.push("canonical の読込に失敗しました。")
      lines.push("")
      continue
    }
    lines.push("| 指標 | 値 |")
    lines.push("| --- | ---: |")
    lines.push(`| スロット非空を持つ打者数 | ${r.battersWithSlots} |`)
    lines.push(`| zip 件数（paId 上書き） | ${r.zipSize} |`)
    lines.push(`| 診断行数（打者行） | ${r.diagRows} |`)
    lines.push(`| N≠M（ok=false） | ${r.okFalse} |`)
    lines.push("")
    if (r.badRows.length === 0) {
      lines.push("N≠M の打者はありません。")
    } else {
      lines.push("| Yahoo 打者 ID | 氏名 | N（非空スロット） | M（ログ打席数） |")
      lines.push("| --- | --- | ---: | ---: |")
      for (const b of r.badRows) {
        lines.push(`| ${b.yahooBatterId} | ${escMd(b.playerName)} | ${b.n} | ${b.m} |`)
      }
    }
    lines.push("")
  }

  lines.push("## スキャンコホート（先頭試合）")
  lines.push("")
  const okScan = scanOnly.filter((r) => r.readOk)
  const failed = scanOnly.filter((r) => !r.readOk).length
  lines.push(`- 対象試合数（読込成功）: **${okScan.length}**（読込失敗: ${failed}）`)
  lines.push(`- いずれかの打者で N≠M があった試合数: **${withMismatch.length}**`)
  lines.push("")

  const top = withMismatch.slice(0, 25)
  if (top.length === 0) {
    lines.push("先頭スキャン範囲では N≠M 試合は検出されませんでした（または canonical が空）。")
  } else {
    lines.push("### N≠M 件数が多い試合（最大 25）")
    lines.push("")
    lines.push("| gameId | zip 件数 | N≠M 打者数 |")
    lines.push("| --- | ---: | ---: |")
    for (const r of top) {
      lines.push(`| ${r.gameId} | ${r.zipSize} | ${r.okFalse} |`)
    }
  }
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push("再実行: `npm run appearance:phase3`（`--game-ids` / `--scan-first` で調整可）")

  const outPath = join(root, "docs", "batting_appearance_phase3_last_run.md")
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, lines.join("\n"), "utf-8")

  console.log(`[appearance:phase3] wrote ${outPath}`)
  for (const r of goldenRows) {
    console.log(
      `[golden] ${r.gameId}\treadOk=${r.readOk}\tzip=${r.zipSize}\tokFalse=${r.okFalse}`,
    )
  }
  console.log(`[scan] games=${okScan.length}\tmismatchGames=${withMismatch.length}`)
}

main()
