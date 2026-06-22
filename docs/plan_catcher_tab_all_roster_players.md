# 捕手個人ページ「捕手成績」タブ全員展開計画書

## 1. 目的

2026 年支配下名簿の **登録ポジションが「捕手」** の全選手について、個人ページ（`/players/{playerId}`）の **今季の成績** に **「捕手成績」サブタブ** を常に表示する。

ユーザーが名簿上の捕手を開いたとき、派生データの有無にかかわらず **タブ自体は必ず見える** 状態にし、データが揃っていれば数値を、未整備なら **「—」＋パイプライン案内** で一貫した体験を提供する。

### 1.1 用語

| 用語 | 意味 |
|------|------|
| **捕手タブ** | 野手今季 UI の 5 番目サブタブ「捕手成績」（`kikuchiSeasonDetailTab === "catcher"`） |
| **名簿捕手** | `_data/npb_roster_{year}.csv` の `position` 列が `捕手` の行 |
| **出場捕手** | canonical 派生 `player_catcher_appearances` で `gamesAsCatcher > 0` と判定された選手 |

### 1.2 スコープ外

- 投手個人ページ側の「捕手別の投球成績」（`pitcherSeasonPocUi` / Phase 6）— 別計画（`docs/pitcher_personal_page_season_headings_plan.md` Phase 6）
- 捕手タブ内の **未連携列の完全実装**（投球数・故意四・失点・被 BABIP 等）— 本計画では **表示枠の維持** のみ。数値埋めは別 Issue
- 通算タブへの捕手専用ブロック追加
- ランキングページへの捕手指標追加

---

## 2. 現状整理

### 2.1 UI（実装済み・条件付き表示）

対象ファイル: `app/players/[playerId]/PlayerPageClient.tsx`

| 項目 | 現状 |
|------|------|
| 親タブ | 「今季の成績」／「通算の成績」（`showSeasonCareerTabs`） |
| 野手今季サブタブ | 基本成績 / 球種情報 / 状況別 / 期間別 / **（任意）捕手成績** |
| 捕手タブの表示条件 | `catcherAppearances.gamesAsCatcher > 0` のときのみ 5 タブ化 |
| 名簿捕手の今季 UI | `isFielderRegistrationPosition` により **野手シェル**（`showFielderSeasonPilotUi`）は出る |
| ツールチップ | 「派生データに捕手出場がある場合のみ」（旧計画 Phase 3 参照） |

**ギャップ**: 名簿上は捕手でも、シーズン中に canonical に捕手出場が無い／派生未生成の選手は **タブ自体が出ない**（2026 名簿捕手 83 名に対し、派生 appearances JSON は約 66 件＝出場実績ベース）。

### 2.2 捕手タブの表示ブロック（実装済み）

| 見出し | データ源 API | 派生ディレクトリ |
|--------|--------------|------------------|
| 基本成績（複数表） | `catcher-pitchers`, `catcher-defense-basic`, `catcher-starting-summary` | phase23 / 24 / 25 |
| 巡目別の球種一覧（スタメン時） | `catcher-pa-round-pitch-types` | phase26 |
| 試合 ID 一覧 | `catcher-appearances` | phase22 |
| 投手別成績（最大 15 人） | `catcher-pitchers` | phase23（phase6 `splits.byCatcher` 入力） |

### 2.3 データパイプライン（実装済み）

`npm run phase3:derived:2026` に含まれる捕手系:

| npm script | 出力 |
|------------|------|
| `phase22:build:catcher-appearances` | `_data/derived/player_catcher_appearances/{year}/npb_*.json` |
| `phase23:build:catcher-pitcher-splits` | `_data/derived/player_catcher_pitcher_splits/{year}/npb_*.json` |
| `phase24:build:catcher-defense-basic` | `_data/derived/player_catcher_defense_basic/{year}/npb_*.json` |
| `phase25:build:catcher-starting-summary` | `_data/derived/player_catcher_starting_summary/{year}/npb_*.json` |
| `phase26:build:catcher-pa-round-pitch-types` | `_data/derived/player_catcher_pa_round_pitch_types/{year}/npb_*.json` |

