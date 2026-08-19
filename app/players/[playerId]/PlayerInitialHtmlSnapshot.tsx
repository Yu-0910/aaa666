import type { PlayerSlugEntry } from "@/lib/playerSlug.server"
import type { PlayerProfileMergedPayload } from "@/lib/playerProfileMergedServer"
import { matchupOpponentDisplayNameJa } from "@/lib/playerNameNormalize"

type Props = {
  entry: PlayerSlugEntry
  profileMerged: PlayerProfileMergedPayload | null
}

type CareerDisplayRow = Record<string, unknown> & {
  year?: number | string
  is_total?: boolean
}

type InitialCareerColumn = {
  key: string
  label: string
}

const BATTING_INITIAL_COLUMNS: InitialCareerColumn[] = [
  { key: "ops", label: "OPS" },
  { key: "avg", label: "打率" },
  { key: "hits", label: "安打" },
  { key: "hr", label: "本塁" },
  { key: "rbi", label: "打点" },
  { key: "games", label: "試合" },
  { key: "pa", label: "打席" },
  { key: "ab", label: "打数" },
]

const PITCHING_INITIAL_COLUMNS: InitialCareerColumn[] = [
  { key: "era", label: "防御率" },
  { key: "k_bb_pct", label: "K-BB％" },
  { key: "whip", label: "WHIP" },
  { key: "wins", label: "勝利" },
  { key: "losses", label: "敗戦" },
  { key: "games", label: "試合" },
  { key: "ip", label: "回数" },
  { key: "saves", label: "S" },
]

function asRows(value: unknown): CareerDisplayRow[] {
  return Array.isArray(value) ? (value as CareerDisplayRow[]) : []
}

function appendTotalRow(
  rows: CareerDisplayRow[],
  total: CareerDisplayRow | null | undefined,
): CareerDisplayRow[] {
  if (!total || Object.keys(total).length === 0) return rows
  return [...rows, { ...total, year: "通算", is_total: true }]
}

function careerYearLabel(row: CareerDisplayRow): string {
  if (row.year === "通算" || row.is_total) return "通算"
  return String(row.year ?? "")
}

function formatInitialCell(value: unknown): string {
  if (value == null || value === "") return "—"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—"
    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(3).replace(/^0(?=\.)/, "")
  }
  return String(value)
}

function renderCareerTable({
  title,
  rows,
  columns,
}: {
  title: string
  rows: CareerDisplayRow[]
  columns: InitialCareerColumn[]
}) {
  if (rows.length === 0) return null
  return (
    <section>
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>年度</th>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${careerYearLabel(row)}-${index}`}>
              <th>{careerYearLabel(row)}</th>
              {columns.map((column) => (
                <td key={column.key}>{formatInitialCell(row[column.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default function PlayerInitialHtmlSnapshot({ entry, profileMerged }: Props) {
  const profile = profileMerged?.profile
  const battingRows = appendTotalRow(
    asRows(profileMerged?.career_batting?.rows),
    (profileMerged?.career_batting?.total ?? null) as CareerDisplayRow | null,
  )
  const pitchingRows = appendTotalRow(
    asRows(profileMerged?.career_pitching?.rows),
    (profileMerged?.career_pitching?.total ?? null) as CareerDisplayRow | null,
  )
  const rawDisplayName = String(profileMerged?.name_ja ?? entry.nameJa ?? "").trim()
  const displayName = matchupOpponentDisplayNameJa(rawDisplayName) || rawDisplayName || "選手"
  const romanName = String(profileMerged?.name_en_full ?? entry.romanFull ?? "").trim()
  const teamName = String(entry.teamCode ?? "").trim()

  return (
    <article
      id="player-initial-html-snapshot"
      className="player-initial-html-snapshot"
      style={{ display: "none" }}
    >
        <h1>{displayName}</h1>
        {romanName ? <p>{romanName}</p> : null}
        {teamName ? <p>球団: {teamName}</p> : null}
        <section>
          <h2>プロフィール</h2>
          <table>
            <tbody>
              <tr>
                <th>生年月日</th>
                <td>{String(profile?.birth_date_raw ?? "").trim() || "—"}</td>
              </tr>
              <tr>
                <th>プロ入り</th>
                <td>{String(profile?.pro_debut_raw ?? "").trim() || "—"}</td>
              </tr>
              <tr>
                <th>経歴</th>
                <td>{String(profile?.career_raw ?? "").trim() || "—"}</td>
              </tr>
            </tbody>
          </table>
        </section>
        {renderCareerTable({
          title: "年度別打撃成績",
          rows: battingRows,
          columns: BATTING_INITIAL_COLUMNS,
        })}
        {renderCareerTable({
          title: "年度別投手成績",
          rows: pitchingRows,
          columns: PITCHING_INITIAL_COLUMNS,
        })}
    </article>
  )
}
