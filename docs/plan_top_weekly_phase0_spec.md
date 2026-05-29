# 週間トップ／週間ランキング — Phase 0 要件確定書

**状態**: ✅ Phase 0 完了（2026-05-19）  
**親計画**: [`plan_top_weekly_tab_and_rankings_phases.md`](plan_top_weekly_tab_and_rankings_phases.md)

本書は v1 実装前にブレないよう固定した決定事項である。Phase 1 以降は本書に従う。

---

## 1. スコープ（v1 でやる／やらない）

| やる | やらない（別 Issue） |
|------|----------------------|
| トップ「今週」タブ（CL・PL・打撃・投球） | 月間タブ・月間ランキング |
| 週間ランキングページ（指標切替・過去週） | トップでの過去週セレクタ |
| Phase 17 / Phase 7 派生の**読み取りのみ**で週間 JSON 生成 | canonical からの週次**再集計** |
| 2026 年度を先行対象 | 2025 以前の週間（Phase 17 未生成年度） |

---

## 2. 「今週」の定義

| 項目 | 決定 |
|------|------|
| 週の区切り | **火曜 0:00 〜 日曜**（個人ページ・Phase 17 / Phase 7 と同一） |
| 週キー `weekKey` | その週の**火曜日** `YYYY-MM-DD`（`lib/yahooGame/jstPeriodKeys.ts` の `tuesdayWeekKeyFromYmd`） |
| 表示ラベル | Phase 17 / 7 の `split_label`（例: `5/13〜5/18`） |
| トップ「今週」タブ | **常に「今日を含む週」**のみ（週セレクタなし） |
| 週間ランキングページ | **今週をデフォルト**＋過去週を切替可能 |
| ビルド時に保持する週数 | **今週 + 直近 3 週**（計 4 週分の JSON を生成・上書き更新） |

---

## 3. データの正（SSOT）— 個人ページとの一致

| 用途 | 正（読むだけ） | 再集計 |
|------|----------------|--------|
| 打撃・週間 | `_data/derived/player_season_batting_period/{year}/yahoo_{yahooId}.json` の `split_type === "calendar_week"` | **禁止** |
| 投球・週間 | `_data/derived/player_season_pitching_period/{year}/npb_{npbId}.json` の `calendar_week` | **禁止** |
| 週の算出 | Phase 17 / 7 ビルド時のみ（`phase3:derived:2026` に含まれる） | 週間ランキング用に二重実行しない |

**個人ページと週間ランキングの数値**は、同一ファイル・同一 `split_value`（週キー）の行を参照すれば一致する。ズレるのは主に更新タイミングのズレか、再集計をした場合のみ。

---

## 4. 規定（週間）

> **改定（2026-05-21）**: **2026 週間**でも球団ごとに **試合数・規定打席・規定投球回を区別**する。  
> **試合数** = 当週の **canonical 取得試合数**（Phase 0 改定。初版の「選手 JSON max」は撤回）。  
> 率系の詳細は [`plan_ranking_qualifying_phase0_spec.md`](plan_ranking_qualifying_phase0_spec.md) §0.2・§3 が正。

| 区分 | JSON 掲載条件（Phase 28・不変） | 率系の表示フィルタ（Phase 3 以降） |
|------|--------------------------------|-----------------------------------|
| 打撃 | Phase 17 と同じ **`pa > 0` の週行のみ** | 当週 canonical の **`team-games.json`** に基づく **`minPA(team)`**（`teamGames × 3.1`） |
| 投球 | Phase 7 の **週行あり**（登板実績） | 同上 **`minIp(team)`**（`teamGames × 1.0`） |
| カウント系 | 週行あり | **規定なし** |

**実装済み（Phase 3 / 2026-05-21）**

- 週間ランキング UI: `WeeklyRankingPageClient` / `WeeklyPitchingRankingPageClient` が当週 `team-games.json` で率系フィルタ
- トップ今週タブ: `weeklyLeadersSnapshotBuild.ts` → `build*LeadersConfigAtLeagueDir(..., { weekKey })`（規定あり）
- Phase 28 ビルド: 率系 JSON を当週 `teamGames` で絞り込み（Phase 4）

