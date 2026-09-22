import type { CandidateForSort } from "./candidateData"
import type { DraftSortSession } from "./draftSortStorage"

type DraftResultImageRow = {
  rank: number
  name: string
  subText: string
}

type DraftResultImageColumn = {
  round: 1 | 2 | 3
  title: string
  subtitle: string
  palette: {
    primary: string
    dark: string
    light: string
    border: string
  }
  rows: DraftResultImageRow[]
}

export const draftResultImageWidth = 1440
export const draftResultImageHeight = 1800

export function buildDraftResultAnnouncementSvg(
  session: DraftSortSession,
  candidateById: Map<string, CandidateForSort>,
): string {
  const columns = buildDraftResultImageColumns(session, candidateById)

  const width = draftResultImageWidth
  const height = draftResultImageHeight
  const columnWidth = 410
  const gap = 34
  const startX = 82
  const top = 270

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#101820" flood-opacity="0.12"/>
    </filter>
    <linearGradient id="goldHeader" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#b99443"/>
      <stop offset="100%" stop-color="#7d652d"/>
    </linearGradient>
    <linearGradient id="navyHeader" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#16334f"/>
      <stop offset="100%" stop-color="#08192d"/>
    </linearGradient>
    <linearGradient id="grayHeader" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5c6065"/>
      <stop offset="100%" stop-color="#292d31"/>
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="#fbfaf7"/>
  <rect x="36" y="36" width="${width - 72}" height="${height - 72}" fill="none" stroke="#d9d2c2" stroke-width="2"/>

  <g font-family="Yu Mincho, Hiragino Mincho ProN, Noto Serif JP, serif" fill="#08192d">
    <text x="${width / 2}" y="126" text-anchor="middle" font-size="74" font-weight="800">2026 ドラフト1位〜3位予想</text>
    <text x="${width / 2}" y="184" text-anchor="middle" font-size="24" letter-spacing="11" fill="#9b7934">JAPAN BASEBALL DRAFT</text>
  </g>
  <line x1="205" y1="178" x2="410" y2="178" stroke="#b99443" stroke-width="4"/>
  <line x1="1030" y1="178" x2="1235" y2="178" stroke="#b99443" stroke-width="4"/>

  ${columns
    .map((column, index) =>
      renderColumn({
        column,
        x: startX + index * (columnWidth + gap),
        y: top,
        width: columnWidth,
      }),
    )
    .join("\n")}

  <g font-family="Yu Gothic, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif">
    <text x="78" y="1710" font-size="22" fill="#5d6470" letter-spacing="5">野球の、次の時代をつくる。</text>
    <line x1="352" y1="1703" x2="992" y2="1703" stroke="#b99443" stroke-width="2"/>
    <text x="1362" y="1714" text-anchor="end" font-size="24" font-weight="700" fill="#9b7934">short-stop.jp</text>
  </g>
</svg>`
}

function buildDraftResultImageColumns(
  session: DraftSortSession,
  candidateById: Map<string, CandidateForSort>,
): DraftResultImageColumn[] {
  return [
    {
      round: 1,
      title: "1位予想",
      subtitle: "1st ROUND",
      palette: {
        primary: "#b99443",
        dark: "url(#goldHeader)",
        light: "#f4efe2",
        border: "#b99443",
      },
      rows: buildRowsForRound(session, candidateById, 1),
    },
    {
      round: 2,
      title: "2位予想",
      subtitle: "2nd ROUND",
      palette: {
        primary: "#16334f",
        dark: "url(#navyHeader)",
        light: "#eef3f8",
        border: "#16334f",
      },
      rows: buildRowsForRound(session, candidateById, 2),
    },
    {
      round: 3,
      title: "3位予想",
      subtitle: "3rd ROUND",
      palette: {
        primary: "#5c6065",
        dark: "url(#grayHeader)",
        light: "#f0f1f2",
        border: "#5c6065",
      },
      rows: buildRowsForRound(session, candidateById, 3),
    },
  ]
}

function buildRowsForRound(
  session: DraftSortSession,
  candidateById: Map<string, CandidateForSort>,
  round: 1 | 2 | 3,
): DraftResultImageRow[] {
  return session.draftPredictionResult
    .filter((row) => row.round === round)
    .slice(0, 12)
    .map((row, index) => {
      const candidate = candidateById.get(row.candidateId)
      return {
        rank: index + 1,
        name: candidate?.name ?? row.candidateId,
        subText: candidate?.schoolOrTeam ?? "",
      }
    })
}

function renderColumn({
  column,
  x,
  y,
  width,
}: {
  column: DraftResultImageColumn
  x: number
  y: number
  width: number
}): string {
  const headerHeight = 136
  const rowHeight = 96
  const rowGap = 10
  const bodyPadding = 12
  const bodyTop = y + headerHeight + bodyPadding
  const totalHeight = headerHeight + bodyPadding * 2 + rowHeight * 12 + rowGap * 11

  return `<g filter="url(#softShadow)">
    <rect x="${x}" y="${y}" width="${width}" height="${totalHeight}" rx="10" fill="#ffffff" stroke="${column.palette.border}" stroke-opacity="0.45" stroke-width="2"/>
    <rect x="${x}" y="${y}" width="${width}" height="${headerHeight}" rx="10" fill="${column.palette.dark}"/>
    <rect x="${x}" y="${y + headerHeight - 10}" width="${width}" height="10" fill="${column.palette.dark}"/>
    <text x="${x + 70}" y="${y + 78}" font-family="Georgia, serif" font-size="46" fill="#ffffff">♕</text>
    <text x="${x + 205}" y="${y + 78}" text-anchor="middle" font-family="Yu Mincho, Hiragino Mincho ProN, Noto Serif JP, serif" font-size="56" font-weight="800" fill="#ffffff">${escapeXml(column.title)}</text>
    <text x="${x + width / 2}" y="${y + 112}" text-anchor="middle" font-family="Georgia, serif" font-size="21" letter-spacing="8" fill="#ffffff">${escapeXml(column.subtitle)}</text>
    ${Array.from({ length: 12 }, (_, index) => {
      const row = column.rows[index]
      return renderRow({
        row: row ?? { rank: index + 1, name: "-", subText: "" },
        x: x + bodyPadding,
        y: bodyTop + index * (rowHeight + rowGap),
        width: width - bodyPadding * 2,
        height: rowHeight,
        column,
      })
    }).join("\n")}
  </g>`
}

function renderRow({
  row,
  x,
  y,
  width,
  height,
  column,
}: {
  row: DraftResultImageRow
  x: number
  y: number
  width: number
  height: number
  column: DraftResultImageColumn
}): string {
  const numberWidth = 72
  const nameFontSize = getNameFontSize(row.name)
  const subText = row.subText ? trimForSvg(row.subText, 18) : ""

  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="7" fill="#ffffff" stroke="#c7c2b8" stroke-width="1.5"/>
    <rect x="${x}" y="${y}" width="${numberWidth}" height="${height}" rx="7" fill="${column.palette.primary}"/>
    <rect x="${x + numberWidth - 8}" y="${y}" width="8" height="${height}" fill="${column.palette.primary}"/>
    <text x="${x + numberWidth / 2}" y="${y + 62}" text-anchor="middle" font-family="Georgia, serif" font-size="42" font-weight="800" fill="#ffffff">${row.rank}</text>
    <text x="${x + numberWidth + 30}" y="${y + (subText ? 48 : 59)}" font-family="Yu Gothic, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif" font-size="${nameFontSize}" font-weight="800" fill="#101820">${escapeXml(row.name)}</text>
    ${
      subText
        ? `<text x="${x + numberWidth + 31}" y="${y + 75}" font-family="Yu Gothic, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif" font-size="16" font-weight="700" fill="#68717c">${escapeXml(subText)}</text>`
        : ""
    }
    <line x1="${x + width - 132}" y1="${y + 58}" x2="${x + width - 28}" y2="${y + 58}" stroke="#8a929c" stroke-width="2"/>
  </g>`
}

function getNameFontSize(name: string): number {
  const length = Array.from(name).length
  if (length >= 12) return 24
  if (length >= 10) return 27
  if (length >= 8) return 30
  return 34
}

function trimForSvg(value: string, maxLength: number): string {
  const chars = Array.from(value)
  if (chars.length <= maxLength) return value
  return `${chars.slice(0, maxLength - 1).join("")}…`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
