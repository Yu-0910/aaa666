import type { RunnerEvent } from "./types"

/**
 * 走者イベントをレイヤー順にマージする。先に渡した配列ほど優先。
 * 同一キー `kind|inningHalf|yahooRunnerId` は先勝ち。
 * 本番 canonical の runnerEvents は score のみ（`runnerEventsScoreOnlyForCanonical.ts`）。本関数はレガシー／診断用。
 */
export function mergeRunnerEventsByPriority(
  layers: Array<RunnerEvent[] | undefined | null>,
): RunnerEvent[] | undefined {
  const seen = new Set<string>()
  const out: RunnerEvent[] = []
  for (const layer of layers) {
    if (!Array.isArray(layer)) continue
    for (const e of layer) {
      if (!e?.yahooRunnerId || !e.kind) continue
      // inningHalf が欠けるイベントが混ざると重複排除が効かず、集計で二重計上の温床になりうる。
      // 可能な限り安定キーを作る（基本は kind|inningHalf|runnerId、無い場合は sourceLine も含める）。
      const ih = String(e.inningHalf ?? "").trim()
      const sl = String((e as { sourceLine?: string })?.sourceLine ?? "").trim()
      const k = ih
        ? `${e.kind}|${ih}|${e.yahooRunnerId}`
        : `${e.kind}|${e.yahooRunnerId}|${sl}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push(e)
    }
  }
  return out.length > 0 ? out : undefined
}
