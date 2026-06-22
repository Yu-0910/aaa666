# チーム順位表 — Phase 計画書

> **Phase 0**: ✅ 完了 — 要件確定書 [`plan_team_standings_phase0_spec.md`](plan_team_standings_phase0_spec.md)

**関連**: 表示用データ R2 一本化 [`plan_display_data_r2_unified_phases.md`](plan_display_data_r2_unified_phases.md) · キー規則 [`phase2_r2_display_spec.md`](phase2_r2_display_spec.md) · 運用 [`data_operation_rules.md`](data_operation_rules.md)

## 1. 目的とスコープ

トップページの **「Quiz」タブを「順位表」タブに差し替え**、**セ・リーグ・パ・リーグ**それぞれの **チーム順位表**を表示する。

| 区分 | 方針 |
|------|------|
| **表示場所** | トップページ メインタブ第5（現 `Quiz` → `順位表`） |
| **対象リーグ** | セ・リーグ（CL）・パ・リーグ（PL）を**縦に2ブロック**表示 |
| **対象年度** | v1 は **2026 年**を先行。トップの年度セレクタと連動（過去年度は Phase 3 で拡張） |
| **データの正（工場）** | **2026**: canonical から再集計。過去年度は **マスタ CSV** から再集計 |
| **本番の表示 SSOT** | **Cloudflare R2**（ランキング・トップリーダーと同型） |
| **UI** | v1 は**暫定デザイン**。個人ページ・ランキングページの表スタイル＋**球団帯カラー** |
| **一括更新** | 工場再生成 → ローカル `public/data/standings/` → **R2 全置換**（`display:r2:upload`） |

### 1.1 非スコープ（v1）

- 順位表専用の独立 URL ページ（トップタブ内のみ）
- **春季キャンプ・オープン戦**（順位表の集計対象外。**交流戦は各リーグ表に含む** — §3.3）
- 失策・残試合・引分以外の「順位決定方式」細則（同率順位の tie-break ルールは Phase 0 で簡易固定）
- デザインの最終調整（Phase 5 以降の別 Issue）

---

## 2. 指標一覧（確定順・ラベル）

以下の順で列を並べる。内部キー（JSON）は英字スネークケースで一意化する。

| 順 | 表示ラベル（UI） | JSON キー | 種別 | 備考 |
|---:|---|---|:---:|---|
| 1 | 球団 | `team` / `teamName` | 文字列 | 略称＋正式名。左に **球団帯カラー** |
| 2 | 試 | `g` | 整数 | 消化試合数（勝+敗+分） |
| 3 | 勝 | `w` | 整数 | |
| 4 | 敗 | `l` | 整数 | |
| 5 | 分 | `t` | 整数 | 引分 |
| 6 | 勝率 | `pct` | 実数 | 表示 `.xxx` または `xx.x%`（formatStat に合わせる） |
| 7 | ゲーム差 | `gb` | 文字列 | 首位との差。首位は `—` |
| 8 | 得点 | `runs` | 整数 | チーム総得点 |
| 9 | OPS | `ops` | 実数 | 打率系は **チーム打撃合算**から算出 |
| 10 | 打率 | `avg` | 実数 | |
| 11 | 本塁打 | `hr` | 整数 | |
| 12 | 安打 | `h` | 整数 | |
| 13 | 単打 | `singles` | 整数 | `H - 2B - 3B - HR` |
| 14 | 二塁打 | `doubles` | 整数 | |
| 15 | 三塁打 | `triples` | 整数 | |
| 16 | 出塁率 | `obp` | 実数 | |
| 17 | 長打率 | `slg` | 実数 | |
| 18 | 得点圏打率 | `risp_avg` | 実数 | `risp` フラグ付き打席から算出 |
| 19 | IsoD | `isod` | 実数 | `OBP - AVG` |
| 20 | IsoP | `isop` | 実数 | `SLG - AVG` |
| 21 | BB% | `bb_pct` | 実数 | 打撃: `BB / PA × 100` |
| 22 | K% | `k_pct` | 実数 | 打撃: `SO / PA × 100` |
| 23 | 防御率 | `era` | 実数 | チーム全体 |
| 24 | 先発防御率 | `era_starter` | 実数 | 先発登板分のみ |
| 25 | 救援防御率 | `era_relief` | 実数 | 救援登板分のみ |
| 26 | 被打率 | `avg_allowed` | 実数 | 相手打者のチーム被打率 |
| 27 | 完投 | `cg` | 整数 | |
| 28 | BB% | `bb_pct_pitch` | 実数 | 投手: `BB / BF × 100`（打撃 BB% と別キー） |
| 29 | K% | `k_pct_pitch` | 実数 | 投手: `SO / BF × 100` |
| 30 | K-BB% | `k_bb_pct` | 実数 | 投手: `(SO - BB) / BF × 100` |
| 31 | QS率 | `qs_rate` | 実数 | `QS先発数 / 先発登板数 × 100` |
| 32 | HQS率 | `hqs_rate` | 実数 | `HQS先発数 / 先発登板数 × 100` |