前提: `phase6:build:pitcher-catcher-splits`（投手 PoC の `splits.byCatcher`）および canonical の捕手 ID 紐づけ。

### 2.4 名簿

- SSOT: `_data/npb_roster_2026.csv`
- 捕手行数: **83**（`position === "捕手"`）
- 捕手は `lib/rosterPitcher.ts` 上 **野手扱い**（`isFielderRegistrationPosition` が true）

---

## 3. 目標仕様（表示ルール）

### 3.1 タブ表示条件（変更後）

```text
showCatcherSeasonTab =
  showFielderSeasonPilotUi
  AND statsTab === "season"
  AND (
    isCatcherRegistrationPosition(rosterMatchedPosition)   // 名簿捕手は常に
    OR (catcherAppearances?.gamesAsCatcher ?? 0) > 0      // 内野手等の途中捕手も従来どおり
  )
```

| 選手種別 | 変更前 | 変更後 |
|----------|--------|--------|
| 名簿捕手（出場あり） | タブ表示 | タブ表示 |
| 名簿捕手（出場なし・派生なし） | **タブ非表示** | **タブ表示**（中身は — ＋案内） |
| 野手だが途中で捕手出場 | 出場ありなら表示 | 従来どおり表示 |
| 投手ページ | 対象外 | 対象外 |

### 3.2 データなし時の UI

- 表レイアウト・見出しは **現行のまま維持**（空表は 15 行プレースホルダー等、既存挙動）
- タブ直下または基本成績見出し付近に `DerivedPipelineEmptyNotice` 相当の短文:
  - 「今季の試合データに捕手出場がまだ含まれていません」
  - または「派生データ未生成。パイプライン実行後に数値が入ります」
- `gamesAsCatcher === 0` でも名簿捕手なら **タブを隠さない**

### 3.3 API 応答の扱い（変更なしで可）

既存 API は `hasData: false` で 200 を返す設計のまま。UI 側が名簿捕手ならタブを出し、fetch 結果が空でも落ちないこと。

---

## 4. 実装フェーズ

### Phase 0 — 仕様固定・ヘルパー追加

**成果物**

- 本計画書の承認
- `lib/rosterPitcher.ts` に `isCatcherRegistrationPosition(position: string): boolean` を追加  
  - 正規化: NFC、`捕手` を含む（`捕` のみは誤判定のため **「捕手」完全一致または includes("捕手")** で固定）
- `showCatcherSeasonTab` 判定を 1 関数に集約（例: `lib/playerCatcherSeasonTab.ts`）し、UI と将来の API テストから共用

**完了条件**

- 名簿 CSV の 83 捕手 ID 一覧をスクリプトで抽出できる（検証用）

---

### Phase 1 — UI: タブ表示条件の切り替え

**変更ファイル（想定）**

| ファイル | 内容 |
|----------|------|
| `app/players/[playerId]/PlayerPageClient.tsx` | サブタブ 5 分割条件を `showCatcherSeasonTab` に変更。スライダー幅 20% も同条件 |
| `app/players/[playerId]/PlayerPagePitcherSeasonBody.tsx` | 捕手関連 props があれば同様（投手ページは非対象のまま） |

**具体的変更点**

1. `catcherAppearances && catcherAppearances.gamesAsCatcher > 0` の 3 箇所（タブ配列・スライダー・幅）を `showCatcherSeasonTab` に置換
2. `useEffect`（appearances fetch）で `hasData` が false でも、名簿捕手なら `setCatcherAppearances({ gamesAsCatcher: 0, gameIds: [] })` の **ゼロ出場プレースホルダ** をセットし、タブ選択中のリダイレクト（`catcher` → `period`）は **名簿非捕手のときのみ** 実行
3. ツールチップ文言を「名簿登録捕手は常に表示。数値は試合派生データに依存」に更新
4. 捕手タブ内に空データ用の `DerivedPipelineEmptyNotice` を条件表示

