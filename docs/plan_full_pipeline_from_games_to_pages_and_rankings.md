# 試合情報（スポナビ）→ 計算 → 個人ページ/ランキング表示 2026 計画書

目的: **試合情報を取得すれば**、個人ページとランキングページが **自動で計算され表示できる** 仕組みにする。  
要件: 取りこぼし検知、雨天中止→後日追加日程も追従、運用はコマンドで回せる（段階的に整備）。

前提:
- 入力の一次ソースはスポナビ（Sportsnavi / Yahoo!）の日程・試合ページ。
- まずは **2026年**を対象にし、過去シーズンは後続フェーズで拡張する。
- 既存の `_data/master_csv*` ベースランキングは当面併走可（移行は段階的）。

---

## データレイヤ（最終的に“これだけ”で回る状態）

### 1) Raw / Snapshot（スポナビ）
- 日程ページのスナップショット（HTML/JSON）
- 試合ページのスナップショット（HTML/JSON）

### 2) Canonical（正規化された1試合データ）
- 例: `_data/scraped_games/canonical/{gameId}.json`
- `plateAppearances`, `pitchEvents`, `battingLines`, `pitchingLines`, `startingLineup`, `scoreboard`, `textPlayByPlay` を含む

### 3) Derived（表示・ランキング用の派生集計）
- 個人ページ用（投手・野手・捕手）
- ランキング用（年度×リーグ×指標）
- **規定到達メタ**（任意・規定打席/規定投球回が必要な指標用）: 所属チームの試合数・閾値・到達可否

### 4) Public JSON（ランキングページが読む最終成果物）
- `public/data/rankings/.../*.json`

---

## Phase設計（“一括実行できる単位”で束ねた計画）

以下は「Phase = 1回のコマンドで回せる単位」を原則に設計する。**Phase 番号は自然数のみ**（小数なし）。  
すでに存在する npm スクリプト名（例: `phase11:build:batting`）は派生ビルドの通称であり、本節の Phase 番号とは別レイヤ。

---

## Phase 0: スケジュール取得・監視（取りこぼしゼロの入口）

### 目的
- 全試合の gameId を確実に列挙し、**中止/延期/再編成**を差分で追跡する。

### 入力
- スポナビ日程（例: `.../schedule/first/league?date=YYYY-MM-DD`）

### 範囲（2026の前提）
- **ペナントレース（リーグ戦）は 2026-03-27 以降**を対象（それ以前のオープン戦等は取得しない）。

### 出力（提案）
- `_data/sportsnavi_schedule_snapshots/by_date/YYYY-MM-DD.json`
- `_data/sportsnavi_schedule_index/season_2026.json`（全gameIdの集合＋メタ）
- `_data/sportsnavi_schedule_diff/YYYY-MM-DD.json`（前回との差分）

### 取りこぼし検知
- 日別件数の急変、0件日
- 週次: 順位表の勝敗合計 vs finalゲーム数（整合チェック）

---

## Phase 1: 試合ページ取得（スポナビ→Raw）

### 目的
- Phase0で列挙した全gameIdについて、試合ページの必要情報を取得する（**差分更新込み**）。

### 入力
- `_data/sportsnavi_schedule_index/season_2026.json`（gameId一覧）

### 出力（提案）
- `_data/scraped_games/raw_sportsnavi/{gameId}.html`（実装既定）および `_meta` / `_failures.json`
- 取得ログ（成功/失敗/リトライ回数）

### 運用
- 毎日: 当日分＋前後バッファ（D-2..D+2）を **必ず再取得**（結果反映の遅延・中止表示の更新に追従）
- 週次: 未来（D..D+30）を再取得して **再編成（9月以降の追加日程）** を拾う
- 日次/週次ともに「未取得 gameId」「更新がありそうな gameId」を優先し、失敗はリトライキューへ

---

## Phase 2: Canonical生成（Raw→canonical）

### 目的
- Rawを **サイト内の正規形式**に変換し、以降の派生計算が canonical だけで回るようにする。

### 入力
- `_data/scraped_games/raw_sportsnavi/{gameId}.html` 等

### 出力
- `_data/scraped_games/canonical/{gameId}.json`

