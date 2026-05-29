# 計画書: 打席結果を「出場成績のみ」運用に固定する（Phase 分割）

## メイン（本計画の中心）

**本計画のメインは「数えるときを出場成績だけにする」ことである。**

具体的には、安打・打数・三振など **打席結果に依存する派生集計**で参照する文言を、**出場成績の末尾列（`appearancePaSlotsJa` 相当／`statsPlayerLinkedRows[].cells[14..]`）からだけ決める**。  
`plateAppearanceResolvedResultText` が **`resultSummaryJa` や一球の `resultJa` にフォールバックしない**モード（本書では **`appearance_only`** と呼ぶ）を **Phase 2 でコードに実装し、本番既定にする**ことを、本計画の **完了条件の中核**とする。

**Phase 1 以下の取得・canonical 再生成・npm スクリプト**は、上記を **成立させるための前提**（出場列が JSON に載っていない試合を直す・再現手順を揃える）であり、**メインそのものの代替ではない**。

---

## 0. 位置づけ

- **既存計画**（出場主軸＋不足は一球で補う）: `docs/plan_batting_derived_appearance_stats_primary_phases.md`  
  本計画はその **延長ではなく方針の絞り込み**である。  
- **通算の数え方（ランキング・個人ページ）**: **後続計画で本番化済** — `docs/plan_ranking_profile_appearance_slots_only_phases.md`（`TOPPAGE_BATTING_SEASON_AGG=appearance_slots` 既定）。手順は `docs/data_operation_rules.md` §一括取得方針。  
  **打席結果（どの文言で打席を確定するか）** を **出場成績の末尾列だけ**に固定し、一球速報由来の **要約・最終球へのフォールバックを打席確定には使わない**（※一球は別用途で継続利用する。下記「見出しごとのソース割当」）。

- **課題の整理**: ハイブリッド（行＋打席／要約＋出場 zip）では、**同じ試合でも数え方が二系統あり得る**。運用を「出場のみ」に寄せることで **打席確定の根拠を一本化**する。

---

## 1. 目的（メイン優先の並び）

1. **（メイン）** 派生集計で **打席を数えるとき**、確定文言を **出場成績の末尾列のみ**から得る（`appearance_only` を Phase 2 で実装）。  
2. **打席結果の正**を上記に限定するため、一球速報は **打席確定の代替テキストとしては用いない**（配球・状況・ログ保存など **別見出し**では引き続き活用）。  
3. **公式記録やスポナビ通算との差**は別フィールドで保持する方針に沿い、本計画完了後の **派生 `h` は「出場ベースの自前再現」** と明記する。  
4. **（前提・運用）** 出場列が canonical に載るよう、**過去試合の再取得・再ビルド**と **一括取得の手順**を npm と文書で再現可能にする（Phase 1・5・`data_operation_rules.md`）。

---

## 2. 見出しごとのソース割当（出場成績 vs 一球速報）

| 見出し（領域） | 活用するソース | 備考 |
|----------------|----------------|------|
| **打席結果テキスト（1 打席あたりの確定文言）** | **出場成績のみ** | zip も要約も使わず、末尾列のみを正とする（Phase 2 でコード反映）。現状は `plateAppearanceResolvedResultText` が zip／要約を含むため **移行対象**。 |
| **シーズン打撃派生の打数・安打など（打席結果に依存する列）** | **出場成績由来の打席確定に従う** | Phase11 等。公式値は別フィールド。 |
| **一球ログ（投球イベント・スピード・球種・ゾーン）** | **一球速報** | 出場成績では代替不能。 |
| **配球・コース可視化** | **一球速報** | 変更なし。 |
| **得点圏・走者状況シミュレーション** | **一球速報**（＋ canonical 上の補助） | 出場末尾列だけでは不足がち。 |
| **テキスト速報本文・プレー見出し（`playHeadlineJa` 等）** | **一球速報／テキスト HTML** | 出場表とは別チャネル。 |
| **スポナビ raw 取得（stats / text）** | **両方取得**（運用上セット） | `stats` が空の canonical は再取得対象（Phase 5）。 |
| **公式・スポナビ通算の表示値** | **別 API／別フィールド** | 本計画の派生と混同しない。 |

---

## 3. スコープ

