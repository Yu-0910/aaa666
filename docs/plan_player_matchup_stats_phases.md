# 個人ページ「対戦成績」タブ実装計画書

## 1. 目的

2026 年シーズンについて、投手・野手の個人ページ（`/players/{playerId}`）の **「今季の成績」内に 5 つ目のサブタブ「対戦成績」** を追加し、**対戦した個別選手ごとの成績**を **球団単位の見出し**で区切って表示する。

| ページ種別 | タブの意味 | 行のキー（1 行 = 1 人） |
|------------|------------|-------------------------|
| **野手** | その打者が今季 face した **投手** との成績 | 相手投手名（所属球団見出しの下） |
| **投手** | その投手が今季 face した **打者** との成績 | 相手打者名（所属球団見出しの下） |

### 1.1 表示指標（列順）

ユーザー指定どおり、表ヘッダーは左から次の 7 列とする（1 列目は選手名）。

| 列 | 野手ページ（対投手） | 投手ページ（対打者） |
|----|----------------------|----------------------|
| 選手名 | 投手名 | 打者名 |
| OPS | OPS | OPS（被打 OPS） |
| 打率 | 打率 | 打率（被打率） |
| 打数 | 打数 | 打数（被打） |
| 安打 | 安打 | 安打（被安） |
| 本塁打 | 本塁打 | 本塁打（被本塁打） |
| 三振 | 三振 | 三振（奪三振／被打三振） |
| 四球 | 四球 | 四球（与四球／被打四球） |

OPS・打率は既存の `battingSlashRatesFromCounts` / `formatSlashStatDisplay` と同じ定義（出塁率・長打率から OPS = OBP + SLG）。打数 0 の行は率指標は「—」。

### 1.2 用語

| 用語 | 意味 |
|------|------|
| **対戦成績タブ** | 「今季の成績」（`statsTab === "season"`）配下の **5 つ目サブタブ**（`seasonDetailTab === "matchup"`）。親タブ「今季／通算」は変更しない |
| **今季サブタブ** | 野手: `kikuchiSeasonDetailTab`、投手: `pitcherSeasonSubTab` |
| **球団見出し** | 12 球団の表示順に沿った `h2` ブロック（例: 「巨人」「阪神」…） |
| **対戦行** | 当該選手と 1 対 1 で face した相手 1 人分の集計 |
| **Phase 30** | 打席ログから **選手×相手選手** を集計する派生ビルド（本計画の中核） |

### 1.3 スコープ外

- 2026 年以外のシーズン（初版は `year=2026` 固定。年セレクタ連動は後続）
- 通算タブ内への対戦成績ブロック
- ランキングページ・TOP 週間タブへの露出
- 対戦成績タブ内の球種別・コース別・全打席ログ（ブロック K／L は別計画）
- **チーム別**の対戦成績（`split_type === "vs_team"`）— 既に「今季 › 基本成績」サブタブ内 `SeasonStatsPilot` で実装済み。本サブタブは **個人対個人** に特化
- 親タブ「今季の成績」／「通算成績」の 2 分割 UI の変更

---

## 2. 現状整理

### 2.1 UI（関連実装済み・本機能は未実装）

| 項目 | 現状 |
|------|------|
| 親タブ | 「今季の成績」／「通算成績」の 2 択（`statsTab: "season" \| "career"`）— **変更なし** |
| 野手・今季サブタブ | 基本成績 / 球種情報 / 状況別 / 期間別（4 つ）。名簿捕手等は **捕手成績** が 5 つ目 |
| 投手・今季サブタブ | 基本成績 / 球種情報 / 状況別 / 期間別（4 つ） |
| チーム別対戦 | `SeasonStatsPilot`「チーム別の対戦成績」— **12 球団行**・Phase 13 由来（基本成績タブ内） |
| 投手別（捕手） | `PlayerPageCatcherSeasonBody`「投手別成績」— 最大 15 人・Phase 23（捕手成績タブ内） |
| 個人対個人の全 roster | **派生 JSON・API・UI とも未実装** |

### 2.2 参考 UI（見出し・表デザイン）

**`app/components/SeasonStatsPilot.tsx` の「チーム別の対戦成績」ブロック**をトレースする。

