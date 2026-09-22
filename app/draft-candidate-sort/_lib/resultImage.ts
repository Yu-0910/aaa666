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
  icon: string
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
  const gap = 30
  const startX = 75
  const top = 220

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#252827"/>
      <stop offset="48%" stop-color="#070808"/>
      <stop offset="100%" stop-color="#1a1d1c"/>
    </linearGradient>
    <linearGradient id="panelHeader" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#181a1a"/>
      <stop offset="100%" stop-color="#050606"/>
    </linearGradient>
    <pattern id="texture" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M0 24 L24 0 M-6 6 L6 -6 M18 30 L30 18" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>
    </pattern>
    <filter id="rowShadow" x="-4%" y="-10%" width="108%" height="120%">
      <feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#texture)"/>
  <path d="M-120 0 L220 0 L-120 560 Z" fill="#000000" opacity="0.32"/>
  <path d="M1180 0 L1440 0 L1440 390 Z" fill="#000000" opacity="0.32"/>
  <path d="M-40 1490 L260 1800 L-40 1800 Z" fill="#000000" opacity="0.3"/>
  <path d="M960 1800 L1440 1240 L1440 1800 Z" fill="#000000" opacity="0.36"/>
  <path d="M350 0 L470 0 L50 1800 L-70 1800 Z" fill="#ffffff" opacity="0.035"/>
  <path d="M1120 0 L1240 0 L820 1800 L700 1800 Z" fill="#ffffff" opacity="0.035"/>

  <g font-family="Yu Gothic, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif" fill="#ffffff">
    <line x1="250" y1="52" x2="390" y2="52" stroke="#ffffff" stroke-width="2"/>
    <line x1="1050" y1="52" x2="1190" y2="52" stroke="#ffffff" stroke-width="2"/>
    <text x="${width / 2}" y="64" text-anchor="middle" font-size="31" font-weight="500" letter-spacing="10">2026 JAPAN BASEBALL DRAFT</text>
    <text x="${width / 2}" y="160" text-anchor="middle" font-size="76" font-weight="900" letter-spacing="-1">ドラフト1位〜3位予想</text>
  </g>

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
    <line x1="290" y1="1718" x2="585" y2="1718" stroke="#ffffff" stroke-width="2"/>
    <line x1="855" y1="1718" x2="1150" y2="1718" stroke="#ffffff" stroke-width="2"/>
    <text x="${width / 2}" y="1728" text-anchor="middle" font-size="28" font-weight="600" letter-spacing="7" fill="#ffffff">short-stop.jp</text>
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
      icon: "♛",
      rows: buildRowsForRound(session, candidateById, 1),
    },
    {
      round: 2,
      title: "2位予想",
      subtitle: "2nd ROUND",
      icon: "⚾",
      rows: buildRowsForRound(session, candidateById, 2),
    },
    {
      round: 3,
      title: "3位予想",
      subtitle: "3rd ROUND",
      icon: "★",
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
  const headerHeight = 104
  const rowHeight = 82
  const rowGap = 4
  const footerHeight = 78
  const bodyTop = y + headerHeight
  const totalHeight = headerHeight + rowHeight * 12 + rowGap * 11 + footerHeight

  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${totalHeight}" fill="none" stroke="#cfd2d2" stroke-width="2"/>
    <rect x="${x}" y="${y}" width="${width}" height="${headerHeight}" fill="url(#panelHeader)" stroke="#cfd2d2" stroke-width="2"/>
    <path d="M${x} ${y} L${x + 46} ${y} L${x} ${y + 62} Z" fill="#eef200"/>
    <path d="M${x + 18} ${y} L${x + 34} ${y} L${x} ${y + 45} L${x} ${y + 24} Z" fill="#070808"/>
    <path d="M${x + width - 46} ${y + headerHeight} L${x + width} ${y + headerHeight} L${x + width} ${y + 42} Z" fill="#eef200"/>
    <path d="M${x + width - 22} ${y + headerHeight} L${x + width} ${y + headerHeight} L${x + width} ${y + 76} Z" fill="#070808"/>
    <text x="${x + 66}" y="${y + 76}" font-family="Arial Black, Impact, sans-serif" font-size="80" font-weight="900" font-style="italic" fill="#eef200">${column.round}</text>
    <text x="${x + 132}" y="${y + 68}" font-family="Yu Gothic, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif" font-size="44" font-weight="900" fill="#ffffff">${escapeXml(column.title)}</text>
    <text x="${x + width - 72}" y="${y + 48}" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#eef200">${escapeXml(column.icon)}</text>
    <text x="${x + width - 72}" y="${y + 78}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="900" letter-spacing="2" fill="#ffffff">${column.round === 1 ? "FIRST" : column.round === 2 ? "SECOND" : "THIRD"}</text>
    <text x="${x + width - 72}" y="${y + 96}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="900" letter-spacing="2" fill="#ffffff">ROUND</text>
    ${Array.from({ length: 12 }, (_, index) => {
      const row = column.rows[index]
      return renderRow({
        row: row ?? { rank: index + 1, name: "-", subText: "" },
        x,
        y: bodyTop + index * (rowHeight + rowGap),
        width,
        height: rowHeight,
      })
    }).join("\n")}
    <path d="M${x} ${y + totalHeight - footerHeight + 8} L${x + width} ${y + totalHeight - footerHeight + 8}" stroke="#eef200" stroke-width="5"/>
    <path d="M${x + 22} ${y + totalHeight - footerHeight + 8} L${x + 50} ${y + totalHeight - footerHeight + 8} L${x + 30} ${y + totalHeight - footerHeight + 28} L${x + 2} ${y + totalHeight - footerHeight + 28} Z" fill="#eef200"/>
    <path d="M${x + 58} ${y + totalHeight - footerHeight + 8} L${x + 86} ${y + totalHeight - footerHeight + 8} L${x + 66} ${y + totalHeight - footerHeight + 28} L${x + 38} ${y + totalHeight - footerHeight + 28} Z" fill="#ffffff"/>
    <text x="${x + width / 2}" y="${y + totalHeight - 36}" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" font-weight="700" letter-spacing="6" fill="#ffffff">${escapeXml(column.subtitle.toUpperCase())}</text>
    <text x="${x + width / 2}" y="${y + totalHeight - 13}" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="600" letter-spacing="6" fill="#ffffff">2026 JAPAN BASEBALL DRAFT</text>
  </g>`
}

function renderRow({
  row,
  x,
  y,
  width,
  height,
}: {
  row: DraftResultImageRow
  x: number
  y: number
  width: number
  height: number
}): string {
  const numberWidth = 102
  const nameFontSize = getNameFontSize(row.name)
  const subText = row.subText ? trimForSvg(row.subText, 16) : ""

  return `<g filter="url(#rowShadow)">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#f4f4f2" stroke="#050606" stroke-width="2"/>
    <path d="M${x} ${y} L${x + numberWidth} ${y} L${x + numberWidth - 34} ${y + height} L${x} ${y + height} Z" fill="#eef200"/>
    <path d="M${x + numberWidth} ${y} L${x + numberWidth + 18} ${y} L${x + numberWidth - 16} ${y + height} L${x + numberWidth - 34} ${y + height} Z" fill="#050606"/>
    <text x="${x + 50}" y="${y + 58}" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="46" font-weight="900" font-style="italic" fill="#050606">${row.rank}</text>
    <text x="${x + numberWidth + 38}" y="${y + (subText ? 39 : 54)}" font-family="Yu Gothic, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif" font-size="${nameFontSize}" font-weight="900" fill="#050606">${escapeXml(row.name)}</text>
    ${
      subText
        ? `<text x="${x + numberWidth + 40}" y="${y + 65}" font-family="Yu Gothic, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif" font-size="19" font-weight="700" fill="#4b4f52">${escapeXml(subText)}</text>`
        : ""
    }
    <path d="M${x + width - 32} ${y + 22} L${x + width - 15} ${y + height / 2} L${x + width - 32} ${y + height - 22}" fill="none" stroke="#b9b9b9" stroke-width="6"/>
  </g>`
}

function getNameFontSize(name: string): number {
  const length = Array.from(name).length
  if (length >= 12) return 25
  if (length >= 10) return 28
  if (length >= 8) return 32
  return 36
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
