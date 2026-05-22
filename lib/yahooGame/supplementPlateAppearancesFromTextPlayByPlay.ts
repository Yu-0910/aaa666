/**
 * スポナビ実況から plateAppearances を補完する。
 *
 * 運用メモ: 実況は「見事送りバントを成功させる」のように **送りバント** だけの行があり、
 * 「犠打」語が無い。ここを犠打として拾わないと partial 試合で result が空のまま残り、
 * 対左右・打数が公式とズレる（canonical 再ビルド・Phase10 マージの両方で同方針を維持する）。
 */
import type { CanonicalGameDocument, PlateAppearance } from "./types"

function isIntermediateTrailingResultJa(r: string | null | undefined): boolean {
  const s = (r ?? "").trim()
  if (!s) return false
  if (s === "ボール") return true
  if (s.startsWith("ボール[")) return true
  // docs §6b: カウント進行のみ（決着ではない）
  if (s === "見逃し" || s === "空振り" || s === "ファウル") return true
  return false
}

function inningHalfKeyToParts(sectionTitle: string): { inning: string; tb: "表" | "裏" } | null {
  const s = (sectionTitle ?? "").trim()
  const m = s.match(/^(\d+)回(表|裏)$/)
  if (!m) return null
  return { inning: m[1]!, tb: m[2]! as "表" | "裏" }
}

/**
 * スポナビ実況の 1 行全文から、補完用の `resultSummaryJa` 相当の文字列を推定する（best-effort）。
 * 新しい表記を拾うたびにここを拡張し、`validate_canonical_pa_text_result_coverage` で取りこぼしを検知する。
 */
export function inferResultSummaryJaFromSportsnaviPlayLineText(line: string): string | null {
  const s = (line ?? "").trim()
  // 犠飛（テキスト速報は「犠牲フライ」表記が多い）
  if (/犠牲フライ|犠飛/.test(s)) return "犠飛"
  // フライ
  if (/レフトフライ/.test(s)) return "左飛"
  if (/センターフライ/.test(s)) return "中飛"
  if (/ライトフライ/.test(s)) return "右飛"
  if (/サードフライ/.test(s)) return "三飛"
  if (/セカンドフライ/.test(s)) return "二飛"
  if (/ファーストフライ/.test(s)) return "一飛"
  if (/ショートフライ/.test(s)) return "遊飛"

  // ファウルフライ（内野高飛の処理など）— 「〇〇(一)が捕球してバッターアウト」形式
  if (/ファウルフライ/.test(s)) {
    if (/\(一\)|ファースト|一塁/.test(s)) return "一飛"
    if (/\(二\)|セカンド|二塁/.test(s)) return "二飛"
    if (/\(三\)|サード|三塁/.test(s)) return "三飛"
    if (/\(遊\)|ショート/.test(s)) return "遊飛"
    if (/\(左\)|レフト/.test(s)) return "左飛"
    if (/\(中\)|センター/.test(s)) return "中飛"
    if (/\(右\)|ライト/.test(s)) return "右飛"
    if (/バッターアウト|が捕球/.test(s)) return "中飛"
  }

  // ゴロ
  if (/ピッチャーゴロ/.test(s)) return "投ゴロ"
  if (/キャッチャーゴロ/.test(s)) return "捕ゴロ"
  if (/ファーストゴロ/.test(s)) return "一ゴロ"
  if (/セカンドゴロ/.test(s)) return "二ゴロ"
  if (/サードゴロ/.test(s)) return "三ゴロ"
  if (/ショートゴロ/.test(s)) return "遊ゴロ"

  // 三振
  if (/見逃し三振/.test(s)) return "見三振"
  if (/空振り三振/.test(s)) return "空三振"
  if (/三振/.test(s)) return "三振"

  // 四球
  if (/フォアボール|四球/.test(s)) return "四球"
  if (/敬遠|故意四|故意四球/.test(s)) return "敬遠（故意四球）"

  // 死球
  if (/死球/.test(s)) return "死球"

  // 犠打（実況は「送りバント」のみで「犠打」語が無い行が多い。partial 試合の出場成績行と揃えて犠打扱いにする）
  if (/送りバント|犠打|捕犠打|投犠打/.test(s)) return "犠打"

  // 二塁打/三塁打/本塁打/単打（ざっくり）
  if (/ホームラン|本塁打/.test(s)) return "本塁打"
  if (/ツーベース|二塁打/.test(s)) return "二塁打"
  if (/スリーベース|三塁打/.test(s)) return "三塁打"
  if (/ヒット|安打/.test(s)) return "安打"

  return null
}