### 成功条件
- `startingLineup`, `scoreboard`, `pitchingLines`, `battingLines` が基本揃う
- `plateAppearances` / `pitchEvents` は可能な限り揃える（無い場合は `missingOrPartial` に理由を記録）

---

## Phase 3: 個人ページ用 派生（canonical→derived for player pages）

### 目的
- 個人ページ表示に必要な集計を **canonicalだけ**から生成する。

### 入力
- `_data/scraped_games/canonical/*.json`
- 名簿・ID橋渡し（NPB roster / yahoo→npb map）

### 出力（例）
- 投手:
  - `_data/derived/player_season_pitching_poc/{year}/npb_*.json`（既存）
  - `_data/derived/player_season_pitching_period/{year}/npb_*.json`（既存）
  - `_data/derived/pitcher_zone_from_canonical/{year}/npb_*.json`（既存/要整備）
- 野手:
  - `_data/derived/player_season_batting_count/{year}/npb_*.json` 等（既存）
  - 巡目別・状況別（既存）
- 捕手（既に追加済みの流れを整理）:
  - `player_catcher_appearances`（npm `phase22:...`）
  - `player_catcher_pitcher_splits`（npm `phase23:...`／入力の `splits.byCatcher` は npm `phase6:...` が付与）
  - `player_catcher_defense_basic`（npm `phase24:...`）
  - `player_catcher_starting_summary`（npm `phase25:...`）
  - `player_catcher_pa_round_pitch_types`（npm `phase26:...`）

### 重要: “未連携”列の扱い
- 個人ページ側に `—` を残して良いもの/ダメなものを定義し、ダメなものはこのPhaseで必ず埋める。

---

## Phase 4: API整備（derived→API応答を統一） + ランキング指標定義の共通化

### 目的
- 個人ページ/ランキングページが、派生JSONを API 経由で安定して読む。
- ランキングページの「**既存指標リスト**（表示名・並び・sanitize規則）」を **canonical由来ランキングでもそのまま流用**できる状態にする。

### 入力
- `_data/derived/...`

### 出力
- `app/api/...` に「year指定」「hasData」「payload」形式で統一
- ランキング指標の“正”を 1箇所に寄せる（既存の Record/metric map を正として利用）

---

## Phase 5: Canonical の実体化（中身のある canonical を得る）

### 目的
- **空のスキーマだけの canonical**（`plateAppearances` / `pitchEvents` / 出場成績が実質空）から脱し、Phase 3 の派生が意味を持つ **集計可能な中身**を `_data/scraped_games/canonical/` に蓄積する。
- 本リポジトリではスポナビ Raw→Phase 2 パースが **stats/text 取得に失敗すると空の domain になりやすい**ため、その原因切り分け・再取得・パーサ修正・**別ソースのマージ**までを **Phase 5 の作業範囲**とする。

### 入力
- Phase 0 の gameId 一覧、Phase 1 の Raw、名簿・ポリシー（レート制限・再試行）

### 主経路（スポナビ・一括）
1. `npm run phase0:sportsnavi:schedule`
2. `npm run phase1:sportsnavi:games`
3. `npm run phase2:sportsnavi:canonical`

上記 3 つを連結した **専用コマンド**:  
`npm run phase5:sportsnavi-canonical-pipeline`

### 補助経路（任意）
- **Yahoo 等の一球ログ・テキスト復元**（例: `npm run phase10:yahoo:restore`）で `plateAppearances` / `pitchEvents` を補い、`merge_yahoo_phase10_canonical` 等で同一 `gameId` の canonical を更新する。スポナビ単体では埋まらないフィールド向け。

### 成功条件（運用上の目安）
- 対象年度について、少なくとも **一部の試合で** `domain.battingLines` / `pitchingLines` または `plateAppearances` に **実データ**が存在する（すべてが空配列のみ、で終わらない）。
- 欠損は `missingOrPartial` で追えること。

---

## Phase 6: 個人ページ表示（UI/UXを完成させる）

### 目的
- 「試合情報さえ取れれば個人ページが出る」を満たす。

