import { isCatcherRegistrationPosition } from "@/lib/rosterPitcher"

export type CatcherAppearancesSummary = {
  gamesAsCatcher: number
  gameIds: string[]
} | null

/** 名簿捕手、または今季 canonical 派生で捕手出場がある選手に「捕手成績」タブを出す */
export function resolveShowCatcherSeasonTab(options: {
  rosterPosition: string
  isRosterPlayer: boolean
  catcherAppearances: CatcherAppearancesSummary
}): boolean {
  const rosterCatcher =
    options.isRosterPlayer && isCatcherRegistrationPosition(options.rosterPosition)
  const hasDerivedAppearances = (options.catcherAppearances?.gamesAsCatcher ?? 0) > 0
  return rosterCatcher || hasDerivedAppearances
}