- **対象（メイン）**: **集計時の打席結果解決**（`canonicalBattingSeasonAgg.ts` の `plateAppearanceResolvedResultText` 経路および `updateBattingAggFromPa` 等）。**`appearance_only` の実装・既定化が本計画の中心成果**。  
- **対象（前提）**: 出場末尾列の canonical への載せ方、Phase2 取得・再ビルド、派生再生成の **運用ドキュメント・npm**。  
- **対象外（当面）**: 球種コースページのデータソース＝一球の前提変更。  
- **リスク**: 出場表が **CSR 空テーブル**のまま保存された試合は、**出場のみ運用では安打が欠落**する。→ **再取得（Phase 1・5）が前提**。

---

## 4. Phase 別作業計画

**完了の定義**: **Phase 2 がマージされ、本番で `appearance_only` が有効な状態で派生が再生成されていること**。Phase 1 の npm だけでは「メイン」は未完了。

### Phase 0: 用語と「正」の固定

- 「打席結果＝出場のみ」の定義を一文で固定する（**非空スロット数と打席 ID の対応**をどう扱うか含む）。  
- 既存の `TOPPAGE_APPEARANCE_PRIMARY`（zip 有効／無効）との関係: **zip も打席確定に使わない**なら、新フラグ（案: `TOPPAGE_PLATE_RESULT_SOURCE`）で **appearance_only** を表す（Phase 2）。  
- 既存 `plan_batting_derived_appearance_stats_primary_phases.md` との差分表を 1 セクションでよい。

**成果物**: 本ファイル **§7（Phase 0 完了記録）** および §1〜3＋ `docs/data_operation_rules.md` へのリンク（Phase 6 で最終整合）。

### Phase 1: データ経路（取得 → canonical）— メインの前提

- **一括取得**: `npm run appearance:stats-refetch-incomplete`（`--only-incomplete` 相当）を定期・手動の入口にする。  
- **指摘試合の再取得**: `npm run appearance:replay-plate-canonical -- --year YYYY --game-ids id1,id2`（raw 再 fetch → canonical 再ビルド）。  
- canonical に **`statsPlayerLinkedRows` が必ず埋まる**ことをゴールに、Phase2 fetch の **遅延再試行**・`--force` 運用を文書化する。

**成果物**: `package.json` の npm スクリプト、`scripts/run_appearance_plate_result_replay.mjs`。  
**注意**: 本 Phase のみ完了しても、**数え方は従来のまま**（メインの Phase 2 未実装のため）。

### Phase 2: 集計コード（メイン）— 打席確定＝出場末尾列のみ

- **`appearance_only` 実装**: `updateBattingAggFromPa` 等が参照する文言を、**出場末尾列から導出した文字列だけ**に固定する。  
  **`plateAppearanceResolvedResultText` は要約（`resultSummaryJa`）・一球 `resultJa` にフォールバックしない**（zip による要約上書きも **打席確定には使わない**方針で設計する。既存 `TOPPAGE_APPEARANCE_PRIMARY` との関係は Phase 0 で固定）。  
- **出場列が無い打席**の扱い（0 安打・警告ログ・試合除外）を決める。  
- ユニットテスト・回帰: 代表試合＋ **stats 空だった試合は再取得後に列が載ること**。

**成果物**: `lib/yahooGame/` のフラグ読み取り＋集計分岐。**本計画のメイン完了は本 Phase のマージをもって満たす。**

### Phase 3: 検証・診断

- `npm run validate:appearance-phase1` を維持。  
- `npm run appearance:phase3`（N/M・zip）の **説明・閾値**を、`appearance_only` では **打席確定に zip を使わない**前提に合わせて更新する。  
- 診断: `scripts/diag_batter_appearance_slots_hits_by_game_date.ts --season-total` で **出場のみ通算**を出し、派生 `h` と並べて比較できるようにする。

**成果物**: `docs/batting_appearance_phase3_prep.md` 追記または本ファイルに検算手順をリンク。

### Phase 4: 過去試合再生成ゲート

- **対象年度の canonical** で `statsPlayerLinkedRows` が空の試合リストを機械抽出し、**再取得リスト**を作る。  
- リストをゼロに近づけたあと、**限定派生再生成**（少数打者・退避ディレクトリ）でスモーク。  
- Go/No-Go: 既存 Phase4 チェックリストを流用できる部分と、**appearance_only 固有**（欠損試合数）を追加。

**成果物**: チェックリスト追記案（別ファイル化してもよい）。

### Phase 5: 本番一括（過去＋今後）

**正本（取得〜派生の一本化）**: `docs/data_operation_rules.md` §「**一括取得方針（2026以降・本番）**」。

