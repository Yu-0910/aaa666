# チームページ — Phase 計画書

> **状態**: Phase 5 完了（**2026-06-11**）· v1 完了  
> **Phase 0 確定書**: [`plan_team_page_phase0_spec.md`](plan_team_page_phase0_spec.md)  
> **関連**: 順位表 [`plan_team_standings_phases.md`](plan_team_standings_phases.md) · ランキング統一 [`plan_unified_ranking_personal_stats_phases.md`](plan_unified_ranking_personal_stats_phases.md) · 捕手個人タブ [`plan_catcher_tab_all_roster_players.md`](plan_catcher_tab_all_roster_players.md) · 表示データ R2 [`plan_display_data_r2_unified_phases.md`](plan_display_data_r2_unified_phases.md)

## 1. 目的

**12 球団それぞれに専用のチームページ**を設け、所属選手に絞った成績ビューを提供する。

| サブページ | 内容 | 既存との関係 |
|-----------|------|-------------|
| **打撃ランキング** | 当該球団の野手のみ | `/ranking/{year}/{league}` と**同一 UI・同一指標・同一ソート規則**。差分は「所属選手フィルタ」と順位の再採番のみ |
| **投手ランキング** | 当該球団の投手のみ | `/ranking/pitching/{year}/{league}` と同上 |
| **捕手成績** | 当該球団の捕手一覧 | リーグ全体の捕手ランキングは**新設しない**。個人ページ「捕手成績」タブの指標を**チーム内一覧**として再構成 |

ユーザーが球団名から「うちの選手だけのランキング」「うちの捕手の成績一覧」にたどり着ける導線を作る。

### 1.1 非スコープ（v1）

| やらない | 理由 |
|---------|------|
| リーグ全体の捕手ランキング新設 | ユーザー要件はチームページ内の捕手成績のみ |
| 週間ランキングのチーム版 | 通算シーズンを先行。週間は Phase 5 以降 |
| チーム別 JSON のビルド時事前生成（v1） | クライアントフィルタで十分（1 球団 ≒ 30 名以下） |
| 過去年度の一括対応 | 2026 先行。1950〜は Phase 4 で段階拡張 |
| チームページ専用の新デザイン | ランキング `RankingUI`・個人ページ表スタイルを流用 |
| 名簿・スケジュール・ニュース記事 | 成績サブページに集中 |

---

## 2. 現状整理

### 2.1 チーム識別（SSOT）

| レイヤ | 識別子 | 正本 |
|--------|--------|------|
| 内部キー | `team_code`（`H`, `G`, `DB`, `Bs`, `Hs` 等） | `lib/standings/teamCodes.ts` |
| ランキング JSON 行 | `team`（コード）＋表示略称 | Phase 12 / 19 出力 |
| 名簿 | `team`（正式名）＋ `team_code` | `_data/npb_roster_{year}.csv` |
| URL slug | **未定義** | 本計画で `team_code` をパスに採用 |

**注意**: 表示名は文脈で揺れる（DeNA ↔ 横浜）。チームページ見出しは `teamDisplayNameFromCode()` を正とする。

### 2.2 既存ページ（再利用対象）

| 種別 | ルート | クライアント | 共有 UI |
|------|--------|-------------|---------|
| 打撃 | `/ranking/[year]/[league]` | `RankingPageClient.tsx` | `RankingUI` |
| 投手 | `/ranking/pitching/[year]/[league]` | `PitchingRankingPageClient.tsx` | `RankingUI` |
| 捕手（個人） | `/players/[playerId]` 今季 › 捕手成績 | `PlayerPageCatcherSeasonBody.tsx` | 独自表＋横棒グラフ |

### 2.3 未接続の導線

- `TopPageMobileDrawer.tsx` の 12 球団リンクはすべて `href="#"`（プレースホルダー）
- 順位表 `TopPageStandingsTab.tsx` の球団名はリンクなし
- `/teams` ルートは存在しない

### 2.4 捕手データ（チーム一覧の入力）

個人ページ捕手タブと同系の派生 JSON（`npm run phase3:derived:2026` 内）:

| Phase | 出力 | チーム一覧で使う主な値 |
|-------|------|----------------------|
| 22 | `player_catcher_appearances` | 捕手出場試合数 |
| 23 | `player_catcher_pitcher_splits` | 投手別成績の合算（被打者・WHIP 等） |
| 24 | `player_catcher_defense_basic` | 盗塁・阻止・CS% |
| 25 | `player_catcher_starting_summary` | 先発捕手時の QS 率・チーム勝率 等 |
| 26 | `player_catcher_pa_round_pitch_types` | v1 では一覧列に含めない（個人ページへ誘導） |

名簿 `position === "捕手"` と `gamesAsCatcher > 0` の和集合を行の母集団とする（個人タブ計画と整合）。

---

## 3. 目標 UX

### 3.1 URL 設計（v1 確定案）

```
/teams/{teamCode}/{year}                    → ハブ（デフォルト: 打撃ランキングへリダイレクト or 同一ページ内タブ）
/teams/{teamCode}/{year}/batting           → 打撃ランキング（所属選手）
/teams/{teamCode}/{year}/pitching          → 投手ランキング（所属選手）
/teams/{teamCode}/{year}/catchers          → 捕手成績一覧
```

**クエリ**（ランキング系は既存と同一）:

```
?sort={metricKey}&order=asc|desc
```

例:

- `/teams/H/2026/batting?sort=ops`
- `/teams/Bs/2026/pitching?sort=era&order=asc`

**バリデーション**:

- `teamCode`: `TEAM_CODE_TO_SHORT` のキー以外は `notFound()`
- `year`: v1 は `2026` のみ（投手ランキングと同型）。打撃は将来 1950〜拡張可
- リーグは URL に含めない → `team_code` から CL/PL を導出（`CL_TEAM_SHORTS` / `PL_TEAM_SHORTS` 経由）

### 3.2 チームページ共通シェル

```
┌─────────────────────────────────────────────┐
│ サイトヘッダー（既存）                        │
├─────────────────────────────────────────────┤
│ [球団帯] 阪神タイガース  2026年              │
│ セ・リーグ                                  │
├─────────────────────────────────────────────┤
│ [打撃ランキング] [投手ランキング] [捕手成績]   │  ← サブタブ（固定 or スクロール追従は v2）
├─────────────────────────────────────────────┤
│ （サブページ本文）                            │
└─────────────────────────────────────────────┘
```

- 球団帯色: `rankingTeamStripeColor(teamCode)` / `topPageConstants.teamColors`
- 年度セレクト: ランキングページと同型（v1 は 2026 固定表示でも可）
- パンくず: `トップ › 阪神 › 打撃ランキング`

### 3.3 打撃・投手ランキング（所属選手版）

**見た目・操作はリーグランキングと同一**:

- 指標タブ（`Record.csv` / `Record_pitching.csv` 由来）
- 列クリックでソート方向トグル
- 選手名 → `/players/{playerId}`
- 左端球団帯（全員同一色になるが、リーグ版との差分最小化のため**列は残す**）

**ロジック上の差分のみ**:

| 項目 | リーグ版 | チーム版 |
|------|---------|---------|
| データ取得 | リーグ JSON 全体 | **同一 JSON** |
| 行フィルタ | なし | `row.team === teamCode`（略称揺れは `teamCodeFromShort` で正規化） |
| 順位 | JSON の `rank` またはソート後採番 | **フィルタ後に 1 から再採番** |
| 規定打席 / 規定投球回 | リーグ `team-games.json` ベース | **変更なし**（所属選手でも規定はリーグ基準） |
| タイトル | `2026年 パ・リーグ 打撃成績ランキング` | `2026年 阪神 打撃成績ランキング` |
| `rankingPathBase` | `/ranking` | `/teams/H/2026/batting`（年度・リーグ切替 URL の組み立て用） |

**チーム列**: v1 は非表示にしない（将来 `hideTeamColumn` prop を `RankingUI` に追加する Issue は任意）。

### 3.4 捕手成績ページ

リーグランキング形式ではなく、**ソート可能な一覧表**（`RankingUI` に近いヘッダー操作、列構成は捕手業務向け）。