**完了条件**

- 名簿捕手 83 名すべての個人ページ URL で「捕手成績」タブが DOM に存在する（手動または E2E サンプル 5 球団×1 名）

---

### Phase 2 — 名簿捕手の個人ページ到達性（ルーティング・ID）

**目的**: タブ以前に **ページ自体・今季ブロック** が開けること

| 確認項目 | 対応 |
|----------|------|
| `showSeasonCareerTabs` | 名簿選手は既に true。維持 |
| `showFielderSeasonPilotUi` | 捕手は野手扱い。維持 |
| `seasonPilotPlayerId` | NPB ID / 公開 ID の解決が全捕手で機能するか spot check |
| プロフィール merged API | 捕手でも通算打撃が無くてもページが壊れないこと |

**成果物**

- 名簿捕手 ID リストと公開 URL の対応表（`scripts/list_roster_catcher_player_urls.ts` 等、検証用ワンショットで可）

**完了条件**

- 83 名それぞれで HTTP 200・今季サブタブ 4＋捕手の 5 タブが表示（データ内容は問わない）

---

### Phase 3 — 派生データの網羅（バックエンド）

**目的**: タブを出したうえで、**出場した捕手** には可能な限り数値を埋める

| タスク | 内容 |
|--------|------|
| canonical 拡大 | `docs/plan_expand_20260327_to_20260417_full_games.md` 等に沿い試合数を増やす |
| phase22〜26 再実行 | `npm run phase3:derived:2026` または捕手系のみ個別実行 |
| ID 橋渡し | `resolveNpbPlayerIdFromPublicId` / 名簿 `npb_player_id` の欠損を洗い出し |
| phase6 依存 | 投手 PoC に `splits.byCatcher` が無い試合は phase23 が空— phase6 先行をパイプライン順で保証 |

**検証スクリプト（新規推奨）**

```bash
# 例: 名簿捕手のうち phase22 JSON が無い／gamesAsCatcher=0 の一覧
tsx scripts/validate_roster_catchers_derived_coverage.ts --year 2026
```

**完了条件（運用目安）**

- 名簿捕手のうち **実際に今季捕手出場がある選手** について、phase22 JSON が存在し `gamesAsCatcher >= 1`
- 出場無し捕手は JSON 無しでも可（UI は Phase 1 でカバー）

---

### Phase 4 — リファクタ・保守性

**推奨**

| 項目 | 理由 |
|------|------|
| 捕手タブ本体を `PlayerPageCatcherSeasonBody.tsx` に切り出し | `PlayerPageClient.tsx` が 2400 行超。投手は `PlayerPagePitcherSeasonBody` と対称に |
| 捕手 API fetch を `useCatcherSeasonDerived.ts` に集約 | 5 本の `useEffect` を 1 フックに |
| 型 | `CatcherSeasonDerivedState` を `lib/` に定義 |

**完了条件**

- 挙動差分なしのリファクタ（スナップショット or 手動回帰）

---

### Phase 5 — テスト・ドキュメント

| 種別 | 内容 |
|------|------|
| 単体 | `isCatcherRegistrationPosition` の表記ゆれ（全角スペース等） |
| 結合 | 名簿捕手モックでタブ 5 つ・非捕手野手で 4 つ |
| 手動 | 坂倉将吾・小林誠司・戸柱恭孝など派生あり／なし各 1 名 |
| ドキュメント | `docs/plan_full_pipeline_from_games_to_pages_and_rankings.md` Phase 6 に本計画へのリンクを追記 |

---

## 5. 対象選手一覧の取得方法

