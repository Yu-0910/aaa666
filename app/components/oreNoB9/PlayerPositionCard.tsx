import { teamColors } from "@/app/components/top/topPageConstants"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"

type PlayerPositionCardProps = {
  age: number
  avg: string
  hr: number
  name: string
  ops: string
  positionLabel: string
  shortName: string
  team: string
}

function teamAccent(team: string): string {
  return teamColors[team] || rankingTeamStripeColor(team)
}

function isLightColor(hex: string): boolean {
  const normalized = hex.replace("#", "")
  if (normalized.length !== 6) return false
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  if ([r, g, b].some((value) => Number.isNaN(value))) return false
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.66
}

function teamTextColor(team: string): string {
  return isLightColor(teamAccent(team)) ? "#111111" : "#ffffff"
}

function teamMonogram(team: string): string {
  return team === "DB" ? "DB" : team.toUpperCase()
}

export function PlayerPositionCard({
  age,
  avg,
  hr,
  name,
  ops,
  positionLabel,
  shortName,
  team,
}: PlayerPositionCardProps) {
  const accent = teamAccent(team)
  const accentText = teamTextColor(team)

  return (
    <article className="pointer-events-auto select-none">
      <div
        className="rounded-t-[0.95rem] border border-white/20 px-2 py-1 text-center shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
        style={{ backgroundColor: accent, color: accentText }}
      >
        <p className="bebas truncate text-[0.8rem] leading-none tracking-[0.06em] sm:text-[0.92rem] md:text-[1rem]">
          {shortName} <span className="tracking-[0.04em]">(AGE:{age})</span>
        </p>
      </div>

      <div className="rounded-[1rem] border-[3px] border-white bg-black px-3 py-2 text-white shadow-[0_16px_30px_rgba(0,0,0,0.42)]">
        <p className="text-center text-[0.78rem] font-semibold leading-none sm:text-[0.88rem] md:text-[0.94rem]">
          {positionLabel}
        </p>

        <div className="mt-1.5 flex items-center gap-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/30 text-[0.72rem] font-extrabold tracking-[0.08em] sm:h-9 sm:w-9 sm:text-[0.8rem]"
            style={{ backgroundColor: accent, color: accentText }}
            aria-label={`${team} icon`}
          >
            {teamMonogram(team)}
          </div>
          <p className="min-w-0 flex-1 truncate text-[1.45rem] font-black leading-none tracking-[-0.04em] text-[#fff12b] drop-shadow-[0_1px_0_rgba(0,0,0,0.7)] sm:text-[1.75rem] md:text-[2.1rem]">
            {name}
          </p>
        </div>
      </div>

      <div
        className="rounded-b-[0.95rem] border border-white/15 px-2 py-1 text-center shadow-[0_10px_24px_rgba(0,0,0,0.24)]"
        style={{ backgroundColor: accent, color: accentText }}
      >
        <p className="bebas text-[0.95rem] leading-none tracking-[0.05em] sm:text-[1.1rem] md:text-[1.25rem]">
          {ops} / {avg} / {hr}HR
        </p>
      </div>
    </article>
  )
}
