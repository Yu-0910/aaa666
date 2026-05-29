# 規定打席（PA）到達に関する指標分類

## 概要（2026・チーム別区別）

**2026 年シーズン**の率系ランキングでは、**所属球団ごと**に次を区別する（本サイトの主運用）。

| 値 | 算出（2026） |
|----|--------------|
| チーム試合数 | **一括取得の canonical** から数えた球団別消化試合数（`public/data/rankings/2026/{CL\|PL}/team-games.json`）。**選手行の max(`games`) は使わない** |
| 規定打席 | `round(teamGames × 3.1)` — **球団ごとに異なる** |

計画の全体像: [`plan_ranking_qualifying_weekly_and_season_phases.md`](plan_ranking_qualifying_weekly_and_season_phases.md)、確定仕様: [`plan_ranking_qualifying_phase0_spec.md`](plan_ranking_qualifying_phase0_spec.md)。

> **Phase 0 改定（2026-05-21）**: 初版は「ランキング JSON の選手 max(`games`)」を `teamGames` としていたが **撤回**。**正**は一括取得済み **canonical の球団別取得試合数**（§0.2 参照）。

---

ランキング表示時、指標ごとに「規定打席到達が必要 / 不要」を分類し、適切なフィルタリングを適用します。

- **規定打席が必要な指標（率・割合・指標系）**: 少サンプルの上振れを除外するため、`PA >= minPA` でフィルタリング
- **規定打席が不要な指標（カウント系）**: 通算量のランキングのため、フィルタリングしない（30位まで表示）

## 規定打席の計算

### 計算式

```
minPA(team) = roundOrFloor(teamGames(team) × 3.1, year)
```

| 年度 | 端数処理 |
|------|----------|
| **2009年以降**（2026 含む） | **四捨五入**（`Math.round`） |
| **2008年以前** | **切り捨て**（`Math.floor`） |

**チーム試合数** `teamGames(team)`: Phase 12/28 が **既に読む canonical** から球団別にカウントし、`team-games.json` に書き出す値。ランキング表示時にその JSON を読む（追加 HTTP なし）。  
詳細: [`plan_ranking_qualifying_phase0_spec.md`](plan_ranking_qualifying_phase0_spec.md) §2。

### 現在の設定（2026・全チーム 143 試合消化時）

- **143 × 3.1 = 443.3** → **443 打席**（四捨五入）

### 実装場所

- 静的フォールバック: `lib/ranking/qualifyingPA.ts` の `calculateMinPA()`
- 2026（正・Phase 1）: `team-games.json` → `minPAFromTeamGames(teamGames, year)`
- 暫定（フォールバックのみ）: `computeDynamicMinPAByTeam(rows)` — 選手行 max。**本番 2026 では `team-games.json` 優先**
- ビルド時（Phase 4）: Phase 12/28 が率系 `{metric}.json` を規定到達者のみで出力（`filterRankingsByQualifyingAtBuild.ts`）

## 指標分類

### A) 規定打席到達が必要な指標（率・割合・指標系）

少サンプルの上振れを除外するため、`PA >= minPA` でフィルタリングを適用します。

| 内部キー | 表示名 | 説明 |
|---------|--------|------|
| `ops` | OPS | 出塁率 + 長打率 |
| `avg` | 打率 | 安打 / 打数 |
| `obp` | 出塁率 | (安打 + 四球 + 死球) / (打数 + 四球 + 死球 + 犠飛) |
| `slg` | 長打率 | 塁打 / 打数 |
| `isop` | IsoP | 長打率 - 打率 |
| `isod` | IsoD | 出塁率 - 打率 |
| `bbpct` | BB% | 四球率 |
| `kpct` | K% | 三振率 |
| `bbk` | BB/K | 四球 / 三振 |
| `rc` | RC | Runs Created |
| `xr` | XR | Extrapolated Runs |
| `babip` | BABIP | Batting Average on Balls In Play |
| `seca` | SecA | Secondary Average |
| `ta` | TA | Total Average |
| `noi` | NOI | Net Offensive Index |
| `gpa` | GPA | Gross Production Average |

**実装定数**: `METRICS_REQUIRE_QUALIFYING_PA` (Set型)

### B) 規定打席到達が不要な指標（カウント系）

通算量のランキングのため、規定打席フィルタを適用しません。**30位まで表示**します。

| 内部キー | 表示名 | 説明 |
|---------|--------|------|
| `hits` | 安打 | 単打 + 二塁打 + 三塁打 + 本塁打 |
| `hr` | 本塁打 | Home Runs |
| `rbi` | 打点 | Runs Batted In |
| `games` | 試合 | Games Played |
| `pa` | 打席 | Plate Appearances |
| `ab` | 打数 | At Bats |
| `singles` | 単打 | Singles (1B) |
| `doubles` | 二塁打 | Doubles (2B) |
| `triples` | 三塁打 | Triples (3B) |
| `runs` | 得点 | Runs Scored |
| `bb` | 四球 | Bases on Balls (Walks) |
| `ibb` | 敬遠 | Intentional Bases on Balls |
| `hbp` | 死球 | Hit By Pitch |
| `so` | 三振 | Strikeouts |
| `tb` | 塁打 | Total Bases |
| `sb` | 盗塁 | Stolen Bases |
| `cs` | 盗塁死 | Caught Stealing |
| `sh` | 犠打 | Sacrifice Hits |
| `sf` | 犠飛 | Sacrifice Flies |
| `gidp` | 併殺打 | Ground Into Double Play |