| 要素 | 仕様 |
|------|------|
| 見出し `h2` | `borderLeft: 6px solid ${headingStripeColor}`、`fontWeight: 900`、左パディング（`FIELDER_PILOT_SECTION_STRIPE_PX` 相当） |
| 表ヘッダー | 背景 `#FFFF44`、文字 `#000000`、`text-[10px]` |
| データ行 | 背景 `rgba(255,255,255,0.03)`、左列 sticky、チーム色バー（`TEAM_COLORS`）は **見出し側**に使用 |
| 1 列目 | 選手名（リンク `/players/{opponentId}`） |
| 数値列 | `latin font-black tabular-nums text-[14px]`、欠損は「—」 |

球団見出しの表示名・並び順は `lib/standings/teamCodes.ts` の `TEAM_CODE_TO_DISPLAY` および `SeasonStatsPilot` の `TEAM_ORDER`（セ・パ 12 球団）と **同一**にする。

### 2.3 データ（集計可能な入力）

| 入力 | 役割 |
|------|------|
| `_data/scraped_games/canonical/*.json` | 打席 `plateAppearances`、投手 ID、打者 ID |
| `lib/yahooGame/resolvePitcherIdByPaId.ts` | 打席ごとの相手投手 ID 解決（対左右と同系統） |
| `lib/yahooGame/canonicalBattingSeasonAgg.ts` | 打席結果 → 打数・安打・本塁打・三振等（Phase 11 と同一ロジックを **相手 ID キーでバケット**） |
| `_data/npb_roster_2026.csv` | 相手選手の所属球団・表示名 |
| `lib/yahooGame/injectTeamsFromTextPbpIfMissing` | 試合の scoreboard 補完（Phase 13 と同様の前提） |

**集計単位**: 打席（PA）ごとに `(subjectId, opponentId)` へ 1 回だけ加算。Phase 13 の「試合×打者で対戦球団に 1 回」ルールとは別軸だが、**二重加算しない**（1 PA = 1 加算）ことは `docs/data_operation_rules.md` の精神に合わせる。

### 2.4 類似実装（パターン借用）

| 既存 | 借用点 |
|------|--------|
| Phase 15 `vs_hand` | 打席単位で相手投手 ID をキーに分割 |
| Phase 23 捕手×投手 | 投手 PoC から逆引きして捕手別 JSON を生成する **1 ファイル 1 選手** 出力形 |
| Phase 13 `vs_team` | 名簿・scoreboard から所属球団を引く |

---

## 3. 目標仕様

### 3.1 タブ配置（今季の成績 › 5 つ目サブタブ）

親タブは現状のまま。**`statsTab === "season"` のとき**表示する今季サブタブ列に **5 つ目として「対戦成績」** を追加する。

#### 野手（`kikuchiSeasonDetailTab`）

```text
通常（4+1）:
  1. 基本成績   (basic)
  2. 球種情報   (pitch)
  3. 状況別     (situation)
  4. 期間別     (period)
  5. 対戦成績   (matchup)   ← 本計画で追加

名簿捕手等（捕手タブあり）:
  1〜5. 上記と同じ（対戦成績は 5 つ目のまま）
  6. 捕手成績   (catcher)   ← 従来 5 つ目だったため 6 つ目へ後退
```

#### 投手（`pitcherSeasonSubTab`）

```text
  1. 基本成績   (basic)
  2. 球種情報   (pitch)
  3. 状況別     (situation)
  4. 期間別     (period)
  5. 対戦成績   (matchup)   ← 本計画で追加
```

#### 表示条件

```text
showMatchupSeasonSubTab =
  statsTab === "season"
  AND (showFielderSeasonPilotUi OR showPitcherSeasonSuganoUi)
```

- サブタブバー: 野手は `width: 20%`（5 分割）を基本とし、捕手タブあり時は `16.67%`（6 分割）。投手は `width: 20%`（5 分割）。黄色スライダーの `translateX` はタブ配列の index に追従（既存の捕手 5 タブ化と同パターン）
- `seasonDetailTab === "matchup"` のとき `SeasonStatsPilot` / `PlayerPagePitcherSeasonBody` の他サブタブ内容は非表示し、`PlayerPageMatchupBody` のみ表示
- **基本成績タブ内のチーム別対戦成績は残す**（球団単位 vs 個人単位で役割が異なる）
- 対象年: **2026**（ページの `selectedYear` が 2026 のときのみ実データ。他年は「2026 シーズンのみ対応」案内）

#### 型の拡張