**計算が必要な指標**: OPS, 打率, 出塁率, 長打率, 得点圏打率, IsoD, IsoP, BB%, K%, 防御率, 先発防御率, 救援防御率, 被打率, BB%（投）, K%（投）, K-BB%, QS率, HQS率, 勝率, ゲーム差, 単打。

**既存ロジックの再利用**:

- 打撃率・派生: `lib/yahooGame/canonicalBattingSeasonAgg.ts` / `merge_player_profile.ts` の `computeBattingTotal` 相当
- 投手率・QS/HQS: `lib/yahooGame/canonicalPitchingSeasonAgg.ts` の `PitchingSeasonAggYahoo`（先発/救援の区別あり）
- 得点圏: `canonicalBattingSeasonAgg` の `risp_ab` / `risp_h`
- 球団略称・リーグ: `rosterTeamToRankingShort` / `leagueBucketForTeamShort`

---

## 3. データレイヤと R2 方針

[`plan_display_data_r2_unified_phases.md`](plan_display_data_r2_unified_phases.md) の **3 原則**に従う。順位表 JSON は **表示層**に属し、本番 SSOT は **R2 のみ**。

```
【工場層】Git / ローカル（Vercel に載せない）
  _data/scraped_games/canonical/
  _data/derived/team_standings/{year}/{CL|PL}.json   ← 中間・検証用

【表示層・ローカル出力】Git 追跡しない
  public/data/standings/{year}/{CL|PL}.json          ← phase29 の書き出し先

【表示層・本番 SSOT】Cloudflare R2
  data/standings/{year}/{CL|PL}.json

【ブラウザ】Vercel プロキシ経由（ランキングと同型）
  /data/standings/{year}/{CL|PL}.json
    → app/data/[...path]/route.ts
    → RANKINGS_BASE_URL/data/standings/...
```

### 3.1 パス対応表（確定）

| レイヤ | パス |
|--------|------|
| 工場（派生） | `_data/derived/team_standings/{year}/{CL\|PL}.json` |
| ローカル（表示用） | `public/data/standings/{year}/{CL\|PL}.json` |
| R2 オブジェクトキー | `data/standings/{year}/{CL\|PL}.json` |
| ブラウザ | `/data/standings/{year}/{CL\|PL}.json` |
| R2 直 URL | `{RANKINGS_BASE_URL}/data/standings/{year}/{CL\|PL}.json` |

**`.gitignore`**: `public/data/standings/` を追加（`rankings/`・`top-leaders/` と同様）。

### 3.2 更新フロー（確定）

```
canonical 更新
  → phase29:build:standings（rankings:rebuild に含む）
  → public/data/standings/ に JSON 出力
  → display:r2:upload（または display:r2:upload:2026）
  → R2 data/standings/ 全置換
```

- **コード deploy（git push）だけでは数字は変わらない**。R2 アップロードが必須。
- 日次: `pipeline:sync:2026` または `display:refresh:2026` の末尾で R2 反映。
- 手動反映: `npm run display:r2:upload:2026`（確認: `display:r2:upload:2026:dry`）。

### 3.3 年度別データ源

