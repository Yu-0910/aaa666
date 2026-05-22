/**
 * トップ「今週」タブのセクション見出し（セ・今週の打撃成績 形式）
 */

const LEAGUE_SHORT_JA: Record<string, string> = {
  CL: "セ",
  PL: "パ",
}

const LEAGUE_EN: Record<string, string> = {
  CL: "Central League",
  PL: "Pacific League",
}

export function topWeeklyLeadersSectionTitle(
  league: string,
  kind: "batting" | "pitching"
): string {
  const lg = league.toUpperCase()
  const short = LEAGUE_SHORT_JA[lg] ?? lg
  const category = kind === "batting" ? "打撃成績" : "投球成績"
  return `${short}・今週の${category}`
}

export function topSeasonLeadersSectionTitle(
  league: string,
  kind: "batting" | "pitching"
): string {
  const lg = league.toUpperCase()
  const full =
    lg === "CL" ? "セ・リーグ" : lg === "PL" ? "パ・リーグ" : `${lg}リーグ`
  const category = kind === "batting" ? "打撃成績" : "投球成績"
  return `${full} ${category}`
}

/** 今週タブの英字サブタイトル（例: CL Weekly Batting (5/19〜5/24)） */
export function topWeeklyLeadersSectionSubtitle(
  league: string,
  kind: "batting" | "pitching",
  weekLabel: string
): string {
  const lg = league.toUpperCase()
  const category = kind === "batting" ? "Batting" : "Pitching"
  return `${lg} Weekly ${category} (${weekLabel.trim()})`
}

export function topLeadersSectionSubtitle(
  league: string,
  options?: { kind?: "batting" | "pitching"; weekLabel?: string | null }
): string {
  const weekLabel = options?.weekLabel?.trim()
  if (weekLabel && options?.kind) {
    return topWeeklyLeadersSectionSubtitle(league, options.kind, weekLabel)
  }
  const lg = league.toUpperCase()
  return LEAGUE_EN[lg] ?? `${lg} League`
}