```bash
# 名簿捕手の NPB ID 一覧（83 名）
rg ',捕手,' _data/npb_roster_2026.csv
```

個人ページ URL 例: `/players/{npb_player_id}` または名簿・マスタで定義された公開 slug（`findRosterPlayerByPublicId` と同じ解決経路を使用）。

---

## 6. 依存関係・実施順序

```text
Phase 0（仕様）
    ↓
Phase 1（UI タブ常時表示）  ← ユーザー価値はここで出る
    ↓
Phase 2（全 URL 到達確認）
    ↓
Phase 3（派生網羅・数値充填）  ← canonical / 試合数に依存
    ↓
Phase 4（リファクタ）任意
    ↓
Phase 5（テスト）
```

**最短 MVP**: Phase 0 + Phase 1 のみで「全捕手にタブ」は達成可能。数値の充実は Phase 3。

---

## 7. リスクと対策

| リスク | 対策 |
|--------|------|
| 名簿は捕手だがシーズン未出場 | タブは出す。0 試合・全 — で明示 |
| 内野手の緊急捕手 | 名簿非捕手でも `gamesAsCatcher > 0` なら従来どおりタブ表示（OR 条件） |
| phase23 が空（phase6 未実行） | 投手別表はプレースホルダー。パイプライン README に順序明記 |
| `PlayerPageClient` 肥大 | Phase 4 でコンポーネント分割 |
| npm phase25 番号衝突 | 捕手 `phase25:build:catcher-starting-summary` と投手球種 `phase25:build:pitcher-season-pitch-types` は **別ライン**（`docs/plan_vs_hand_backfill_with_batting_lines_phases.md` と同趣旨の注意） |

---

## 8. 受け入れ基準（Definition of Done）

1. **2026 名簿の登録捕手 83 名全員**の個人ページで、今季タブに **「捕手成績」** が表示される
2. 派生データがある捕手は、現行と同等以上の数値が入る（リグレッションなし）
3. 派生データが無い捕手でもタブ選択時にクラッシュせず、— と案内文が出る
4. 投手個人ページ・菊池パイロット等、既存の野手／投手切り分けに副作用がない
5. 本計画書と `isCatcherRegistrationPosition` がリポジトリに残る

---

## 9. 関連ドキュメント・コード

| 内容 | 場所 |
|------|------|
| 野手今季 UI・捕手タブ実装 | `app/players/[playerId]/PlayerPageClient.tsx` |
| 名簿ポジション判定 | `lib/rosterPitcher.ts` |
| 捕手出場抽出 | `lib/catcherAppearances.ts` |
| パイプライン全体 | `docs/plan_full_pipeline_from_games_to_pages_and_rankings.md` |
| 投手側捕手別 | `docs/pitcher_personal_page_season_headings_plan.md` Phase 6 |
| 個人ページ表示項目 | `docs/個人ページ表示項目整理.md` ブロック F-1（守備位置別） |

---

## 10. 進捗メモ（実装時に更新）

| Phase | 状態 | 備考 |
|-------|------|------|
| 0 仕様・ヘルパー | **完了** | `isCatcherRegistrationPosition`, `resolveShowCatcherSeasonTab` |
| 1 UI タブ条件 | **完了** | 名簿捕手は常時タブ・空データ案内 |
| 2 URL 到達性 | **完了** | 83/83 静的検証 OK、`docs/roster_catcher_player_urls.md` |
| 3 派生網羅 | **完了** | phase22/23/26 再生成（38 捕手出場）。phase24/25 は canonical 側データ待ち |
| 4 リファクタ | **完了** | `PlayerPageCatcherSeasonBody`・`useCatcherSeasonDerived`・`catcherSeasonDerivedTypes` |
| 5 テスト | **完了** | `validate_roster_catcher_tab_unit.ts`・到達性/派生検証 npm script |

---

以上が、名簿捕手全員への「捕手成績」タブ展開計画である。