| 年度 | 集計入力 | 勝敗の算出 |
|------|----------|------------|
| **2026** | `_data/scraped_games/canonical/*.json` | 出場成績 HTML の **「計」列**（`raw_sportsnavi_stats`）。`getGameScoreSides` |
| **2025 以前** | `_data/master_csv_calculated/batting_{year}_{CL\|PL}_from_master.csv` ＋ `pitching_...` | canonical がある年度のみ勝敗付与。それ以外は成績列のみ |

**2026 の試合数**: 順位表の `g === w + l + t`。`team-games.json` はリーグフィルタなしの別集計のため、スコア未取得試合があると `g` とずれる場合あり。

**交流戦**: v1 から **各リーグ順位表に含める**（CL 表＝CL 球団の全試合＝内戦＋対パ交流。PL 表も同様）。オープン戦・キャンプは対象外。

---

## 4. JSON スキーマ

**ファイル単位（ルート）**:

```json
{
  "schemaVersion": 1,
  "year": "2026",
  "league": "CL",
  "source": "canonical",
  "generatedAt": "2026-05-30T12:00:00.000Z",
  "rows": [ /* TeamStandingRow[] */ ]
}
```

**1 球団（`rows[]` 要素）**:

```json
{
  "rank": 1,
  "team": "H",
  "teamName": "阪神タイガース",
  "g": 37,
  "w": 22,
  "l": 14,
  "t": 1,
  "pct": 0.611,
  "gb": "—",
  "runs": 156,
  "ops": 0.785,
  "avg": 0.260,
  "hr": 30,
  "h": 320,
  "singles": 200,
  "doubles": 55,
  "triples": 5,
  "obp": 0.330,
  "slg": 0.455,
  "risp_avg": 0.248,
  "isod": 0.070,
  "isop": 0.195,
  "bb_pct": 9.8,
  "k_pct": 20.5,
  "era": 3.31,
  "era_starter": 3.45,
  "era_relief": 3.12,
  "avg_allowed": 0.245,
  "cg": 2,
  "bb_pct_pitch": 7.5,
  "k_pct_pitch": 22.8,
  "k_bb_pct": 15.3,
  "qs_rate": 55.0,
  "hqs_rate": 30.0
}
```

---

## 5. Phase 設計（自然数のみ）

### Phase 0 — 要件固定 ✅ 完了（2026-05-30）

**成果物**:

- [`docs/plan_team_standings_phase0_spec.md`](plan_team_standings_phase0_spec.md)（指標・パス・R2・計算ルール・確認 URL）
- `lib/standings/types.ts` · `metricColumns.ts` · `paths.ts`
- `.gitignore` に `public/data/standings/`
- `docs/DATA_PATHS.md` に順位表パス追記

**Phase 0 で固定する計算ルール**（詳細は Phase 0 確定書 §5）

| 項目 | 決定 |
|------|------|
| 勝敗 | 出場成績 HTML `#ing_brd` の **「計」列**（`getGameScoreSides`）。多い方が勝ち、少ない方が負け、同点は引分 |
| 中止試合 | `isCancelledCanonicalGame` は **勝敗・試合数に含めない** |
| 未消化試合 | `isFutureOrTodayGameYmd` は **含めない** |
| ゲーム差 | 同リーグ内。首位: `—`。2 位以降: `(首位勝 - 自チーム勝 + 自チーム負 - 首位負) / 2`（v1 簡易式） |
| 順位ソート | 勝率降順 → 勝数降順 → チームコード昇順 |
| 打撃合算 | plateAppearances 優先、無ければ battingLines を球団別合算 |
| 投手合算 | pitchingLines を球団別合算。先発/救援は `canonicalPitchingSeasonAgg` と同一判定 |
| QS / HQS | `qsStarts` / `gamesStarted` 等 |

---

### Phase 1 — 集計ライブラリ ✅ 完了（2026-05-30）

**目的**: canonical から **1 リーグ×1 年度**の順位表行配列を返す純関数を用意する。

**成果物**:

- `lib/standings/aggregateTeamStandingsFromCanonical.ts`
- `lib/standings/computeTeamStandingsMetrics.ts`
- `lib/standings/leagueGameFilter.ts`
- `lib/standings/teamCodes.ts`
- `lib/standings/sportsnaviStatsScoreboard.ts`
- `lib/yahooGame/parseYahooScorePageScoreboard.ts`
- `scripts/smoke_team_standings_phase1.ts`
- `updateRispFromPasInGame` export（`canonicalBattingSeasonAgg.ts`）

**補足**: 得点・勝敗は **出場成績 HTML の「計」列**（`#ing_brd`）。canonical の空 `scoreboard` や打者 R 合算は使わない。交流戦は `isLeagueStandingsGame` で含め、当該リーグ bucket のみ `applyGameResult` 更新。

**完了条件**:

- 2026 CL/PL 各 6 行が生成できる
- `g === w + l + t`
- 交流戦込みで公式に近い試合数（例: 5/29 時点で各球団おおむね 51 試合程度）

---

### Phase 2 — ビルドスクリプト（工場 Phase 29）

**目的**: Phase 1 を CLI 化し、工場派生と **表示用ローカル出力**を書き出す。

**新規（案）**:

- `scripts/phase29_build_team_standings.ts`
- npm: `phase29:build:standings`（`--year 2026`）

**出力**:

1. `_data/derived/team_standings/{year}/{CL\|PL}.json`
2. `public/data/standings/{year}/{CL\|PL}.json`（R2 アップロード元）

**完了条件**:

- `npm run phase29:build:standings -- --year 2026` が完走
- §4 スキーマに沿う

---

### Phase 3 — 過去年度の再生成（マスタ CSV）

**目的**: トップ年度セレクタで **2025 以前**も順位表を表示できるようにする。

**入力**: `_data/master_csv_calculated/batting_{year}_{CL\|PL}_from_master.csv` ＋ `pitching_...`

**出力**: 同上 `public/data/standings/{year}/...`（歴史年度分）

**R2**: Phase 7 で `--year` 指定または全年度アップロード時に `data/standings/{year}/` へ反映。

**完了条件**: 少なくとも **2024・2025** の CL/PL JSON がローカル生成できる

---

### Phase 4 — 工場パイプラインへの組み込み ✅ 完了（2026-06-14）

**目的**: canonical 更新のたびに順位表 JSON を **ローカル再生成**する。

**変更箇所**:

| 対象 | 変更 | 状態 |
|------|------|------|
| `package.json` | `rankings:rebuild` に `phase29:build:standings` | ✅ |
| `package.json` | `display:build:2026` に同様 | ✅ |
| `scripts/run_daily_npb_pipeline.mjs` | Phase28 直後に Phase29 を追加 | ✅（[`plan_team_standings_pipeline_refresh_phases.md`](plan_team_standings_pipeline_refresh_phases.md) Phase 2） |
| `docs/data_operation_rules.md` | 日次一括の成果物に Phase 29 を追記 | ✅（同 Phase 3） |
| `docs/DATA_PATHS.md` | `public/data/standings/`・R2 `data/standings/` を追記 | ✅ |
| `docs/plan_full_pipeline_from_games_to_pages_and_rankings.md` | 日次一括に Phase 29 を追記 | ✅ |
| `docs/plan_display_data_r2_unified_phases.md` §表示用データ一覧 | `standings` 行を追加 | 未（任意） |

**完了条件**:

- `npm run rankings:rebuild` で `public/data/standings/2026/` が更新される ✅
- `npm run daily:npb-pipeline`（派生ブロック）でも Phase 29 が実行され、`public/data/standings/2026/` が更新される ✅
- 本番反映は **`display:refresh:2026`** / **`pipeline:sync:2026`** で R2 に載せる（`daily:npb-pipeline` 単体では R2 未更新）

---

### Phase 5 — UI（Quiz → 順位表）

**目的**: トップ第5タブで **セ・リーグ順位表 → パ・リーグ順位表**を表示する。

**変更箇所（案）**:

| ファイル | 変更 |
|----------|------|
| `app/components/top/topPageConstants.ts` | `mainTabs[4]` を `順位表` / `standings_tab` |
| `app/components/top/TopPageClient.tsx` | `TopPageStandingsTab` を表示 |
| `app/components/top/TopPageStandingsTab.tsx`（新規） | CL / PL の 2 セクション |
| `lib/standings/fetchStandingsJson.ts`（新規） | `/data/standings/{year}/{league}.json` を fetch |