**行の母集団**:

```text
teamRosterCatchers(year, teamCode)
  = 名簿 position=捕手
  ∪ { appearances.gamesAsCatcher > 0 の選手 }
  （いずれも team_code が一致）
```

**v1 表示列（案）**:

| 順 | ラベル | データ源 | 備考 |
|---:|--------|---------|------|
| 1 | 順位 | ソート列に応じて採番 | |
| 2 | 選手 | 名簿 `name_ja` | 個人ページへリンク |
| 3 | 捕手試合 | phase22 `gamesAsCatcher` | |
| 4 | 盗塁企画 | phase24 `sbAttempts` | |
| 5 | 盗塁 | phase24 `sb` | |
| 6 | 阻止 | phase24 `cs` | |
| 7 | 阻止率 | phase24 `csPct` | |
| 8 | 先発回数 | phase25 `starts` | |
| 9 | チーム勝率 | phase25 `teamWinPct` | 先発捕手時 |
| 10 | QS率 | phase25 `qsPct` | |
| 11 | 被打者 | phase23 合算 | 投手別 split の合計 |
| 12 | WHIP | phase23 合算 | 算出 |
| 13 | K% | phase23 合算 | |

未生成・未出場は `—`（個人捕手タブと同様）。空状態は `DerivedPipelineEmptyNotice` 相当の短文。

**ソート既定**: 捕手試合数降順。

---

## 4. アーキテクチャ

### 4.1 ファイル構成（案）

```
app/teams/[teamCode]/[year]/
  layout.tsx                    # チームシェル・サブタブ・メタデータ
  page.tsx                      # → batting へ redirect
  batting/page.tsx
  batting/TeamBattingRankingPageClient.tsx
  pitching/page.tsx
  pitching/TeamPitchingRankingPageClient.tsx
  catchers/page.tsx
  catchers/TeamCatcherStatsPageClient.tsx

lib/teamPage/
  teamPageParams.ts             # teamCode/year 検証・リーグ導出
  filterRankingRowsByTeam.ts    # 行フィルタ＋順位再採番
  teamCatcherRoster.ts          # 名簿＋派生の行組み立て
  teamPageHref.ts               # URL ヘルパー
```

### 4.2 ランキングの共通化方針

**推奨: 薄いラッパー + 既存フック抽出**

1. `RankingPageClient` / `PitchingRankingPageClient` から「JSON 取得 → 規定フィルタ → ソート」を `useRankingTableData`（仮）に抽出
2. チーム版 Client は `teamCode` を渡し、ソート前に `filterRankingRowsByTeam(rows, teamCode)` を適用
3. `RankingUI` はそのまま利用（`rankingPathBase` と `title` のみ差し替え）

```typescript
// lib/teamPage/filterRankingRowsByTeam.ts
export function filterRankingRowsByTeam(
  rows: RankingRow[],
  teamCode: string,
): RankingRow[] {
  const code = teamCode.trim()
  return rows.filter((row) => teamCodeFromShort(String(row.team ?? "")) === code)
}

export function rerankRows(rows: RankingRow[]): RankingRow[] {
  return rows.map((row, i) => ({ ...row, rank: i + 1 }))
}
```

ビルドパイプライン（Phase 12 / 19）の変更は **v1 では不要**。

### 4.3 捕手一覧のデータ取得

**v1: クライアント集約（BFF なし）**

1. サーバー: 名簿 CSV から当該 `team_code` の捕手 `playerId` リストを渡す（または既存 `/api/roster/2026` を拡張）
2. クライアント: 各選手の捕手派生 API を並列 fetch（件数 ≦ 10 名/球団想定）
   - 既存: `/api/players/{id}/catcher-appearances` 等（個人ページと同じ）
3. 行オブジェクトにマージしてソート

**v2 候補**: `phase31:build:team-catcher-index` で `_data/derived/team_catcher_stats/{year}/{teamCode}.json` を事前生成し R2 配信（パフォーマンス・キャッシュ最適化）。

### 4.4 ナビゲーション接続

