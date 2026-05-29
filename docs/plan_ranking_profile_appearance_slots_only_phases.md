# 計画書: ランキング・個人ページを「出場末尾列だけ」で数える（Phase 分割）

## メイン（本計画の中心）

**ランキング（Phase12）と個人ページ（Phase11）の通算打撃**について、安打・打数・三振など **打席結果に依存する指標**を、**出場成績テーブル末尾列**（`appearancePaSlotsJa` / `statsPlayerLinkedRows[].cells[14..]`）の **非空セルごと**に `hitBases` / `isAtBat` で積み上げる。

従来の **`aggregateBattingSeasonByYahooBatterHybridForProfiles`（行の数値列 `line.h` / `line.ab` 優先）** は **ロールバック用**（`TOPPAGE_BATTING_SEASON_AGG=hybrid` を明示したときのみ）。**本番既定は `appearance_slots`**（`battingSeasonAggSourceFeatureFlag.ts`）。

### 既存計画との関係

| 計画 | 内容 | 本計画との関係 |
|------|------|----------------|
| `plan_batting_derived_appearance_stats_primary_phases.md` | 出場 zip・N/M | 前提・診断 |
| `plan_plate_result_appearance_only_operation_phases.md`（Phase 6 クローズ） | 打席**テキスト**の一球フォールバック停止 | **未完了部分を本計画が担う**（通算の数え方は依然 `line.h` だった） |

---

## 0. 用語

| 用語 | 意味 |
|------|------|
| **出場末尾列** | 出場成績表の打席結果セル列（index 14 以降） |
| **hybrid 集計** | `battingLines` の **H/AB 等の数値列**を試合ごとに加算（従来） |
| **appearance_slots 集計** | 末尾列の **非空セル = 1 打席**として `updateBattingAggFromResultJa` で加算（新） |
| **得点・打点の補完** | 末尾列に無い **R/RBI** は、同一試合の `battingLines` 数値列から加算（表示用。打席結果列ではない） |

---

## 1. 環境変数

| 変数 | 値 | 効果 |
|------|-----|------|
| **`TOPPAGE_BATTING_SEASON_AGG`** | 未設定 / **`appearance_slots`**（**本番既定**） | `aggregateBattingSeasonByYahooBatterFromAppearanceSlots` |
| | `hybrid` | ロールバック: 従来ハイブリッド（`line.h` / `line.ab` 優先） |
| `TOPPAGE_PLATE_RESULT_SOURCE` | 未設定 = `appearance_only` | 打席テキストの一球フォールバック停止（既存） |

実装: `lib/yahooGame/battingSeasonAggSourceFeatureFlag.ts`  
エントリ: `aggregateBattingSeasonForProfilesAndRankings`（`canonicalBattingSeasonAgg.ts`）

---

## 2. Phase 別作業

### Phase 0: 仕様固定（本ファイル §0・§1）

- 完了条件: 本計画の「メイン」定義とフラグ名が確定していること。

### Phase 1: 集計コード（実装）

- [x] `updateBattingAggFromResultJa`（打席 1 件分の共通更新）
- [x] `aggregateBattingSeasonByYahooBatterFromAppearanceSlots`
- [x] `aggregateBattingSeasonForProfilesAndRankings`（Phase11/12 から呼ぶ）
- [x] Phase11 JSON に `battingSeasonAggSource` を付与

**未着手（任意）**: ユニットテスト（合成 canonical で 1 試合 1 打者の H が末尾列カウントと一致）

### Phase 2: バックアップ

**目的**: 本番切替前に hybrid 時代の派生を退避する。

```bash
npm run appearance-slots:phase2:backup
```

退避先（既定）:

- `_data/derived/_backup_before_appearance_slots_2026/player_season_batting/`
- `_data/derived/_backup_before_appearance_slots_2026/rankings_pl/`

既存の `npm run backup:player-season-batting:2026` も併用可（スモーク用退避）。

### Phase 3: 診断・比較コマンド

| 目的 | コマンド |
|------|----------|
| 出場末尾列のみの日別・通算 | `npx tsx scripts/diag_batter_appearance_slots_hits_by_game_date.ts --yahoo-id <id> --year 2026 --season-total` |
| N/M・zip | `npm run appearance:phase3` |

**期待**: `appearance_slots` 再生成後の Phase11 `h` は、診断の `h_appearance_slots` と **一致**（同一ルール）。

### Phase 4: パイロット（単独打者）

**レイエス（Yahoo `1860140`）** で新集計を試す。

```bash
npm run appearance-slots:phase4:pilot
```

手順（スクリプト内）:

1. Phase 2 バックアップ（未実施なら）
2. `TOPPAGE_BATTING_SEASON_AGG=appearance_slots` で Phase11 **1 選手のみ**再生成
3. 診断スクリプトと `h` を表示比較

**Go**: Phase11 `rows[0].h` = 診断 `h_appearance_slots`（例: 45）。  
**No-Go**: 差が大きい場合は canonical 欠損・N≠M 試合を Phase 3 で洗い、Phase 1 再取得後に再パイロット。

### Phase 5: 本番一括再生成（2026・ランキング＋個人）

**前提**: Phase 4 Go、Phase 2 バックアップ済み。

```bash
npm run appearance-slots:phase5:rebuild-2026
```

中身（概略）:

