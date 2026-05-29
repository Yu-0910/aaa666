# Phase 1 実装メモ: 出場成績末尾列の canonical 格納

親計画: `docs/plan_batting_derived_appearance_stats_primary_phases.md`（Phase 1）

## 実装内容

1. **`BattingLine.appearancePaSlotsJa`**  
   出場成績 `cells[14..]` を trim した配列（打席結果スロット。空文字は未使用列）。

2. **`PitchingLine.appearanceVsBfSlotsJa`**  
   投手行の同一末尾列（対戦打者の結果が並ぶ列のスナップショット。Phase 2 の対左右フォールバック材料）。

3. **共通ロジック**（`lib/yahooGame/appearanceStatsTrailingCells.ts`）  
   - `STATS_ROW_APPEARANCE_START_INDEX`（14）  
   - `extractAppearanceStatSlotsFromCells`  
   - `countNonEmptyAppearanceSlots`  
   - `diagnoseBattingAppearanceSlotsVsPlateAppearances` … 試合単位で「非空スロット数 N」と `plateAppearances` 件数 M の簡易突合。

4. **取り込み経路の同期**  
   - `lib/yahooGame/buildCanonical.ts` の `inferBattingLineFromStatsRow` / `inferPitchingLineFromStatsRow`  
   - `lib/yahooGame/sportsnaviStatsTextParse.mjs`（Node Phase2 canonical ビルドと同一出力になるよう **同一ロジックを二重管理**）

5. **検証**  
   - `npm run validate:appearance-phase1` → `scripts/validate_appearance_phase1_unit.ts`（合成データでの assert）

## 運用

- **既存 canonical を更新**するには `npm run phase2:sportsnavi:canonical`（または該当 game の `--force`）で再ビルドすると、新フィールドが付与される。
- 旧 JSON にフィールドが無い場合、`diagnoseBattingAppearanceSlotsVsPlateAppearances` は `appearancePaSlotsJa` 未設定の打者を **N=0** として扱う。

## Phase 2 第1段（集計の打席結果）

- **`buildAppearanceZipResultOverrides(doc)`** … 非空スロット数 = dedupe 後の当該打者打席数のときだけ `paId` → 出場成績文言。  
- **`plateAppearanceResolvedResultText(doc, pa)`** … zip があればスロット、なければ `plateAppearanceLastResultText`。WeakMap で試合 doc ごとに zip をキャッシュ。  
- **適用**: `updateBattingAggFromPa`（第4引数 `doc` 省略時は従来どおり）、RISP、ハイブリッドの PA 由来補完、`aggregateBattingSeasonByYahooBatter`、ハイブリッド本流、`seasonStatsPilot` 対左右。

## 未着手（Phase 2 続き / Phase 3）

- **`N !== M`** のときのフォールバック・運用ログ・旧挙動との差分レポート自動化。  
- 派生バッチ（`phase15` 等）の `updateBattingAggFromPa` 呼び出しに `doc` を渡すと zip が効くが、**省略時は従来挙動**のまま。

## Phase 3 準備（実行前チェック）

- **`TOPPAGE_APPEARANCE_PRIMARY`**: `0` 等で zip を切り、Phase 2 着手直前相当の打席結果解決に戻せる（`appearancePrimaryFeatureFlag.ts`）。  
- **`npm run diag:appearance-primary-zip`**: 試合ごとの zip 件数・`N`/`M` 診断行数のスナップショット。  
- 手順・ゴールデン候補・チェックリスト: `docs/batting_appearance_phase3_prep.md`。  
- **計画 Phase 5** の標準順序では、canonical 再ビルドのあと **`npm run appearance:phase3`** で診断する（`docs/plan_batting_derived_appearance_stats_primary_phases.md`）。