- **過去の埋め直し**: `appearance:stats-refetch-incomplete` → `appearance:replay-plate-canonical`（必要試合）→ 派生は `npm run appearance-slots:phase5:rebuild-2026`（通算は **appearance_slots**）。  
- **今後**: `npm run daily:npb-pipeline`（Phase2a-repair で incomplete 再取得済み）。派生は **`appearance_only` + `appearance_slots`** 既定（`childEnv`）。

**成果物**: 上記 § 一括取得方針（本計画の打席確定＋`plan_ranking_profile_appearance_slots_only_phases.md` の通算を統合）。

### Phase 6: クローズ

- フラグ既定値（本番は `appearance_only` か）を決め、関係者周知。  
- 本計画をクローズ。

**記録**: §10。

---

## 5. 既知の問題（Chat で共有済みの論点）

- **stats HTML が空の canonical**（例: `2021038855`）では、**出場のみ運用ではその試合の安打が 0 扱い**になり得る。→ **Phase 1 の再取得が治療**。  
- **Phase11 の `h` と手数え 37／出場のみ 34** のような差は、**欠損＋定義差**で説明可能。公式値は別フィールド。

---

## 6. 参照コマンド（抜粋）

| 目的 | コマンド |
|------|----------|
| 出場表が薄い試合だけ再 fetch | `npm run appearance:stats-refetch-incomplete` |
| 指定試合を fetch→canonical 再生成 | `npm run appearance:replay-plate-canonical -- --year 2026 --game-ids 2021038855` |
| 再ビルドのみ（fetch 済み） | `npm run appearance:replay-plate-canonical -- --year 2026 --game-ids … --skip-fetch` |
| 診断（出場末尾列のみ通算） | `npx tsx scripts/diag_batter_appearance_slots_hits_by_game_date.ts --yahoo-id 1851204 --year 2026 --season-total` |

---

## 7. Phase 0 完了記録（実行）

### 7.1 「打席結果＝出場のみ」の一文定義

**本計画における「打席結果」**とは、派生集計で `hitBases` / `isAtBat` に渡す **1 打席あたりの結果テキスト**を、当該打者の **出場成績末尾列**（`BattingLine.appearancePaSlotsJa` に相当する列／canonical 上は `game.statsPlayerLinkedRows[].cells[14..]` から抽出した非空セルの並び）から **のみ**決めることをいう。  
**`paId` と非空セルの zip**、`plateAppearances[].resultSummaryJa`、一球 `pitchEvents[].resultJa` は **打席結果の確定には用いない**（Phase 2 の `appearance_only` でコード化する）。

「非空スロット数 N と dedupe 後の打席数 M」の扱いは、従来 `lib/yahooGame/appearanceStatsTrailingCells.ts` の診断に準ずる。`appearance_only` では打席確定に zip を使わないため、**N≠M の試合では出場列だけでは打席別に一意に決められない**ことがあり得る。その場合のフォールバック（警告・試合除外・暫定 0 等）は **Phase 2 実装時に仕様として固定**する。

### 7.2 環境フラグ（実装済）

| フラグ | 役割（実装） |
|--------|----------------|
| **`TOPPAGE_PLATE_RESULT_SOURCE`** | `lib/yahooGame/plateResultSourceFeatureFlag.ts`。未設定または `appearance_only` … 出場末尾列由来の zip のみ（未該当は空文字）。`hybrid` … zip＋要約／一球フォールバック。 |
| **`TOPPAGE_APPEARANCE_PRIMARY`** | `lib/yahooGame/appearancePrimaryFeatureFlag.ts`。`0` / `off` … zip 経路を使わず要約／一球のみ（緊急ロールバック）。 |

### 7.3 既存計画書との差分（要点）

| 項目 | `plan_batting_derived_appearance_stats_primary_phases.md`（既存） | 本計画（出場のみ） |
|------|-------------------------------------------------------------------|---------------------|
| 打席確定の第一 | 出場 zip が取れた打席は **出場文言で上書き**、それ以外は **要約・一球**へフォールバック | **常に出場末尾列のみ**（要約・一球は打席確定に使わない） |
| 一球の位置付け | 不足分の補完 | **打席確定には使わない**（配球・状況・ログは引き続き一球） |
| 完了の中心 | 主軸＋補完のハイブリッド | **`appearance_only` の集計コード（Phase 2）** |

---

## 8. Phase 1 実行ログ

### 8.1 実行コマンド

- `npm run appearance:stats-refetch-incomplete` … 出場／テキストが薄い試合のみ再 fetch（2026 年度）。  
- `npm run appearance:replay-plate-canonical -- --year 2026 --game-ids 2021038855` … 欠損例として知られる試合の fetch→canonical（必要に応じて追試行）。

