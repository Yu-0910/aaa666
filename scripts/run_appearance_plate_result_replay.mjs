/**
 * 打席結果を出場成績ベースで揃えるための **再取得 → canonical 再ビルド** ランナー。
 *
 *   npm run appearance:replay-plate-canonical -- --year 2026 --game-ids 2021038855,2021038624
 *   npm run appearance:replay-plate-canonical -- --year 2026 --game-ids 2021038855 --skip-fetch
 *   npm run appearance:replay-plate-canonical -- --year 2026 --only-incomplete-fetch
 *
 * `--only-incomplete-fetch` … stats/text の再 fetch のみ（canonical は触らない）。一括取得運用向け。
 *
 * 計画: `docs/plan_plate_result_appearance_only_operation_phases.md`
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

function parseArgs(argv) {
  const yi = argv.indexOf("--year")
  const gi = argv.indexOf("--game-ids")
  const year = yi >= 0 ? String(argv[yi + 1] ?? "").trim() : "2026"
  const gameIds = gi >= 0 ? String(argv[gi + 1] ?? "").trim() : ""
  const skipFetch = argv.includes("--skip-fetch")
  const skipCanonical = argv.includes("--skip-canonical")
  const onlyIncompleteFetch = argv.includes("--only-incomplete-fetch")
  return { year, gameIds, skipFetch, skipCanonical, onlyIncompleteFetch }
}

function run(label, cmd, args) {
  console.log(`\n[appearance:replay-plate-canonical] ${label}\n> ${cmd} ${args.join(" ")}\n`)
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: false })
  if (r.status !== 0 && r.status != null) {
    console.error(`\n[appearance:replay-plate-canonical] 失敗: ${label} (exit ${r.status})`)
    process.exit(r.status ?? 1)
  }
  if (r.error) {
    console.error(`\n[appearance:replay-plate-canonical] 失敗: ${label}`, r.error)
    process.exit(1)
  }
}

function main() {
  const argv = process.argv.slice(2)
  const { year, gameIds, skipFetch, skipCanonical, onlyIncompleteFetch } = parseArgs(argv)

  console.log("[appearance:replay-plate-canonical] 計画: docs/plan_plate_result_appearance_only_operation_phases.md")

  if (onlyIncompleteFetch) {
    run(
      "stats/text 再取得（--only-incomplete）",
      "node",
      ["scripts/phase2_fetch_sportsnavi_stats_text.mjs", "--year", year, "--only-incomplete"],
    )
    console.log("\n[appearance:replay-plate-canonical] --only-incomplete-fetch のため canonical は未実行。")
    console.log("  続けて特定試合をビルドする例:")
    console.log(`    npm run appearance:replay-plate-canonical -- --year ${year} --game-ids <ids> --skip-fetch`)
    printFooter()
    return
  }

  if (!skipFetch) {
    if (!gameIds.trim()) {
      console.error(
        "[appearance:replay-plate-canonical] --game-ids が必要です（再 fetch 対象を明示）。\n" +
          "  一括の欠損のみ取り直すときは: npm run appearance:stats-refetch-incomplete\n" +
          "  または: npm run appearance:replay-plate-canonical -- --year 2026 --only-incomplete-fetch",
      )
      process.exit(1)
    }
    run(
      "① stats/text 再取得（--force）",
      "node",
      ["scripts/phase2_fetch_sportsnavi_stats_text.mjs", "--year", year, "--game-ids", gameIds, "--force"],
    )
  } else {
    console.log("\n[appearance:replay-plate-canonical] ① fetch … --skip-fetch のため省略\n")
  }

  if (!skipCanonical) {
    if (!gameIds.trim()) {
      console.error("[appearance:replay-plate-canonical] canonical 再ビルドには --game-ids が必要です。")
      process.exit(1)
    }
    run(
      "② canonical 再ビルド（--force）",
      "node",
      ["scripts/phase2_build_canonical_from_raw_sportsnavi.mjs", "--year", year, "--game-ids", gameIds, "--force"],
    )
  } else {
    console.log("\n[appearance:replay-plate-canonical] ② canonical … --skip-canonical のため省略\n")
  }

  printFooter()
}

function printFooter() {
  console.log("\n[appearance:replay-plate-canonical] ─────────────────────────────────────────")
  console.log("次の例（必要なものだけ）:")
  console.log("  npm run appearance:phase3")
  console.log("  npm run phase10:yahoo:restore     # 一球ログを canonical にマージする場合")
  console.log("  npm run rebuild:batting-profile-and-rankings-2026")
  console.log("[appearance:replay-plate-canonical] ─────────────────────────────────────────\n")
}

main()