**実装定数**: `METRICS_NO_QUALIFYING_PA` (Set型)

## 2026 週間（Phase 3）

| 項目 | 内容 |
|------|------|
| 試合数 | `public/data/rankings/weekly/2026/{weekKey}/{CL\|PL}/team-games.json`（当週 canonical のみ） |
| 規定打席 | `minPA(team) = round(teamGames × 3.1)`（通算と同式・期間のみ週） |
| UI | `WeeklyRankingPageClient` / 投手週間クライアント + トップ今週（`weekKey` 付きリーダー） |
| ビルド | Phase 28 が率系 JSON を絞り込み（Phase 4） |

週間でも **カウント系（安打・勝利等）は規定なし**。

## 実装詳細

### ファイル構成

1. **`lib/ranking/qualifyingPA.ts`**
   - 指標分類の定数定義
   - `shouldRequireQualifyingPA()`: 指標キーから規定打席の要否を判定
   - `calculateMinPA()`: 年度・リーグに基づいて規定打席を計算

2. **`lib/ranking/qualifyingThresholds.ts`** — `team-games.json` 読込・`minPA` Map
3. **`lib/ranking/filterRankingsByQualifyingAtBuild.ts`** — Phase 12/19/28 ビルド時絞り込み
4. **`app/ranking/[year]/[league]/RankingPageClient.tsx`** — 2026 通算・率系フィルタ + `titleSubNote`
5. **`app/ranking/weekly/.../WeeklyRankingPageClient.tsx`** — 2026 週間・同上（`weekKey` 付き fetch）

### 処理フロー

1. **ソート対象の指標キーを決定**
   ```typescript
   const targetSortKey = sortKey === defaultSortKey || !sortKey ? "ops" : sortKey
   ```

2. **規定打席の要否を判定**
   ```typescript
   const requiresQualifyingPA = shouldRequireQualifyingPA(targetSortKey)
   ```

3. **フィルタリング適用**
   - **規定打席が必要な場合**: `PA >= minPA` でフィルタリング
   - **規定打席が不要な場合**: フィルタリングしない（全選手対象）

4. **ソート処理**
   - フィルタリング後の選手データをソート

5. **表示制限**
   - **規定打席が必要な指標**: フィルタリング後の全選手を表示
   - **規定打席が不要な指標**: **30位まで表示**

### エラーハンドリング

未知の指標キーが来た場合：
- `shouldRequireQualifyingPA()` がエラーを投げる
- エラーはコンソールに記録される
- フィルタリングは適用されない（全選手対象）

**目的**: サイレント無視を防ぎ、新しい指標が追加された際に気づけるようにする

## 期待される挙動

### 例1: OPSランキング
- **フィルタ**: `PA >= 443` の選手のみ
- **表示**: フィルタリング後の全選手（通常100位程度）

### 例2: 安打ランキング
- **フィルタ**: なし（全選手対象）
- **表示**: 上位30位まで

### 例3: BABIPランキング
- **フィルタ**: `PA >= 443` の選手のみ
- **表示**: フィルタリング後の全選手

### 例4: BB/Kランキング
- **フィルタ**: `PA >= 443` の選手のみ
- **表示**: フィルタリング後の全選手

## デバッグログ

開発環境（`NODE_ENV === 'development'`）では、以下のログが出力されます：

- `[RankingPage] Qualifying PA filter check:` - フィルタチェックの開始情報
- `[QualifyingPA] Checking metric:` - 指標キーの正規化結果
- `[RankingPage] Applied qualifying PA filter:` - フィルタ適用結果（フィルタ前後の選手数）
- `[RankingPage] No qualifying PA filter (count metric), will limit to top 30` - カウント系指標の30位制限
- `[RankingPage] Limiting to top 30 (count metric):` - 30位制限の適用結果

## 注意事項

1. **指標キーの正規化**
   - `normalizeMetricKey()` が `bbPct` や `kPct` のように大文字小文字が混在したキーを返す場合がある
   - `shouldRequireQualifyingPA()` は内部で `toLowerCase()` を呼ぶため、問題なく動作する

2. **PAフィールドの取得**
   - 選手データから `player.pa` または `player.PA` を取得
   - どちらも存在しない場合は `0` として扱う

3. **新しい指標の追加時**
   - `lib/ranking/qualifyingPA.ts` の適切なSetに追加する必要がある
   - 追加しないとエラーが発生し、フィルタリングが適用されない

## 関連ファイル

- `lib/ranking/qualifyingPA.ts` - 規定打席フィルタの実装
- `app/ranking/[category]/RankingPageClient.tsx` - ランキングページのクライアントコンポーネント
- `lib/ranking/adapter.ts` - ランキング生成アダプター（サーバー側）


