**データ取得（R2 経由）**:

- クライアント: **`/data/standings/{year}/{CL\|PL}.json`**（Vercel プロキシ → R2）
- ローカル dev: `RANKINGS_PREFER_LOCAL=1` 時は `public/data/standings/` を優先（既存 proxy と同型）
- サーバー先読みが必要な場合: `lib/topPage/fetchTopLeadersSnapshotRemote.ts` と同パターンで R2 直 fetch 可

**UI 方針（暫定）**:

- 見出し: 個人ページ H2 形式（左 **リーグ色** 縦バー）
- 表: 黄ヘッダー・枠 `#555`・`tabular-nums`
- 球団列: `RankingUI` 同型の **縦カラーバー**（`teamColors`）
- 横スクロール + 球団列 sticky

**完了条件**:

- 本番 `/2026` の「順位表」タブで CL・PL が表示される（**R2 に JSON があること**が前提）
- ローカル dev でも `phase29` 生成後に表示できる

---

### Phase 6 — 検証・整合

**目的**: 数値の信頼性と R2 配信の確認。

**新規（案）**:

- `scripts/validate_team_standings_2026.ts`
- `npm run validate:team-standings:2026`

**検証項目**:

| # | 内容 |
|---|------|
| 1 | 各球団 `g === w + l + t` |
| 2 | （参考）`team-games.json` との差分 — リーグフィルタ・スコア未取得試合で `g` がずれる場合あり |
| 3 | リーグ 6 球団の勝敗合計と §5.2 試合集合の関係（交流戦込み） |
| 4 | （任意）スポナビ順位表との勝敗突合 |
| 5 | OPS・ERA 等のスポットチェック |
| 6 | **R2**: `{RANKINGS_BASE_URL}/data/standings/2026/CL.json` が **200** |
| 7 | **本番**: `/data/standings/2026/CL.json` が **200**（プロキシ経由） |

**完了条件**: 上記スクリプトが通る。R2 未反映時は Phase 7 を先に実行した旨がログに出る

---

### Phase 7 — R2 配信への組み込み

**目的**: 順位表 JSON を **ランキング・トップリーダーと同じ R2 バケット**に載せ、本番表示の SSOT にする。

**変更箇所（案）**:

| 対象 | 変更内容 |
|------|----------|
| `.gitignore` | `public/data/standings/` を追加 |
| `scripts/display_r2_upload.mjs` | `UPLOADS` に `{ local: 'public/data/standings', keyPrefix: 'data/standings' }` を追加。`--year` フィルタに `rel.startsWith(\`${y}/\`)` を追加 |
| `lib/displayData/proxy.ts` | `DisplayDataKind` に `'standings'` を追加 |
| `app/data/[...path]/route.ts` | `KINDS` に `'standings'` を追加 |
| `docs/phase2_r2_display_spec.md` | クイックリファレンスに `public/data/standings/` → `data/standings/` を追記 |
| `docs/plan_display_data_r2_unified_phases.md` | §表示用データ一覧・Phase 1 代表 URL に順位表を追記 |
| `scripts/verify_production_display_2026.mjs` | `/data/standings/2026/CL.json` の 200 確認を追加（任意） |

**npm スクリプト（既存をそのまま利用）**:

| コマンド | 用途 |
|----------|------|
| `npm run display:r2:upload:2026` | 2026 の rankings + top-leaders + **standings** を R2 へ |
| `npm run display:r2:upload:2026:dry` | ドライラン（キー一覧確認） |
| `npm run display:refresh:2026` | `rankings:rebuild` → R2 アップロード（日次向け） |
| `npm run display:publish:2026` | 表示 JSON 生成 + R2 全反映 |
| `npm run pipeline:sync:2026` | 日次一括 + `display:publish:2026` |

**R2 初回反映手順**:

```powershell
npm run phase29:build:standings -- --year 2026
npm run display:r2:upload:2026
# 確認
curl "%RANKINGS_BASE_URL%/data/standings/2026/CL.json"
```

