# チームページ — Phase 0 要件確定書

**状態**: ✅ Phase 0 完了（**2026-06-11**。実装は Phase 1 以降）  
**親計画**: [`plan_team_page_phases.md`](plan_team_page_phases.md)

Phase 1 以降は **本書** に従う。URL・サブタブ・フィルタ・捕手列・コード正本はここで固定する。

---

## 1. スコープ（v1 でやる／やらない）

| やる | やらない（別 Issue） |
|------|----------------------|
| `/teams/{teamCode}/{year}` ハブ＋3 サブページ | リーグ全体の捕手ランキング |
| 打撃・投手ランキング（所属選手フィルタ） | 週間ランキングのチーム版 |
| 捕手成績一覧（チーム内） | チーム別 JSON のビルド時事前生成 |
| 2026 年先行 | 過去年度の一括対応（Phase 6） |
| `RankingUI` 流用 | チーム専用デザイン |
| `lib/teamPage/*` を Phase 0 で正本化 | 名簿・スケジュール・記事 |

---

## 2. URL とルーティング（確定）

### 2.1 パス

| パス | 役割 |
|------|------|
| `/teams/{teamCode}/{year}` | ハブ → **`/batting` へ 307/308 リダイレクト** |
| `/teams/{teamCode}/{year}/batting` | 打撃ランキング（所属選手） |
| `/teams/{teamCode}/{year}/pitching` | 投手ランキング（所属選手） |
| `/teams/{teamCode}/{year}/catchers` | 捕手成績一覧 |

### 2.2 クエリ（ランキング系）

| キー | 値 | 既定 |
|------|-----|------|
| `sort` | 指標 JSON キー | 打撃 `ops` / 投手 `era` |
| `order` | `asc` \| `desc` | 指標ごとのリーグ版既定 |

### 2.3 パラメータ検証

| パラメータ | 正本 | 無効時 |
|-----------|------|--------|
| `teamCode` | `lib/teamPage/teamPageConstants.ts` の `ORDERED_TEAM_CODES` | `notFound()` |
| `year` | v1 は **`2026` のみ** | `notFound()` |

**slug 別名は作らない**（`hanshin` 等は不可）。`Bs` / `Hs` は名簿 `team_code` そのまま。

### 2.4 リーグ導出

URL に `league` は含めない。`teamCode` → 略称 → `leagueBucketForTeamShort()` で `CL` / `PL` を導出し、ランキング JSON 取得に使う。

コード正本: `lib/teamPage/teamPageParams.ts` の `leagueForTeamCode()`。

---

## 3. チーム識別（SSOT）

| 用途 | 正本 |
|------|------|
| URL・内部キー | `team_code`（`H`, `G`, `DB`, `Bs`, `Hs` 等） |
| コード ↔ 略称 | `lib/standings/teamCodes.ts` |
| ページ見出し表示名 | `teamDisplayNameFromCode()` |
| 12 球団の列挙順 | `lib/teamPage/teamPageConstants.ts` の `ORDERED_TEAM_CODES`（`PLAYER_MATCHUP_TEAM_ORDER` と整合） |

---

## 4. サブタブ（確定）

| id | ラベル | パス suffix |
|----|--------|-------------|
| `batting` | 打撃ランキング | `/batting` |
| `pitching` | 投手ランキング | `/pitching` |
| `catchers` | 捕手成績 | `/catchers` |

デフォルト表示: **打撃ランキング**。

---

## 5. 打撃・投手ランキング（所属選手版）

### 5.1 データ

| 項目 | 確定 |
|------|------|
| JSON | リーグ版と**同一**（`loadRankingJson` / `loadPitchingRankingJson`） |
| ビルド変更 | v1 **なし** |
| 規定打席 / 規定投球回 | リーグ版と**同一**（`team-games.json` ベース） |

### 5.2 フィルタと順位

1. JSON 行を取得し規定フィルタ・ソート（リーグ版と同手順）
2. `filterRankingRowsByTeam(rows, teamCode)` で所属選手のみ残す
3. `rerankRows()` で **1 から連番**に再採番

フィルタ: `teamCodeFromShort(row.team) === teamCode`（`lib/teamPage/filterRankingRowsByTeam.ts`）。

### 5.3 UI 差分

| 項目 | リーグ版 | チーム版 |
|------|---------|---------|
| タイトル | `{year}年 {リーグ} …` | `{year}年 {球団表示名} …` |
| `rankingPathBase` | `/ranking` 等 | `/teams/{code}/{year}/batting` 等 |
| チーム列 | あり | **v1 も残す**（非表示は Phase 6） |
| 球団帯 | 行ごと | 全行同一色（問題なし） |

### 5.4 タイトル文言（確定）