```ts
// 野手
type FielderSeasonDetailTab =
  | "basic" | "pitch" | "situation" | "period" | "matchup" | "catcher"

// 投手
type PitcherSeasonSubTab =
  | "basic" | "pitch" | "situation" | "period" | "matchup"

// SeasonStatsPilot（変更なし — matchup は Pilot 外）
type PilotSeasonDetailTab = "basic" | "pitch" | "situation" | "period"
```

### 3.2 球団ごとのレイアウト

1. **対戦人数（相手選手数）が多い球団から** `h2` 見出し＋表を描画（同数は `TEAM_ORDER` 順）
2. **当該球団所属の相手選手で、打数 ≥ 1 の行が 1 件以上ある球団のみ** 表示
3. 見出し文言: 球団短縮名（例: `巨人`、`日本ハム`）— チーム別対戦成績テーブルの 1 列目と同表記
4. 球団内の行順: **OPS 降順** → 同 OPS は選手名（五十音）昇順
5. 行タップ: 相手選手の個人ページへ遷移（`npb_player_id` 優先、解決不能時はテキストのみ）

### 3.3 データなし時

| 状態 | 表示 |
|------|------|
| 派生 JSON なし | 全球団非表示。タブ直下に `DerivedPipelineEmptyNotice` 相当の短文 |
| JSON あり・全行打数 0 | 「今季の対戦データはまだありません」 |
| 一部球団のみ | 該当球団の見出し＋表のみ（空球団は見出しごと省略） |

### 3.4 投手／野手の対称性

- **1 本の Phase 30 スクリプト**が canonical を 1 パス走査し、打席ごとに  
  - 打者 A × 投手 B → `player_matchup_batting/{year}/npb_{A}.json` の B 行へ加算  
  - 投手 B × 打者 A → `player_matchup_pitching/{year}/npb_{B}.json` の A 行へ加算  
- 指標定義は打者視点の打撃カウントを共有（投手側は被打として同じ `ab/h/hr/so`）

---

## 4. データ設計

### 4.1 出力パス

```text
_data/derived/player_matchup_batting/{year}/npb_{npbBatterId}.json   # 野手ページ用
_data/derived/player_matchup_pitching/{year}/npb_{npbPitcherId}.json  # 投手ページ用
```

### 4.2 JSON スキーマ（案）

```ts
type PlayerMatchupDerived = {
  schemaVersion: "phase30-player-matchup-v1"
  seasonYear: string
  npbPlayerId: string
  role: "batter" | "pitcher"
  generatedAt: string
  source: { canonicalGames: number; plateAppearancesProcessed: number }
  teams: Array<{
    teamCode: string           // TEAM_SHORT_TO_CODE 準拠
    teamDisplay: string        // TEAM_CODE_TO_DISPLAY
    opponents: Array<{
      opponentNpbId: string
      opponentPublicId: string // 個人ページ URL 用（Yahoo / NPB）
      opponentName: string
      ab: number
      h: number
      hr: number
      so: number
      bb: number             // OPS 用（表示列には出さない）
      hbp: number
      tb: number             // 長打数（OPS 用）
      avg: string | null     // 表示用 preformatted または null
      ops: string | null
    }>
  }>
}
```

### 4.3 相手 ID・所属球団の解決

1. 打席の打者 ID: `pa.yahooBatterId`（既存 ID 解決）
2. 打席の投手 ID: `yahooPitcherIdForVsHandFromPa` → 不足時 `resolvePitcherIdForPlateAppearance`
3. 相手の所属球団: `_data/npb_roster_2026.csv` の `team` 列（`findRosterPlayerByPublicId`）
4. ID 解決不能の PA は **スキップ**（対左右 `unknown` と同様、件数を `source.skippedPa` に記録）

### 4.4 検算（Phase 31）

| 検証 | 内容 |
|------|------|
| `validate:phase31-matchup-vs-phase11:fail` | 各野手について、全相手の `ab` 合計 ≤ Phase 11 通算 `ab`（代打・PH のみ等で `<` あり得る） |
| 双方向一致 | 打者 A の対投手 B の `ab` = 投手 B の対打者 A の `ab`（同一 PA 集合） |
| サンプル試合 | 既知 1 試合（広島×中日等）で手計算と突合 |

---

## 5. 実装フェーズ

### Phase 0 — 仕様固定・共有型 ✅ 完了（2026-06-10）

**成果物**