トップの上位表示件数は通算と同型: 打撃 top3 は各 **3 位まで**、ミニは **1 位のみ**（`leadersFromRankingsJson.ts` と同じ）。

---

## 5. 表示指標（TOP タブと同一）

### 打撃

| 枠 | 指標 |
|----|------|
| 大（top3） | OPS・打率・本塁打 |
| ミニ | 出塁率・長打率・打点・安打・盗塁 |

参照: `lib/ranking/leadersFromRankingsJson.ts` の `TOP3_METRICS` / `MINI_METRICS`

### 投球（2026 レイアウト）

| 枠 | 指標 |
|----|------|
| 大（2×2） | 防御率・K-BB％・勝利・セーブ |
| ミニ | K％・QS率・完封・HLD |

参照: `lib/topPagePitching2026Grid.ts`

---

## 6. URL（確定）

### 打撃・週間ランキング

```
/ranking/weekly/{year}/{weekKey}/{league}?sort={metricKey}&order={asc|desc}
```

- 例: `/ranking/weekly/2026/2026-05-13/PL?sort=ops&order=desc`
- `league`: `CL` | `PL`
- `sort` / `order`: 通算 `/ranking/{year}/{league}` と同じ `metricMap`・ソート向き

### 投球・週間ランキング

```
/ranking/pitching/weekly/{year}/{weekKey}/{league}?sort={metricKey}&order={asc|desc}
```

- 例: `/ranking/pitching/weekly/2026/2026-05-13/CL?sort=era&order=asc`
- `sort` / `order`: 通算投手ランキングと同じ `pitchingSortOrder`

### トップからの遷移（TOP タブと同型）

| 操作 | 打撃 | 投球 |
|------|------|------|
| 指標名クリック | 上記 URL（該当指標の `sort`） | 上記 URL（該当指標） |
| 「成績一覧」 | `sort=ops`・`order=desc` | `sort=era`（防御率）・`order=asc` |

### メタ（今週の解決）

```
public/data/rankings/weekly/{year}/current-week.json
```

内容: `{ "weekKey": "YYYY-MM-DD", "weekLabel": "M/D〜M/D" }`（ビルド日時点の「今週」）

---

## 7. ファイルパス（確定・DATA_PATHS ドラフト）

| パス | 役割 |
|------|------|
| `_data/derived/player_season_batting_period/{year}/yahoo_*.json` | 打撃週間の**入力**（Phase 17・個人ページと共有） |
| `_data/derived/player_season_pitching_period/{year}/npb_*.json` | 投球週間の**入力**（Phase 7） |
| `public/data/rankings/weekly/{year}/{weekKey}/{CL\|PL}/*.json` | 打撃・週間ランキング JSON（Phase 28 出力） |
| `public/data/rankings/pitching/weekly/{year}/{weekKey}/{CL\|PL}/*.json` | 投球・週間ランキング JSON |
| `public/data/rankings/weekly/{year}/current-week.json` | トップが参照する「今週」メタ |
| `public/data/top-leaders/weekly/{year}/{weekKey}/{CL\|PL}/batting.json` | 今週タブ・打撃スナップショット |
| `public/data/top-leaders/weekly/{year}/{weekKey}/{CL\|PL}/pitching.json` | 今週タブ・投球スナップショット |

---

## 8. 受け入れ条件（全体・変更なし）

1. 今週タブで TOP と同様に指標名・数値・選手リンクが表示される。  
2. 指標名・成績一覧から週間ランキングへ遷移でき、数値は Phase 17 / 7 と一致する。  
3. `npm run phase3:derived:2026:and-rankings`（Phase 5 完了後）1 回で週間 JSON も更新される。

---

## 9. Phase 1 への引き継ぎ

- スクリプト名: `phase28:build:weekly-rankings`（`scripts/phase28_build_weekly_rankings_from_period.ts`）
- 入力: 本書 §3 の派生 JSON のみ
- 出力: 本書 §7 の `public/data/rankings/weekly/...` および `pitching/weekly/...`
- 週: `--week YYYY-MM-DD` 省略時はビルド日の今週 + 直近 3 週
