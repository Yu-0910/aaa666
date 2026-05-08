/**
 * [DEPRECATED] Phase 25 で機能を Phase 15 (loadVsHandRowsFromCanonicalWithDebug) に統合済み。
 *
 * 旧仕様 (Phase 15-B):
 *   - canonical から対左右別（vs_hand）を生成し、出場成績（battingLines）で不足分を unknown に寄せて補完。
 *   - 出力先: _data/derived/player_season_batting_vs_hand/{year}/yahoo_*.json
 *   - 1 試合×1 打者で P0 (PA, AB, BB, HBP, SH, SF) を battingLines と突合し、
 *     Δ = battingLinesTotal - (R+L+unknown by PA) > 0 なら unknown に加算。
 *
 * Phase 25 以降の正規ルート:
 *   - `lib/seasonStatsPilot.ts#loadVsHandRowsFromCanonicalWithDebug` が試合単位の Δ 検算を内蔵。
 *   - その結果は `scripts/phase15_build_pa_round_and_situation_from_canonical.ts` の
 *     出力 (`_data/derived/player_season_batting_splits/{year}/yahoo_*.json`) に
 *     `reconciliation` ブロックとして同梱される。
 *   - ファイル B (`player_season_batting_vs_hand/`) はもう生成・参照しない。
 *
 * このファイルは「過去仕様の所在」と「再有効化時の起点」を残すためのスタブ。
 * 旧コード本体は履歴から復元可能（必要なら `git log --diff-filter=D --follow scripts/_deprecated/phase15b_build_vs_hand_backfilled_from_canonical.ts` 等で参照）。
 */

function main(): void {
  // eslint-disable-next-line no-console
  console.error(
    [
      "[phase15b] DEPRECATED: Phase 25 で Phase 15 に統合済みです。実行する必要はありません。",
      "  - 対左右別の Δ 検算は loadVsHandRowsFromCanonicalWithDebug に移行しました。",
      "  - 出力は _data/derived/player_season_batting_splits/{year}/ の reconciliation ブロックで確認できます。",
    ].join("\n"),
  )
  process.exit(0)
}

main()