### 8.2 結果（ローカル実行・2026-05-14 頃）

実行者のターミナル（`TopPage` 直下）より転記。

| 手順 | コマンド | 結果 |
|------|----------|------|
| 診断（再 fetch 前） | `npx tsx scripts/diag_batter_appearance_slots_hits_by_game_date.ts --yahoo-id 1851204 --year 2026 --season-total` | `h_appearance_slots=34`, `nonempty_slots=131`, `games_with_slots_or_hits=35` |
| incomplete 再 fetch | `npm run appearance:stats-refetch-incomplete` | **1 / 235** 試合が対象。**`2021038806`** の stats/text を再取得（`incompleteRetries=2`）。 |
| 指定試合 replay | `npm run appearance:replay-plate-canonical -- --year 2026 --game-ids 2021038855` | fetch `--force` OK → **`2021038855` canonical `wrote`**、`thinOrIncomplete=0`。 |
| 診断（replay 後） | 同上 `--season-total` | **`h_appearance_slots=37`**, `nonempty_slots=135`, `games_with_slots_or_hits=36`（replay 前の 34 / 131 / 35 から更新）。 |

**ワークスペース確認**: `canonical/2021038855.json` に **`statsPlayerLinkedRows` が非空**で、`yahooPlayerId: "1851204"` の行が含まれることを確認済み（5/13 の欠損は解消）。

**補足**: replay 後の `--season-total` で **安打 34→37** が確認できた（手数え 37・Phase11 `h` 38 との差は、別ルール／別ソースの整理対象として Phase 2 以降で扱う）。

**任意の続き**: 計画書フッタのとおり `npm run appearance:phase3` → 必要なら `npm run phase10:yahoo:restore` → `npm run rebuild:batting-profile-and-rankings-2026`。

---

## 10. Phase 6 クローズ記録

**日付**: 2026-05-15  
**ステータス**: 本計画（出場成績のみで打席確定する方針）の **Phase 6 をクローズ**する。

### 10.1 本番既定（打席確定）

| 項目 | 内容 |
|------|------|
| **既定** | **`TOPPAGE_PLATE_RESULT_SOURCE` を未設定**（または明示的に `appearance_only`）とし、派生集計では **出場末尾列由来の zip のみ**を用いる。zip に載らない打席は **空文字**（要約・一球へフォールバックしない）。 |
| **旧挙動への退避** | `TOPPAGE_PLATE_RESULT_SOURCE=hybrid` … zip が取れない打席は従来どおり要約／一球へ。 |
| **緊急** | `TOPPAGE_APPEARANCE_PRIMARY=0`（または `off` 等）… zip 経路をオフにし **要約／一球のみ**（`appearancePrimaryFeatureFlag.ts`）。 |
| **実装参照** | `lib/yahooGame/canonicalBattingSeasonAgg.ts`（`plateAppearanceResolvedResultText`）、`lib/yahooGame/plateResultSourceFeatureFlag.ts` |

### 10.2 周知・成果物

- **派生 JSON**: `npm run phase11:build:batting` 生成物に **`plateResultAppearanceOnly`** を付与（ビルド時点の既定が分かる）。  
- **運用**: `docs/data_operation_rules.md` の「打撃派生」節に本既定への参照を記載する。

### 10.3 Phase 4 ゲートについて

`docs/batting_appearance_phase4_gate_checklist.md` の全項目を必須とせず運用した場合の記録: **プロジェクト判断で validate／チェックリストを省略しつつ**、Phase 1・5 の再取得・`rebuild:batting-profile-and-rankings-2026` および任意の `backup:player-season-batting:2026` でリスクを下げた。**親計画**（`plan_batting_derived_appearance_stats_primary_phases.md` の Phase 4〜6）のゲートとは別軸である。

---

## 9. 改訂履歴

| 日付 | 内容 |
|------|------|
| 2026-05-14 | 初版（計画書・運用 npm・replay スクリプト） |
| 2026-05-14 | **「メイン＝出場のみで数える（Phase 2）」を冒頭・目的・スコープ・完了定義に明示**。Phase 1 を前提に位置づけ。 |
| 2026-05-14 | **Phase 1 実行ログ（§8.2）をローカル結果で更新**（`2021038806` incomplete、`2021038855` replay 成功）。 |
| 2026-05-14 | **§8.2 に replay 後 `--season-total` を追記**（`h_appearance_slots` 34→37 等）。 |
| 2026-05-15 | **Phase 6 クローズ（§10）**。§7.2 を実装済フラグ表に更新。§4 Phase 6 に記録先を追記。 |