1. `TOPPAGE_BATTING_SEASON_AGG=appearance_slots`
2. `npm run phase11:build:batting`
3. `npm run validate:batting-stats`（必要に応じ閾値見直し）
4. `npm run phase15:build:batting-splits`（打席結果依存スプリットは appearance 経路の影響を受ける）
5. `npm run phase12:build:rankings`
6. `npm run validate:batting-phase11-vs-phase12`

**ロールバック**: バックアップを戻す、または `TOPPAGE_BATTING_SEASON_AGG=hybrid` で Phase 5 を再実行。

### Phase 6: 一括取得・日次パイプライン方針の更新

**正本**: `docs/data_operation_rules.md` §「**一括取得方針（2026以降・本番）**」。

**要約**:

1. **取得**: スポナビ Phase0〜2 ＋ 日次の `--only-incomplete` 再取得は従来どおり。**出場成績 HTML が canonical に載ること**をゲート（`validate:phase2-canonical-nonempty`）。
2. **集計（本番固定）**: `appearance_only`（打席文言）＋ `appearance_slots`（通算・ランキング）。一球の要約・`line.ab` は打席結果の正にしない。
3. **日次**: `npm run daily:npb-pipeline` — 取得後の Phase11/12 は `childEnv` で上記二フラグを固定。
4. **手動一括**: `npm run appearance-slots:phase5:rebuild-2026`（退避・validate 付き）または `rebuild:batting-profile-and-rankings-2026`。

**実装済（2026-05-15 以降）**: `battingSeasonAggSourceFeatureFlag` 既定 = `appearance_slots`；`run_daily_npb_pipeline.mjs` の `childEnv`；`plateResultSourceFeatureFlag` 既定 = `appearance_only`（日次でも明示）。

### Phase 7: クローズ

- [x] Phase 4 パイロット記録（2026-05-15・レイエス `1860140`: Phase11 `h=45` = 診断 `h_appearance_slots=45`, `pa=157`, `ab=147`, `battingSeasonAggSource=appearance_slots`）
- [x] Phase 5 実行記録（2026-05-15・`appearance-slots:phase5:rebuild-2026` 成功: Phase11 329、validate:batting-stats OK、Phase15 335、PL/CL rankings、validate:batting-phase11-vs-phase12 OK）
- [x] 本番 `TOPPAGE_BATTING_SEASON_AGG=appearance_slots` をビルド時に常時固定（`battingSeasonAggSourceFeatureFlag` 既定 + 日次 `childEnv`）
- [ ] 本ファイル Phase 7 クローズ日（全派生 JSON の再生成・サイト反映後）

---

## 11. Phase 4 パイロット実行ログ（2026-05-15）

| 項目 | 値 |
|------|-----|
| コマンド | `npm run appearance-slots:phase4:pilot` |
| バックアップ | Phase11 335 件 + PL rankings 72 件 → `_data/derived/_backup_before_appearance_slots_2026/` |
| 診断 `h_appearance_slots` | **45** |
| Phase11 `h` / `pa` / `ab` | **45** / **157** / **147** |
| `battingSeasonAggSource` | `appearance_slots` |

**判定**: Go（末尾列カウントと Phase11 安打が一致）。次は Phase 5 本番一括。

---

## 12. Phase 5 本番一括実行ログ（2026-05-15）

| 手順 | 結果 |
|------|------|
| Phase2 バックアップ | 407 ファイル退避 |
| Phase11 | **329** ファイル（`TOPPAGE_BATTING_SEASON_AGG=appearance_slots`） |
| validate:batting-stats | **OK** |
| Phase15 splits | **335** ファイル |
| Phase12 | CL 200 打者 / PL **129** 打者 × 36 指標 |
| validate:batting-phase11-vs-phase12 | **OK**（329 選手） |

**確認例（レイエス）**: Phase11・PL 安打ランキングとも **H=45**, `battingSeasonAggSource=appearance_slots`（旧 hybrid 44 から更新）。

---

## 3. 既知の制約

1. **stats HTML が空の試合** … 末尾列なし → その試合は 0 扱い（再 fetch が必要）。  
2. **N≠M** … 出場列と一球打席数不一致の試合は、末尾列だけでは打席別に一意に決められない（診断でリスト化）。  
3. **R/RBI** … 末尾列に無いため **行の数値列から補完**（厳密な「すべて末尾列のみ」ではない）。Phase 7 以降で tex t 速報補完を検討可。  
4. **対左右・状況別** … Phase15 等は別パイプライン。Phase 5 後に `validate:vs-hand` を推奨。

---

## 4. 参照コマンド一覧

| Phase | npm / コマンド |
|-------|----------------|
| 2 | `npm run appearance-slots:phase2:backup` |
| 3 | `npm run appearance:phase3` / `diag_batter_appearance_slots_hits_by_game_date.ts` |
| 4 | `npm run appearance-slots:phase4:pilot` |
| 5 | `npm run appearance-slots:phase5:rebuild-2026` |
| 退避のみ | `npm run backup:player-season-batting:2026` |

---

## 5. 改訂履歴

| 日付 | 内容 |
|------|------|
| 2026-05-15 | 初版。Phase 1 コード・npm・本計画作成。旧 `appearance_only` 計画の「通算が line.h のまま」ギャップを明示。 |
| 2026-05-15 | Phase 4 パイロット成功（レイエス H=45）。§11 実行ログ追加。 |
| 2026-05-15 | Phase 5 本番一括成功。§12 実行ログ追加。 |