| 導線 | 変更 |
|------|------|
| モバイルドロワー 12 球団 | `href="#"` → `teamPageHref(code, 2026)` |
| 順位表の球団名 | 任意: チームページへリンク（Phase 3） |
| 個人ページの球団名 | 任意: 同上（Phase 3） |

---

## 5. Phase 分割

### Phase 0 — 要件確定書 ✅ 完了（2026-06-11）

- URL・サブタブ・フィルタ規則・捕手列を固定
- `team_code` を URL に採用（slug 別名は作らない）
- 週間・過去年・チーム列非表示は v2 以降

**成果物**:

- [`plan_team_page_phase0_spec.md`](plan_team_page_phase0_spec.md) — Phase 1 以降の正本
- `lib/teamPage/*` — 定数・パラメータ検証・URL・フィルタ・捕手列・合算ロジック
- `scripts/validate_team_page_phase0_unit.ts` — Phase 0 単体検証

---

### Phase 1 — ルーティングとチームシェル ✅ 完了（2026-06-11）

**目的**: 空でも 404 にならない骨格。

| タスク | 内容 |
|--------|------|
| 1-1 | `app/teams/[teamCode]/[year]/layout.tsx` — 球団名・リーグ・サブタブ |
| 1-2 | `lib/teamPage/teamPageParams.ts` — 検証・`generateStaticParams`（12 × 2026） |
| 1-3 | `lib/teamPage/teamPageHref.ts` |
| 1-4 | `/teams/{code}/{year}` → `/batting` リダイレクト |

**成果物**:

- `app/teams/layout.tsx` — Suspense
- `app/components/teamPage/TeamPageShell.tsx` — ヘッダー・パンくず・サブタブ
- `app/teams/[teamCode]/[year]/{batting,pitching,catchers}/page.tsx` — プレースホルダー
- `lib/teamPage/teamPagePath.ts` — パスからサブタブ判定

**完了条件**: `/teams/H/2026/batting` がシェル付きで表示（本文はプレースホルダー可）。

---

### Phase 2 — 打撃ランキング（所属選手） ✅ 完了（2026-06-11）

**目的**: リーグ版と同じ操作感のチーム打撃ランキング。

| タスク | 内容 |
|--------|------|
| 2-1 | `useBattingRankingTable` 抽出（`RankingPageClient` リファクタ） |
| 2-2 | `TeamBattingRankingPageClient` — フィルタ＋再採番 |
| 2-3 | `batting/page.tsx` — `loadMetricsFromRecord` + 初期 ViewModel |
| 2-4 | `RankingUI` に `embedInShell` / `titleScopeName` 追加 |

**成果物**:

- `hooks/useBattingRankingTable.ts`
- `lib/ranking/normalizeRankingRow.ts` · `sortBattingRankingRows.ts`
- `app/teams/.../batting/TeamBattingRankingPageClient.tsx`

**完了条件**: 阪神選手のみが並び、OPS ソート・規定打席・指標タブがリーグ版と一致。

**検証**: 同一選手について `/ranking/2026/CL?sort=ops` の値とチーム版のセル値が一致。

---

### Phase 3 — 投手ランキング（所属選手） ✅ 完了（2026-06-11）

**目的**: Phase 2 の投手版。

| タスク | 内容 |
|--------|------|
| 3-1 | `usePitchingRankingTable` 抽出 |
| 3-2 | `TeamPitchingRankingPageClient` |
| 3-3 | `pitching/page.tsx`（`parseTeamPageParams` で 2026 のみ） |

**成果物**:

- `hooks/usePitchingRankingTable.ts`
- `lib/ranking/sortPitchingRankingRows.ts`
- `app/teams/.../pitching/TeamPitchingRankingPageClient.tsx`

**完了条件**: `/teams/H/2026/pitching?sort=era` がリーグ投手版と同型。

---

### Phase 4 — 捕手成績一覧 ✅ 完了（2026-06-11）

**目的**: チーム所属捕手の一覧表。

