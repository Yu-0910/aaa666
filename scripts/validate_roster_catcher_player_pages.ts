/**
 * Phase 2: 名簿捕手 83 名の個人ページ到達性検証
 *
 *   npx tsx scripts/validate_roster_catcher_player_pages.ts [--fail]
 *   npx tsx scripts/validate_roster_catcher_player_pages.ts --http-base http://localhost:3000
 */

import {
  evaluateAllRosterCatcherPlayerPages,
  findDuplicateCatcherNameKeys,
} from "@/lib/rosterCatcherPlayerPageReachability"

function parseArgs(): { fail: boolean; httpBase: string | null } {
  const args = process.argv.slice(2)
  let fail = false
  let httpBase: string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--fail") fail = true
    if (args[i] === "--http-base" && args[i + 1]) {
      httpBase = args[i + 1]!.replace(/\/$/, "")
      i++
    }
  }
  return { fail, httpBase }
}

async function probeHttp(base: string, path: string): Promise<{ status: number; ok: boolean }> {
  try {
    const res = await fetch(`${base}${path}`, { redirect: "follow" })
    return { status: res.status, ok: res.ok }
  } catch (e) {
    return { status: 0, ok: false }
  }
}

async function main() {
  const { fail, httpBase } = parseArgs()
  const results = evaluateAllRosterCatcherPlayerPages()
  const dupes = findDuplicateCatcherNameKeys()
  const failed = results.filter((r) => !r.ok)

  console.log(`[validate_roster_catcher_player_pages] roster catchers: ${results.length}`)
  console.log(
    `  static ok: ${results.length - failed.length} / ${results.length}, failed: ${failed.length}`
  )

  if (dupes.length) {
    console.log(`  duplicate ja name keys: ${dupes.length}`)
    for (const d of dupes.slice(0, 5)) {
      console.log(`    - ${d.key}: ${d.players.join("; ")}`)
    }
  }

  for (const r of failed) {
    console.log(`  FAIL ${r.player.name_ja} (${r.player.npb_player_id})`)
    for (const issue of r.issues) {
      console.log(`    [${issue.code}] ${issue.message}`)
    }
  }

  if (httpBase) {
    const sample = results.slice(0, 5)
    console.log(`\n  HTTP probe (${httpBase}, sample ${sample.length}):`)
    for (const r of sample) {
      const page = await probeHttp(httpBase, r.urls.pathByNpbId)
      const rosterApi = await probeHttp(
        httpBase,
        `/api/roster/2026?publicId=${encodeURIComponent(r.urls.npb_player_id)}`
      )
      const profileApi = await probeHttp(
        httpBase,
        `/api/players/${encodeURIComponent(r.urls.npb_player_id)}/profile-merged`
      )
      console.log(
        `    ${r.urls.name_ja}: page=${page.status} roster=${rosterApi.status} profile=${profileApi.status}`
      )
    }
  }

  if (fail && failed.length > 0) {
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