- 本計画書の承認
- `lib/playerMatchupTypes.ts` — スキーマ型・定数 `PLAYER_MATCHUP_SCHEMA_VERSION`
- `lib/playerMatchupTeamOrder.ts` — 12 球団見出し順（`teamCodes` と整合）
- `lib/playerMatchupSeasonTab.ts` — 今季 5 つ目サブタブ型・列定義・`resolveShowMatchupSeasonSubTab`・タブ列ビルダー
- `scripts/validate_player_matchup_phase0_unit.ts` — Phase 0 単体検証
- `npm run validate:player-matchup-phase0:fail`

**完了条件**

- [x] 列定義・球団見出しルール・今季 5 つ目サブタブ仕様が PR 説明可能な状態

---

### Phase 1 — 派生ビルド（Phase 30）✅ 完了（2026-06-10）

**スクリプト**: `scripts/phase30_build_player_matchup_from_canonical.ts`  
**npm**: `phase30:build:player-matchup`（`--year 2026` 既定）

**やること**

- `loadCanonicalGamesMergedForDerivedPipeline()` で全試合読込
- 各 PA について打者・投手 ID を解決し、`aggregateBattingCountsForPa`（Phase 11 相当）で `(batter, pitcher)` 双方のマップへ加算
- 名簿から相手の `teamCode` を付与し、球団ごとに `opponents[]` を組み立てて JSON 出力
- 出力対象: 今季 canonical に **1 打席以上** 登場した全 NPB ID（名簿外 ID は `opponentName` を canonical 表記でフォールバック）

**完了条件**

- `_data/derived/player_matchup_batting/2026/` および `player_matchup_pitching/2026/` にファイルが生成される
- 既知選手（例: 菊池・菅野）で対戦相手行が手計算と一致

**一括パイプライン**: `phase3:derived:2026` および `run_daily_npb_pipeline.mjs` の派生ブロックに `npm run phase30:build:player-matchup` を組み込み済み（Phase 20 の後・`build:yahoo-npb-full-index` の前。Phase 11・15 の後で投手 ID 解決済みであることが前提）

---

### Phase 2 — API ✅ 完了（2026-06-10）

**ルート**

- `GET /api/players/[playerId]/matchup-batting?year=2026` — 野手
- `GET /api/players/[playerId]/matchup-pitching?year=2026` — 投手

**実装**

- `lib/playerMatchupLoad.ts` — 派生 JSON 読込（R2 → ローカル fs）
- `lib/playerMatchupApi.ts` — 公開 ID 解決（名簿 → `resolveNpbPlayerIdFromPublicId` → 数値 ID 直読、`season-pitching` 同型）
- `app/api/players/[playerId]/matchup-batting/route.ts`
- `app/api/players/[playerId]/matchup-pitching/route.ts`
- 応答: `{ hasData, year, payload: PlayerMatchupDerived | null }`
- ファイル無しは **200 + hasData: false**
- 検証: `npm run validate:player-matchup-api:fail`

**完了条件**

- [x] curl / ブラウザで対象 `playerId` に JSON が返る
- [x] 名簿未ヒットの数値 NPB ID でも派生があれば返る

---

### Phase 3 — UI（今季 › 対戦成績サブタブ）✅ 完了（2026-06-10）

**対象ファイル**

- `app/players/[playerId]/PlayerPageClient.tsx` — 5/6 分割サブタブ・表示分岐
- `app/players/[playerId]/PlayerPageMatchupBody.tsx` — 球団見出し＋表（野手・投手共用）
- `hooks/usePlayerMatchupDerived.ts` — タブ選択時に API 取得

**UI 詳細**

- サブタブラベル: **対戦成績**（5 つ目）。`buildFielderSeasonSubTabs` / `buildPitcherSeasonSubTabs` で列定義
- 野手: `matchup` タブで `PlayerPageMatchupBody`（Pilot 外）
- 投手: `matchup` タブで `PlayerPageMatchupBody`（Client 側分岐）
- 列順: **選手名 | OPS | 打率 | 打数 | 安打 | 本塁打 | 三振 | 四球**

**完了条件**

- [x] 今季 › 5 つ目「対戦成績」タブが野手・投手ページに表示される
- [x] 捕手タブあり野手で `… 期間別 → 対戦成績 → 捕手成績`
- [x] 球団見出し＋表・相手名リンク

---

### Phase 4 — 検証・ドキュメント ✅ 完了（2026-06-10）

**成果物**