function parsePlayLine(line: string): { seqInInning: string; batterName: string; rawOutcome: string } | null {
  // 例: "4： 2番 近藤 健介 二死二塁 ... レフトフライ 3アウト"
  const s = (line ?? "").trim()
  const m = s.match(/^(\d+)[：:]\s*(\d+)番\s+(.+)$/)
  if (!m) return null
  const seqInInning = m[1]!
  const rest = m[3]!.trim()

  // 打者名は通常「姓 名」なので2トークンを優先して取る（「無死」「一死」などが来たら1トークン）
  const tokens = rest.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  const situationLike = /^(無死|一死|二死|三死|走者|打者|代打|代走|守備|投手|－)/
  const batterName =
    tokens.length >= 2 && !situationLike.test(tokens[1]!)
      ? `${tokens[0]} ${tokens[1]}`
      : tokens[0]!

  const outcome = inferResultSummaryJaFromSportsnaviPlayLineText(s) ?? ""
  return { seqInInning, batterName, rawOutcome: outcome }
}

/**
 * 実況 1 行から推定した結果で `resultSummaryJa` を埋められるべきか（`supplement` と同じ判定）。
 * 検証スクリプト用。
 */
export function plateAppearanceNeedsTextResultPatch(
  pa: PlateAppearance,
  playLineFullText: string | undefined,
): boolean {
  const line = (playLineFullText ?? "").trim()
  if (!line) return false
  const inferred = inferResultSummaryJaFromSportsnaviPlayLineText(line)
  if (!inferred || isIntermediateTrailingResultJa(inferred)) return false
  const existingRes = (pa.resultSummaryJa ?? "").trim()
  return isIntermediateTrailingResultJa(pa.resultSummaryJa) || !existingRes
}

/** 実況 `lines[]` から paId → 行全文 の対応（検証・デバッグ用） */
export function buildPaIdToSportsnaviPlayLineMap(doc: CanonicalGameDocument): Map<string, string> {
  const m = new Map<string, string>()
  const sections = doc.game?.textPlayByPlay ?? []
  for (const sec of sections) {
    const parts = inningHalfKeyToParts(sec.sectionTitle)
    if (!parts) continue
    for (const line of sec.lines ?? []) {
      const parsed = parsePlayLine(String(line ?? ""))
      if (!parsed) continue
      const paId = `${doc.gameId}-${parts.inning}-${parts.tb}-${parsed.seqInInning}`
      m.set(paId, String(line ?? "").trim())
    }
  }
  return m
}

function buildNameToYahooIdMap(doc: CanonicalGameDocument): Map<string, string> {
  const m = new Map<string, string>()
  const ym = doc.game?.yahooPlayersMentioned ?? {}
  for (const [id, name] of Object.entries(ym)) {
    const n = (name ?? "").trim()
    const i = (id ?? "").trim()
    if (!n || !i) continue
    // 同姓同名の可能性はあるが、補完は best-effort。最初に見つかったものを採用する。
    if (!m.has(n)) m.set(n, i)
  }
  return m
}