### 内容
- 個人ページで必要なAPIを呼び、未生成時のメッセージ/誘導を整備
- タブ表示条件（捕手/投手/野手）を派生に連動
- **捕手成績タブ全員展開**: `docs/plan_catcher_tab_all_roster_players.md`（名簿捕手 83 名に「捕手成績」タブ常時表示・`PlayerPageCatcherSeasonBody`・`useCatcherSeasonDerived`）

---

## Phase 7: チーム試合数の取得 → 規定打席（規定投球回）到達の判定

**配置**: Phase6（個人ページUI）の後、Phase8（ランキングJSON）の前。  
**理由**: 一部の指標は **「規定打席」「規定投球回」到達が前提**であり、その閾値は **各選手の所属球団がこなした試合数**に依存する（NPBの公式定義に従う）。試合数が確定しないと「規定到達か否か」を機械的に決められない。

### 目的
- **所属リーグ・所属球団ごとの「消化試合数」**（またはそれに相当する分母）を、取得済み試合情報から再現可能にする。
- その試合数から **規定打席数・規定投球回の閾値**を算出し、**各選手の実績 PA / IP と突き合わせて規定到達フラグ**を付与する。
- 個人ページ・ランキングの **「規定のみ表示」「規定未到達は — または別ランキング」** などの表示ルールの入力に使う。

### 入力
- **試合集合**: Phase0 の `season_*.json`（gameId 一覧）および Phase2 済み canonical（**どの試合がどの対戦カードか**・**どの球団の試合として数えるか**）
- **名簿**: 各選手の **当該年度の所属球団・登録リーグ（CL/PL）**（`npb_roster_*.csv` 等）
- **ルール定義（文書化必須）**: NPB公式の **規定打席・規定投球回の計算式**（例: チーム試合数に応じた閾値表）。実装はこの定義を SSOT とする。

### 処理の段階（推奨）
1. **チーム別試合数の集計**  
   - 年度×リーグ×球団について、「その球団が関与した公式戦（ペナント）」の試合数を数える。  
   - 中止・ノーゲーム・振替は **ルールに従い**カウント対象から除外または繰越し（定義を README/本節に明記）。
2. **閾値の算出**  
   - 上記チーム試合数から、**その選手の所属チームに対応する規定打席（および必要なら規定投球回）の閾値**を決める。
3. **選手別の到達判定**  
   - Phase3 派生の **実績 PA（野手）/ 投球回（投手）** と比較し、`qualified_batting` / `qualified_pitching` 等のブールまたは段階（未到達・到達・規定不足で非表示）を付与。
4. **永続化（提案）**  
   - `_data/derived/team_schedule_context/{year}/...`（チーム別試合数・メタ）  
   - `_data/derived/player_qualification/{year}/npb_*.json`（選手別: 閾値・実績・到達フラグ）  
   ファイル名は実装時に既存 `_data/derived` の命名と整合させる。

### 出力（利用先）
- **Phase4 API**: 規定依存指標は `payload` に **規定到達フラグ**または **規定不足理由**を含められるようにする（任意・段階導入）。
- **Phase8 ランキング**: 「規定順位」用 JSON と「全選手（規定無視）」用 JSON を分ける、または指標ごとにフィルタする際の **共通入力**とする（Phase8-2 と連動）。

### 成功条件
- 同じ canonical 集合に対して **チーム試合数 → 規定閾値 → 到達判定**が **冪等に再計算**できる。
- 順位表・公式発表の試合数と **説明可能な差分**がある場合は `missingOrPartial` 相当のメタで追える。

---

## Phase 8: ランキング生成（canonical→rankings JSON）

### 目的
- `_data/master_csv*` に依存せず、**個人ページと同じ方式（canonical→derived→API→表示）**でランキングを生成できるようにする（2026から開始）。
- 「ランキングで出したい指標」は **既存ランキングページにある指標**を正とし、指標定義・並びを流用する。

### 入力
- `_data/scraped_games/canonical/*.json`
- （推奨）Phase3の個人派生（投手/野手/捕手）  
  ※最短は **個人派生を集約してランキングを作る**（ロジック二重化を避け、個人ページと数値を揃える）
- **（規定順位・規定打席系指標）Phase7** のチーム試合数・選手別規定到達メタ