- `scripts/validate_phase31_matchup_vs_phase11.ts` + `npm run validate:phase31-matchup-vs-phase11:fail`
- `docs/data_operation_rules.md` に Phase 30 派生パス追記
- `docs/DATA_PATHS.md` に派生パス・検証コマンド追記
- `run_daily_npb_pipeline.mjs` — Phase 30 直後に Phase 31 検証

**完了条件**

- [x] `npm run validate:phase31-matchup-vs-phase11:fail` が緑
- [x] `npm run phase3:derived:2026` 再実行後、個人ページ対戦成績が更新される（Phase 30 組込み済み）

---

### Phase 5 — 全名簿展開・運用 ✅ 完了（2026-06-10）

**やること**

- 2026 支配下名簿の全野手・全投手で今季サブタブ「対戦成績」を表示（`buildFielderSeasonSubTabs` / `buildPitcherSeasonSubTabs` に常時含有）
- 日次パイプライン: Phase 30 全件再生成 + Phase 31 検証（組込み済み）
- R2: `display_r2_upload_derived.mjs` に `player_matchup_batting` / `player_matchup_pitching` を追加
- 静的到達性: `scripts/validate_roster_matchup_tab_reachability.ts` → `docs/roster_matchup_tab_coverage.md`

**完了条件**

- [x] 名簿選手を開き「今季の成績」内で 5 つ目「対戦成績」が常に見える（中身はデータ依存）
- [x] `npm run validate:roster-matchup-tab:fail` が緑

---

## 6. ファイル変更一覧（予定）

| 種別 | パス |
|------|------|
| 新規 | `scripts/phase30_build_player_matchup_from_canonical.ts` |
| 新規 | `scripts/validate_phase31_matchup_vs_phase11.ts` |
| 新規 | `lib/playerMatchupTypes.ts`, `lib/playerMatchupLoad.ts`, `lib/playerMatchupTeamOrder.ts` |
| 新規 | `app/api/players/[playerId]/matchup-batting/route.ts` |
| 新規 | `app/api/players/[playerId]/matchup-pitching/route.ts` |
| 新規 | `app/players/[playerId]/PlayerPageMatchupBody.tsx` |
| 新規 | `hooks/usePlayerMatchupDerived.ts` |
| 変更 | `app/players/[playerId]/PlayerPageClient.tsx`, `PlayerPagePitcherSeasonBody.tsx` |
| 変更 | `package.json`（`phase30:build:player-matchup`, validate, `phase3:derived:2026`） |
| 変更 | `docs/data_operation_rules.md`, `docs/DATA_PATHS.md` |

---

## 7. リスクと対策

| リスク | 対策 |
|--------|------|
| 投手 ID 欠損 PA が多い | Phase 10 マージ・`resolvePitcherIdByPaId` を Phase 15 と同順で適用。欠損率を `source.skippedPa` で UI に脚注可能 |
| JSON サイズ（全対戦相手） | 初版は全員出力。1 ファイルが大きい選手のみ gzip API や「打数 1 以上のみ」フィルタ（既に採用） |
| 二重カウント | PA 単位 1 加算。validate で Phase 11 上限チェック |
| 所属球団の途中移籍 | 2026 名簿の **現在所属** でグルーピング（移籍前の対戦も現所属見出しに含む—初版許容。厳密化は別 Issue） |
| phase 番号衝突 | 本計画は **phase30（ビルド）/ phase31（検証）** を新規採番。捕手 phase25・投手 phase25 衝突と同様、npm ラベルで区別 |

---

## 8. 完了の定義（DoD）

- [x] `npm run phase30:build:player-matchup` が 2026 canonical から batting / pitching 両派生を生成する
- [x] `npm run validate:phase31-matchup-vs-phase11:fail` が成功する
- [x] 野手・投手個人ページの **今季の成績 › 5 つ目サブタブ「対戦成績」** で、球団見出し＋表に **OPS・打率・打数・安打・本塁打・三振・四球** が表示される
- [x] 見出し・表 UI が `SeasonStatsPilot`「チーム別の対戦成績」と視覚的に一致する
- [x] `npm run phase3:derived:2026` に Phase 30 が含まれる

---

## 9. 実装順序（推奨）

```text
Phase 0 → Phase 1（30 ビルド）→ Phase 4 検証スクリプト（31）→ Phase 2 API → Phase 3 UI → Phase 5 運用
```

見積もり: Phase 1+2+3 のコアは **2〜3 セッション**（既存 canonical 集計の流用により Phase 13 新規より短い想定）。