/** paId = `gameId-回-表裏-打順` を数値順で比較（localeCompare だと `...-10` が `...-2` より前になる） */
function comparePlateAppearancesByPaId(a: PlateAppearance, b: PlateAppearance): number {
  const pa = a.paId.split("-")
  const pb = b.paId.split("-")
  if (pa.length >= 4 && pb.length >= 4) {
    const gameA = pa.slice(0, -3).join("-")
    const gameB = pb.slice(0, -3).join("-")
    const g = gameA.localeCompare(gameB)
    if (g !== 0) return g

    const innA = parseInt(pa[pa.length - 3]!, 10)
    const innB = parseInt(pb[pb.length - 3]!, 10)
    if (Number.isFinite(innA) && Number.isFinite(innB) && innA !== innB) return innA - innB

    const tbOrder = (t: string) => (t === "表" ? 0 : t === "裏" ? 1 : 99)
    const oa = tbOrder(pa[pa.length - 2]!)
    const ob = tbOrder(pb[pb.length - 2]!)
    if (oa !== ob) return oa - ob

    const boA = parseInt(pa[pa.length - 1]!, 10)
    const boB = parseInt(pb[pb.length - 1]!, 10)
    if (Number.isFinite(boA) && Number.isFinite(boB)) return boA - boB
  }
  return a.paId.localeCompare(b.paId)
}

/**
 * `domain.plateAppearances` の不足分を `game.textPlayByPlay`（スポナビ実況）から補完する。
 * - 追加のみ（既存の打席は上書きしない）
 * - paId は `gameId-回-表裏-その回の打者順`（実況の "4：" の数）を採用し、Phase10 と同じ軸に合わせる
 */
export function supplementPlateAppearancesFromTextPlayByPlay(
  doc: CanonicalGameDocument,
  plateAppearances: PlateAppearance[],
): PlateAppearance[] {
  const sections = doc.game?.textPlayByPlay ?? []
  if (!Array.isArray(sections) || sections.length === 0) return plateAppearances

  const nameToId = buildNameToYahooIdMap(doc)
  const byPaId = new Map<string, PlateAppearance>()
  const indexByPaId = new Map<string, number>()
  for (let i = 0; i < plateAppearances.length; i++) {
    const p = plateAppearances[i]!
    byPaId.set(p.paId, p)
    indexByPaId.set(p.paId, i)
  }
  const out: PlateAppearance[] = [...plateAppearances]

  for (const sec of sections) {
    const parts = inningHalfKeyToParts(sec.sectionTitle)
    if (!parts) continue
    for (const line of sec.lines ?? []) {
      const parsed = parsePlayLine(String(line ?? ""))
      if (!parsed) continue
      const paId = `${doc.gameId}-${parts.inning}-${parts.tb}-${parsed.seqInInning}`

      const inningHalf = `${parts.inning}回${parts.tb}`
      const resultFromText = parsed.rawOutcome || undefined

      const existingPa = byPaId.get(paId)
      if (existingPa) {
        const existingRes = (existingPa.resultSummaryJa ?? "").trim()
        // 1) 中間表記→決着  2) 結果欠損（stats-only partial 等）→実況で補完
        const shouldPatch =
          resultFromText &&
          !isIntermediateTrailingResultJa(resultFromText) &&
          (isIntermediateTrailingResultJa(existingPa.resultSummaryJa) || !existingRes)
        if (shouldPatch) {
          const updated: PlateAppearance = { ...existingPa, resultSummaryJa: resultFromText }
          byPaId.set(paId, updated)
          const idx = indexByPaId.get(paId)
          if (idx != null) out[idx] = updated
        }
        continue
      }

      const batterId = nameToId.get(parsed.batterName)
      if (!batterId) continue

      out.push({
        paId,
        inningHalf,
        yahooBatterId: batterId,
        resultSummaryJa: resultFromText,
      })
      byPaId.set(paId, out[out.length - 1]!)
    }
  }

  out.sort(comparePlateAppearancesByPaId)
  return out
}