### 出力（提案）
- `public/data/rankings/2026/{CL|PL}/*.json`（打撃）
- `public/data/rankings/pitching/2026/{CL|PL}/*.json`（投手: 現行パスに合わせる）
- **`public/data/standings/2026/{CL|PL}.json`**（**Phase 29** — トップ順位表タブ。`rankings:rebuild` / 日次一括の Phase28 直後に生成）
- 検算レポート（チーム別の試合数・打席数・投球回の整合）

### スコープ（段階）
- 8-1: **既存ランキング指標のうち、個人派生から直接流用できる指標**を全て出す（2026 CL/PL）
- 8-2: **規定到達（PA/IP）** と “規定/非規定” の両方のJSONを出す（既存の命名規則に合わせる）  
  - **前提**: 規定の閾値・到達可否は **Phase7** で算出した **所属チーム試合数ベース**の結果を用いる（ここで再度「試合数」を独自推定しない）。
- 8-3: 欠損のある指標は「未連携」として明示しつつ、Phase3へ戻して派生側を強化（= 個人/ランキング両方で改善）
- 8-4: 既存ランキング（CSV由来）との差分比較レポートを自動生成（任意・検証用途）

### 方針（最短で「共通指標を流用」）
- ランキング計算は canonical 直集計ではなく、まず **Phase3の個人派生を集約してランキング化**する
  - メリット: 個人ページの数値と一致しやすい / 実装が速い / ロジックが1箇所に寄る
  - canonical直集計は後続で最適化（必要になってから）

---

## Phase 9: 取りこぼし検知の強化（最終保証）

### 目的
- どこかの段階で取りこぼしても **すぐ気づける**。

### 例
- schedule index の gameId 数と canonical ファイル数の差分
- canonical の `missingOrPartial` の割合監視
- ランキングの「チーム別試合数」整合
- **Phase7** のチーム試合数集計が、スケジュール index / canonical 上の試合数と **一致しているか**（規定打席の分母ズレ検知）

---

## 推奨の一括実行（2026・日次/週次）

**打撃の正本**: `docs/data_operation_rules.md` §「一括取得方針（2026以降・本番）」— 出場成績末尾列のみで打席結果・通算を数える。

### 日次（毎日）

**実コマンド**: `npm run daily:npb-pipeline`（下記を内包。派生は `appearance_only` + `appearance_slots` 固定）。

1. Phase0: スケジュール更新（D-2..D+2）
2. Phase1: 該当gameIdのRaw取得（リトライ込み）
3. Phase2: canonical生成/更新（**出場成績 stats 必須**）
4. Phase2a-repair: 不完全 stats/text の再取得（`--only-incomplete`）
5. **Phase5（必要時）**: Raw/パーサ/別ソースマージで **canonical に実データが載る状態**を維持・修復する
6. Phase3: 派生再生成（Phase11/12 は **出場末尾列集計**＋**CS は Phase4 の score runnerEvents**）。打数整合・CS 検証は `data_operation_rules.md` §出場成績 HTML / §盗塁死
7. **Phase7**（必要時）: その日更新された試合を反映し **チーム試合数・規定到達**を再計算（ランキングや規定順位をその日出す場合は Phase8 の前に実行）
8. Phase8: ランキング JSON（Phase12/19/28）
9. **Phase29**: チーム順位表 JSON（`public/data/standings/` — トップ「順位表」タブ）
10. top-leaders / top-weekly-leaders（トップ表示スナップショット）
11. **本番 R2 反映**（日次締め）: `pipeline:sync:2026` または `display:refresh:2026`

### 週次（週1、9月以降は週2）
1. Phase0: 未来(D..D+30)の総なめ→差分抽出
2. Phase1/2/5/3: 追加分の反映（canonical が空のままなら Phase5 を優先）
3. **Phase7**: チーム試合数・規定到達メタの更新（試合追加・振替反映後に必須）
4. Phase8: ランキング再生成（2026）
5. Phase9: 整合チェックレポート出力

---

## “既存資産”の扱い（移行中の方針）

- 当面: `_data/master_csv__import_1950_2024` 由来ランキングを併走可
- 2026: canonicalランキングに移行（Phase8を完成させる）
- 過去: 必要なら過去も試合単位で取り込み直すか、CSV由来を継続するかを判断