| タスク | 内容 |
|--------|------|
| 4-1 | `buildTeamCatcherRosterSeeds` — 名簿捕手＋出場捕手の和集合 |
| 4-2 | `TeamCatcherStatsTable` — 13 列ソート可能表 |
| 4-3 | `useTeamCatcherStatsRows` — 個人捕手 API 並列取得 |
| 4-4 | 空状態・パイプライン未生成時の表示 |

**成果物**:

- `lib/teamPage/buildTeamCatcherRosterSeeds.ts`
- `hooks/useTeamCatcherStatsRows.ts`
- `app/components/teamPage/TeamCatcherStatsTable.tsx`
- `app/teams/.../catchers/TeamCatcherStatsPageClient.tsx`

**完了条件**: 名簿捕手＋出場捕手が一覧表示され、捕手試合数でソート可能。

**検証**: 個人捕手タブの合算値と一覧行が一致。

---

### Phase 5 — 導線と運用 ✅ 完了（2026-06-11）

| タスク | 内容 |
|--------|------|
| 5-1 | ドロワー 12 球団リンク接続 |
| 5-2 | 順位表からのリンク |
| 5-3 | `docs/DATA_PATHS.md` にチームページ追記 |
| 5-4 | `validate:team-page-phase0` に導線検証を追加 |

**成果物**: `lib/teamPage/teamPageNavLinks.ts` · `TopPageMobileDrawer` · `TopPageStandingsTab`

---

### Phase 6 以降（バックログ）

| 項目 | 内容 |
|------|------|
| 週間チーム版 | `/teams/{code}/{year}/batting/weekly/{weekKey}` |
| 過去年度 | 打撃 1950〜、投手はデータ整備年度から |
| チーム別 JSON 事前生成 | 大量アクセス時の最適化 |
| チーム概要タブ | 順位表行・リーダー・予想投手へのハブ |
| `RankingUI` チーム列非表示 | 所属が自明のため UI 簡素化 |
| 英字名・R2 | 既存ランキングと同じ `roman-names` API を流用 |

---

## 6. リスクと方針

| リスク | 対策 |
|--------|------|
| `team` 列の表記揺れでフィルタ漏れ | `teamCodeFromShort` で正規化。スモークで 12 球団全件 |
| 規定未到達の所属選手が率系で消える | リーグ版と同仕様であることを UI 注記で明示 |
| 捕手 API 多重 fetch | v1 は球団あたり少数。v2 で team index JSON |
| `Bs` / `Hs` など大文字小文字混在 URL | `generateStaticParams` は canonical な `team_code` のみ。別表記は 301 リダイレクト検討 |
| 投手のみ 2026 制限と打撃の年度差 | シェルの年度セレクトはサブページごとに有効年度を出し分け |

---

## 7. 受け入れ基準（v1 全体）

1. 12 球団すべてで `/teams/{code}/2026/batting` `pitching` `catchers` が開ける
2. 打撃・投手はリーグランキングと**同一指標・同一ソート・同一規定ルール**で、行が所属選手のみ
3. 順位はチーム内で 1 から連番
4. 捕手ページは名簿捕手を欠落なく列挙（データなしは `—`）
5. モバイルドロワーから少なくとも 1 球団でチームページに到達できる

---

## 8. 参考: 既存コードマップ

| 用途 | パス |
|------|------|
| 打撃ランキング Client | `app/ranking/[year]/[league]/RankingPageClient.tsx` |
| 投手ランキング Client | `app/ranking/pitching/[year]/[league]/PitchingRankingPageClient.tsx` |
| ランキング UI | `components/RankingUI.tsx` |
| チームコード SSOT | `lib/standings/teamCodes.ts` |
| 捕手個人 UI | `app/players/[playerId]/PlayerPageCatcherSeasonBody.tsx` |
| 捕手派生 hook | `hooks/useCatcherSeasonDerived.ts` |
| 順位表（導線候補） | `app/components/top/TopPageStandingsTab.tsx` |
| ドロワー（導線） | `app/components/top/TopPageMobileDrawer.tsx` |

---

## 9. 次のアクション

1. ~~Phase 0–5（v1）~~ → 完了
2. **Phase 6 以降**: 週間チーム版・過去年・チーム概要タブ等（バックログ）