**完了条件**:

- R2 に `data/standings/2026/CL.json` と `PL.json` が存在
- 本番 `/data/standings/2026/CL.json` が 200
- `display:refresh:2026` / `pipeline:sync:2026` の末尾で standings も自動アップロードされる

---

## 6. 完了の定義（Definition of Done）

1. **Phase 29** により 2026 CL/PL の順位表 JSON が `public/data/standings/` に生成される
2. **`rankings:rebuild`** に Phase 29 が含まれる
3. **R2** に `data/standings/2026/{CL\|PL}.json` が載り、本番 `/data/standings/...` で 200
4. **`pipeline:sync:2026`**（または日次運用）で canonical 更新 → 再生成 → R2 反映まで一連で回る
5. トップ **「順位表」タブ**で CL・PL の表が §2 の指標順で表示される
6. **球団帯カラー**が球団列に付く
7. **Phase 6** の検証が通る

---

## 7. リスク・注意点

| リスク | 対策 |
|--------|------|
| R2 未アップロードで本番が空 | Phase 7 完了前はタブに「データ準備中」を表示。`display:r2:upload:2026` を運用チェックリストに追加 |
| Redeploy だけで数字が更新されない | [`plan_display_data_r2_unified_phases.md`](plan_display_data_r2_unified_phases.md) 原則 3 を順位表にも適用 |
| canonical の `scoreboard` が空 | 得点・勝敗は **出場成績 raw** の「計」列。空 scoreboard でも `raw_sportsnavi_stats` があれば集計可 |
| 交流戦の二重計上 | `isLeagueStandingsGame` ＋ `applyGameResult` は当該リーグ bucket のみ更新 |
| 先発/救援の判定ずれ | 個人ページ投手集計と同一関数 |
| 得点圏打率の母数不足 | `risp_ab === 0` のとき `—` |
| 過去年度に勝敗列が無い | 成績のみ表示 |
| 列数が多くモバイルで見づらい | v1 は横スクロール |

---

## 8. 主要参照ファイル

| 用途 | パス |
|------|------|
| R2 計画（親） | `docs/plan_display_data_r2_unified_phases.md` |
| R2 キー規則 | `docs/phase2_r2_display_spec.md` |
| R2 アップロード | `scripts/display_r2_upload.mjs` |
| 表示プロキシ | `app/data/[...path]/route.ts`, `lib/displayData/proxy.ts` |
| 球団別試合数 | `lib/yahooGame/aggregateTeamGamesFromCanonical.ts`（**順位表 `g` とは別集計**。§3.3） |
| 順位表集計 | `lib/standings/aggregateTeamStandingsFromCanonical.ts`, `leagueGameFilter.ts`, `sportsnaviStatsScoreboard.ts` |
| 得点パース | `lib/yahooGame/parseYahooScorePageScoreboard.ts` |
| 打撃集計 | `lib/yahooGame/canonicalBattingSeasonAgg.ts` |
| 投手集計 | `lib/yahooGame/canonicalPitchingSeasonAgg.ts` |
| 球団カラー | `app/components/top/topPageConstants.ts` → `teamColors` |
| 表 UI 参考 | `components/RankingUI.tsx`, `app/components/SeasonStatsPilot.tsx` |
| 運用 | `docs/data_operation_rules.md` |

---

## 9. 改訂履歴

| 日付 | 内容 |
|------|------|
| 2026-05-30 | 初版作成（指標確定・Phase 0〜6） |
| 2026-05-30 | **R2 一本化を反映**（§3 データレイヤ、Phase 7 追加、本番 SSOT を R2 に固定） |
| 2026-05-30 | **Phase 1 実行**（集計ライブラリ・smoke スクリプト） |
| 2026-05-31 | §3.3 交流戦を各リーグ順位に含める。得点は出場成績「計」列（`raw_sportsnavi_stats`）。§Phase 0/6/7 リスク表を同期 |
| 2026-06-14 | **Phase 4 完了**（日次一括 `run_daily_npb_pipeline.mjs` への Phase 29 組込。詳細: `plan_team_standings_pipeline_refresh_phases.md`） |