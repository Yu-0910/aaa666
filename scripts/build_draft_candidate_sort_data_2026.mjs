import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

const sourceUrl = "https://www.draft-kaigi.jp/draftplayer/84390/"
const outputPath = "app/draft-candidate-sort/_data/candidates2026.ts"

const categorySections = [
  { heading: "高校生のドラフト候補", category: "highSchool" },
  { heading: "大学生のドラフト候補", category: "university" },
  { heading: "社会人のドラフト候補", category: "corporate" },
]

const positionMap = new Map([
  ["投手", "pitcher"],
  ["捕手", "catcher"],
  ["内野手", "infielder"],
  ["外野手", "outfielder"],
])

const html = await fetch(sourceUrl).then((response) => {
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status}`)
  }
  return response.text()
})

const displayPlayers = []
const internalPriority = []
const seenIds = new Map()

for (const section of categorySections) {
  const sectionStart = html.indexOf(section.heading)
  if (sectionStart === -1) continue

  const tableStart = html.indexOf("<table", sectionStart)
  const tableEnd = html.indexOf("</table>", tableStart)
  if (tableStart === -1 || tableEnd === -1) continue

  const tableHtml = html.slice(tableStart, tableEnd + "</table>".length)
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
  let currentPositionGroup = null

  for (const rowMatch of rows) {
    const rowHtml = rowMatch[1]
    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(
      (cellMatch) => cellMatch[1],
    )

    if (cells.length === 1) {
      const label = cleanText(cells[0])
      currentPositionGroup = positionMap.get(label) ?? currentPositionGroup
      continue
    }

    if (cells.length < 11 || !/<a\b/i.test(cells[0]) || !currentPositionGroup) {
      continue
    }

    const playerIdMatch = cells[0].match(/PlayerId=(\d+)/)
    const playerId = playerIdMatch?.[1]
    if (!playerId) continue

    const id = `draft-2026-${playerId}`
    const mediaCells = cells.slice(5, 11)
    const priorityGroup = mediaCells.some((cell) => cleanText(cell).includes("◯"))
      ? "recommended"
      : "normal"

    if (seenIds.has(id)) {
      const priorityEntry = internalPriority.find((entry) => entry.id === id)
      if (priorityEntry && priorityGroup === "recommended") {
        priorityEntry.priorityGroup = "recommended"
      }
      continue
    }

    seenIds.set(id, true)
    displayPlayers.push({
      id,
      name: cleanText(cells[0]),
      category: section.category,
      positionGroup: currentPositionGroup,
      schoolOrTeam: cleanText(cells[1]) || "-",
      throwBat: cleanText(cells[2]) || "-",
      heightWeight: cleanText(cells[3]) || "-",
    })
    internalPriority.push({ id, priorityGroup })
  }
}

const generated = `import type { CandidateDataSet } from "../_lib/candidateData"

export const candidates2026DataSet = ${JSON.stringify(
  {
    version: "2026-draft-candidates-2026-01-08",
    updatedAt: "2026-01-08",
    displayPlayers,
    internalPriority,
  },
  null,
  2,
)} satisfies CandidateDataSet
`

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, generated)

const recommendedCount = internalPriority.filter(
  (entry) => entry.priorityGroup === "recommended",
).length
console.log(
  JSON.stringify({
    outputPath,
    displayPlayers: displayPlayers.length,
    internalPriority: internalPriority.length,
    recommended: recommendedCount,
  }),
)

function cleanText(value) {
  return value
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