| サブページ | テンプレート |
|-----------|-------------|
| 打撃 | `{year}年 {teamDisplay} 打撃成績ランキング` |
| 投手 | `{year}年 {teamDisplay} 投手成績ランキング` |

---

## 6. 捕手成績一覧（確定）

### 6.1 行の母集団

```text
teamRosterCatchers(year, teamCode) =
  { 名簿 position === "捕手" AND team_code === teamCode }
  ∪ { phase22 gamesAsCatcher > 0 AND team_code === teamCode }
```

和集合。名簿捕手は派生未生成でも行に出す（セルは `—`）。

### 6.2 表示列（v1 固定）

コード正本: `lib/teamPage/teamCatcherColumns.ts`

| 順 | 列 key | ラベル | データ源 | ソート型 |
|---:|--------|--------|---------|---------|
| 1 | `rank` | 順位 | 表示時採番 | — |
| 2 | `player` | 選手 | 名簿 `name_ja` | 文字列 |
| 3 | `gamesAsCatcher` | 捕手試合 | phase22 | 数値 |
| 4 | `sbAttempts` | 盗塁企画 | phase24 | 数値 |
| 5 | `sb` | 盗塁 | phase24 | 数値 |
| 6 | `cs` | 阻止 | phase24 | 数値 |
| 7 | `csPct` | 阻止率 | phase24 | 数値 |
| 8 | `starts` | 先発回数 | phase25 | 数値 |
| 9 | `teamWinPct` | チーム勝率 | phase25（先発捕手時） | 数値 |
| 10 | `qsPct` | QS率 | phase25 | 数値 |
| 11 | `bf` | 被打者 | phase23 合算 | 数値 |
| 12 | `whip` | WHIP | phase23 合算 | 数値 |
| 13 | `kPct` | K% | phase23 合算 `SO/BF×100` | 数値 |

**含めない**: phase26 巡目別球種（個人ページへ誘導）。

### 6.3 合算ルール（phase23）

個人捕手タブ「基本成績」と同型。正本: `lib/teamPage/teamCatcherMetrics.ts`

- `bf`, `h`, `so`, `bb`, `hbp`, `ipOuts` を投手別行で合算
- `whip = (h + bb) / (ipOuts / 3)`（`ipOuts > 0` のとき）
- `kPct = so / bf × 100`（`bf > 0` のとき）

### 6.4 ソート既定

- **既定列**: `gamesAsCatcher`
- **既定順**: `desc`

### 6.5 データ取得（v1）

1. サーバー: 名簿から当該 `team_code` の捕手 ID リスト
2. クライアント: 既存捕手 API を選手ごとに並列 fetch
3. 空状態: `DerivedPipelineEmptyNotice` 相当

---

## 7. シェル UI（確定）

```
[球団帯] {teamDisplay}  {year}年
{セ・リーグ | パ・リーグ}
[打撃ランキング] [投手ランキング] [捕手成績]
（サブページ本文）
```

- 球団帯色: `rankingTeamStripeColor(teamCode)`
- パンくず: `トップ › {teamDisplay} › {サブタブラベル}`
- サブタブ固定: v1 はスクロール追従なし（Phase 6 検討）

---

## 8. コード正本（Phase 0 成果物）

| ファイル | 役割 |
|---------|------|
| `lib/teamPage/teamPageConstants.ts` | 年度・サブタブ・12 球団順 |
| `lib/teamPage/teamPageParams.ts` | パラメータ検証・リーグ導出・`generateStaticParams` 用 |
| `lib/teamPage/teamPageHref.ts` | URL 組み立て |
| `lib/teamPage/filterRankingRowsByTeam.ts` | ランキング行フィルタ・再採番 |
| `lib/teamPage/teamCatcherColumns.ts` | 捕手一覧列定義 |
| `lib/teamPage/teamCatcherMetrics.ts` | phase23 合算 |
| `lib/teamPage/teamCatcherRoster.ts` | 捕手行の型・名簿マージ型 |
| `scripts/validate_team_page_phase0_unit.ts` | Phase 0 単体検証 |

---

## 9. 受け入れ基準（Phase 0）

- [x] 本書が親計画より詳細な正本として参照できる
- [x] `lib/teamPage/*` が URL・列・フィルタ規則をコード化している
- [x] 12 球団すべてで `parseTeamPageParams` が成功する
- [x] `filterRankingRowsByTeam` がコード・略称の揺れに耐性がある
- [x] 親計画の Phase 0 を完了に更新

---

## 10. Phase 1 への引き継ぎ

1. `app/teams/[teamCode]/[year]/layout.tsx` — 本書 §7 シェル
2. `page.tsx` — `/batting` リダイレクト
3. 各サブページはプレースホルダー可（404 にならないこと）
