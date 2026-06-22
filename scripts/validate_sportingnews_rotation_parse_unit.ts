/**
 * Phase 35: Sporting News ローテ表パースの単体検証（阪神記事 HTML フィクスチャ）
 */
import assert from "node:assert/strict"
import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import {
  parseJapaneseScheduleDateCell,
  parseSportingNewsRotationHtml,
} from "@/lib/sportingNews/rotationParse"

const TIGERS_FIXTURE = `<h2>2026年阪神タイガースの先発ローテーション投手予想</h2><table><tbody><tr><td>6月14日（日）</td><td>西勇輝</td><td>オリックス</td></tr><tr><td>6月15日（月）</td><td> </td><td> </td></tr><tr><td>6月16日（火）</td><td>才木浩人</td><td>西武</td></tr><tr><td>6月17日（水）</td><td>大竹耕太郎</td><td>楽天</td></tr><tr><td>6月18日（木）</td><td> </td><td> </td></tr><tr><td>6月19日（金）</td><td>村上頌樹</td><td>DeNA</td></tr><tr><td>6月20日（土）</td><td>髙橋遥人</td><td>DeNA</td></tr></tbody></table><h2>2026年阪神タイガースの開幕ローテーション投手候補</h2><table><thead><tr><th>投手名</th><th>2025成績</th></tr></thead><tbody><tr><td>村上頌樹</td><td>26試</td></tr></tbody></table>`

assert.deepEqual(parseJapaneseScheduleDateCell("6月14日（日）", "2026"), {
  dateJst: "2026-06-14",
})

const parsed = parseSportingNewsRotationHtml(TIGERS_FIXTURE, "2026")
assert.equal(parsed.rows.length, 7, `expected 7 rows, got ${parsed.rows.length}`)
assert.equal(parsed.warnings.length, 0)

assert.equal(parsed.rows[0]!.dateJst, "2026-06-14")
assert.equal(parsed.rows[0]!.pitcherNameJa, "西勇輝")
assert.equal(parsed.rows[0]!.opponentTeamShort, "オリックス")
assert.equal(parsed.rows[0]!.opponentTeamCode, "Bs")

assert.equal(parsed.rows[1]!.pitcherNameJa, null)
assert.equal(parsed.rows[1]!.opponentTeamShort, null)

assert.equal(parsed.rows[2]!.pitcherNameJa, "才木浩人")
assert.equal(parsed.rows[2]!.opponentTeamCode, "L")

assert.equal(parsed.rows[5]!.opponentTeamCode, "DB")

const root = getProjectRoot()
const configPath = path.join(root, "_data", "config", "sportingnews_rotation_urls_2026.json")
assert.ok(fs.existsSync(configPath), `config missing: ${configPath}`)
const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { teams: unknown[] }
assert.equal(config.teams.length, 12, "expected 12 team URLs in config")

console.log("[validate:sportingnews-rotation-parse] OK")
