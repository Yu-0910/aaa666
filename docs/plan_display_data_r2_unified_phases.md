# 表示用データ R2 一本化 — Phase 計画書

**目的**: サイトがユーザーに見せる **表示用 JSON** の保管場所と読み取り経路を **Cloudflare R2 に一本化**し、Vercel には **アプリ（コード）のみ** を載せる。

**関連ドキュメント**:
- 工場パイプライン（一括取得）: [`docs/data_operation_rules.md`](data_operation_rules.md)
- ランキング JSON 生成: [`docs/DATA_PATHS.md`](DATA_PATHS.md)
- R2 初回移行（歴史年度）: [`docs/rankings_full_externalization_plan.md`](rankings_full_externalization_plan.md)
- R2 + Vercel 設定: [`docs/cloudflare_r2_vercel_setup_plan.md`](cloudflare_r2_vercel_setup_plan.md)

**番号のルール**: 本計画の Phase は **1, 2, 3, … の自然数のみ**。実行順 = 番号順。  
工場パイプラインの Phase 12 / 19 / 28 や `phase0:sportsnavi:schedule` は **別系統**（本文末の付録参照）。

---

## ゴール

| # | ゴール |
|---|--------|
| G1 | **表示用データの SSOT は R2 のみ**（本番）。ローカル `public/data/...` は工場の出力先。 |
| G2 | **読み取り経路は 1 本**: **`/data/...` → Vercel プロキシ → R2** |
| G3 | **日次一括取得**の末尾に **R2 反映**を必ず含める |
| G4 | **1950–2025 の歴史ランキング**も同じ R2 ルールで配信 |
| G5 | **工場層**（`_data/...`）は本計画の対象外（付録） |

---

## 確定方針（3 原則）

### 原則 1 — レイヤーを分ける

```
【工場層】Git / ローカル（Vercel に載せない）
  _data/scraped_games/canonical/
  _data/derived/player_season_*/

【表示層】R2 のみ（本番 SSOT）
  data/rankings/...
  data/top-leaders/...
```

### 原則 2 — パスは真実

| 場所 | 例 |
|------|-----|
| ローカル | `public/data/rankings/2026/CL/OPS.json` |
| R2 キー | `data/rankings/2026/CL/OPS.json` |
| ブラウザ | `/data/rankings/2026/CL/OPS.json` |

### 原則 3 — 更新は「生成 → 全置換アップロード」

- **初回・シーズン初**: Phase 3〜5 でローカル生成 → Phase 5 で R2 全置換  
- **日次**: 工場 + `rankings:rebuild` → **Phase 9** で R2 全置換  
- **コードの deploy** と **R2 更新** は別作業（Redeploy だけでは数字は変わらない）

---

## 表示用データの一覧（R2 に載せるもの）

| 区分 | ローカル | R2 キー先頭 | 工場での生成（別番号） |
|------|----------|-------------|------------------------|
| 打撃ランキング | `public/data/rankings/{年}/` | `data/rankings/` | 工場 Phase 12 / CSV 系 |
| 投手ランキング | `public/data/rankings/pitching/` | `data/rankings/pitching/` | 工場 Phase 19 |
| 週間 | `public/data/rankings/weekly/` | `data/rankings/weekly/` | 工場 Phase 28 |
| トップ今季 | `public/data/top-leaders/` | `data/top-leaders/` | `top-leaders:build:2026` |
| トップ今週 | `public/data/top-leaders/weekly/` | `data/top-leaders/weekly/` | `top-weekly-leaders:build:2026` |

`.gitignore`: `public/data/rankings/`、`public/data/top-leaders/` → **本番の正は R2**。

---

## 読み取り経路（現状 → 目標）

| 利用箇所 | 現状 | 目標（Phase 6〜7 後） |
|----------|------|------------------------|
| ランキングページ | `/data/rankings/...` → プロキシ → R2 ✅ | 変更なし |
| トップ | `/data/top-leaders/...` 静的のみ | **Phase 6** で同一プロキシ |
| `/api/leaders` | 本番で `fs` → 空 | **Phase 7** で fetch |
| 個人ページ | `_data/derived` | **付録**（別計画） |

---

## 実行順 Phase 一覧

**上から順に消化する。** 完了した Phase に ✅ を付ける。

| Phase | 名称 | 状態の目安 |
|-------|------|------------|
| **1** | 棚卸し・代表 URL 固定 | ✅ 実施済み（[`display_data_r2_phase1_inventory.md`](display_data_r2_phase1_inventory.md)） |
| **2** | キー規則と環境変数の確定 | ✅ 文書済み（[`phase2_r2_display_spec.md`](phase2_r2_display_spec.md)）。Vercel **Production** 登録を確認 |
| **3** | ローカル表示 JSON 生成（2026） | `public/data/rankings/2026/` 等が存在 |
| **4** | ローカル表示 JSON 生成（歴史年度） | 未生成年度のみ。既に揃っていればスキップ可 |
| **5** | R2 初回全アップロード | R2 に `data/rankings/2026/`・`data/top-leaders/2026/` が存在 |
| **6** | プロキシ一本化（`top-leaders` 含む） | 本番 `/data/top-leaders/2026/CL/batting.json` が 200 |
| **7** | サーバー側表示用 `fs` 廃止 | `/api/leaders/2026/CL` が空でない |
| **8** | 本番検証・ロールバック | Phase 1 の代表 URL が本番で 200 |
| **9** | 日次パイプラインへ R2 反映を組み込み | `daily:npb-pipeline` 末尾で自動アップロード |
| **10** | 運用チェックリストの定着 | デプロイ・日次・障害時の習慣化 |

---

## Phase 1 — 棚卸し・代表 URL 固定

**目的**: 障害時に「どの URL を見るか」を固定する。

### 本番確認用 URL（2026）

| 確認項目 | パス |
|----------|------|
| 打撃ランキング JSON | `/data/rankings/2026/CL/OPS.json` |
| 投手ランキング JSON | `/data/rankings/pitching/2026/CL/防御率.json` |
| トップ今季 | `/data/top-leaders/2026/CL/batting.json` |
| 週間メタ | `/data/rankings/weekly/2026/current-week.json` |
| ランキングページ | `/ranking/2026/PL` |
| トップ | `/2026` |

### 歴史年度（代表）

| 年度 | パス例 |
|------|--------|
| 2025 | `/data/rankings/2025/PL/OPS.json` |
| 1975 | `/data/rankings/1975/PL/OPS.json` |

**成果物**: 上記 URL の一覧と、ローカル / R2 / 本番の確認結果。  
**再実行**: `npm run display:r2:phase1`（旧 `display:r2:phase0` と同スクリプト）

**実施記録**: [`display_data_r2_phase1_inventory.md`](display_data_r2_phase1_inventory.md)

---

## Phase 2 — キー規則と環境変数の確定

**目的**: アップロード先と Vercel 設定のブレをなくす。

**詳細（確定版）**: [`phase2_r2_display_spec.md`](phase2_r2_display_spec.md)

### やること

1. R2 キー: `public/data/rankings/**` → `data/rankings/**`（`public/` なし）
2. Vercel **Production** に `RANKINGS_BASE_URL` を設定（末尾 `/` なし）
3. 本番では `RANKINGS_EXTERNALIZE_SCOPE`・`RANKINGS_PREFER_LOCAL` は **付けない**

**成果物**: Production に env があり、計画書と矛盾がないこと。

---

## Phase 3 — ローカル表示 JSON 生成（2026）

**目的**: R2 に載せる **2026 の元ファイル** を PC 上に用意する。

```powershell
npm run rankings:rebuild
```

確認:

```powershell
Test-Path "public\data\rankings\2026\CL\OPS.json"
Test-Path "public\data\top-leaders\2026\CL\batting.json"
```

**依存**: 工場データ（canonical 等）が最新であること。  
**成果物**: 上記パスが存在する。

---

## Phase 4 — ローカル表示 JSON 生成（歴史年度）

**目的**: 1950–2025 のランキング JSON をローカルに揃える（未作成の年度のみ）。

```powershell
py scripts/compute_metrics_all_seasons.py --max-year 2024
py scripts/build_rankings_from_calculated.py --max-year 2024
# 2025 は DATA_PATHS.md 参照
```

**スキップ可**: Phase 1 棚卸しでローカルに既に 15,000 件超ある場合。  
**成果物**: 必要年度の `public/data/rankings/{年}/...` が存在する。

---

## Phase 5 — R2 初回全アップロード

**目的**: 本番が参照する **表示用データを R2 に一度載せる**（いまのボトルネック）。

1. ローカル `public/data/rankings/` → R2 `data/rankings/`（全置換）
2. ローカル `public/data/top-leaders/` → R2 `data/top-leaders/`（全置換）

**コマンド**: `npm run display:r2:upload`（確認のみ: `npm run display:r2:upload:dry`）。要 `.env.local` の R2 API トークン → 手順 [`phase5_r2_upload_setup.md`](phase5_r2_upload_setup.md)

**完了定義**:

- R2 直: `{RANKINGS_BASE_URL}/data/rankings/2026/CL/OPS.json` が **200**
- Phase 1 の代表 URL が本番でも **200**（Phase 2 の env 済みが前提）

**依存**: Phase 2（キー・URL）、Phase 3（2026 最低限）。Phase 6〜7 の前でも **データだけ先に載せて確認可**。

---

## Phase 6 — プロキシ一本化（`/data/*` → R2）

**目的**: `top-leaders` もランキングと同じプロキシで配信する。

1. `app/data/[...path]/route.ts` に統合（`rankings` / `top-leaders`）
2. `getExternalRankingsUrl` を一般化（`data/rankings/...` と `data/top-leaders/...`）
3. キャッシュ: `max-age=300, stale-while-revalidate=600`

**完了定義**: 本番 `/data/top-leaders/2026/CL/batting.json` が **200**（Phase 5 後）。

**依存**: Phase 5。

---

## Phase 7 — サーバー側表示用 `fs` 廃止

**目的**: R2 にデータがあっても API・SSR が空になる問題を解消。

| モジュール | 変更 |
|------------|------|
| `lib/ranking/leadersFromRankingsJson.ts` 等 | サーバーは `fetch('/data/rankings/...')` |
| `lib/topPage/leadersSnapshot2026.ts` 等 | `fetch('/data/top-leaders/...')` |

**完了定義**: 本番 `/api/leaders/2026/CL` の `leaders` が空でない。

**依存**: Phase 6。

---

## Phase 8 — 本番検証・ロールバック

**目的**: 表示層が R2 参照で動いていることを確認する。

1. Phase 2 の env が **Production** にあること
2. コード（Phase 6〜7）が `main` にあり Vercel **Ready**
3. Phase 1 の代表 URL を **本番ドメイン**で確認（シークレットウィンドウ推奨）
4. `/2026`・`/ranking/2026/PL` で **2026 の成績**（2025 が混ざらないこと）

### ロールバック

| 障害 | 対処 |
|------|------|
| 表示だけおかしい | R2 をバックアップから復元 → Phase 5 を再実行 |
| コード不具合 | Vercel を前 commit に redeploy |
| データだけ古い | Phase 5 または Phase 9 のアップロードを再実行（Redeploy 不要） |

**依存**: Phase 2, 5, 6, 7。

---

## Phase 9 — 日次パイプラインへ R2 反映を組み込み

**目的**: `daily:npb-pipeline` の **最後に必ず R2 へ反映**する。

### 日次の流れ（本計画 Phase 9 内）

| 順 | 内容 |
|----|------|
| 1 | 表示 JSON の存在チェック（`rankings/2026/CL/OPS.json` 等） |
| 2 | R2 全置換アップロード（`data/rankings/**` + `data/top-leaders/**`） |
| 3 | 本番スモーク（任意・代表 URL 3 本が 200） |

### 推奨コマンド

```powershell
npm run daily:npb-pipeline
npm run display:r2:upload
```

`rankings:rebuild` は `daily:npb-pipeline` の finalize に含まれる想定。含まれない運用では手動で `rankings:rebuild` → `display:r2:upload`。

### 頻度

| 頻度 | やること |
|------|----------|
| 毎日 | `daily:npb-pipeline` → Phase 9 の 2（アップロード） |
| シーズン初 | `daily:npb-pipeline:complete` → Phase 5 相当の全量 → Phase 8 で代表年確認 |
| 歴史年度のみ | Phase 4 → Phase 5（rankings のみでも可） |

**依存**: Phase 5 初回済み、Phase 6〜7 デプロイ済み（本番表示まで一気通貫なら Phase 8 と同時確認）。

---

## Phase 10 — 運用チェックリストの定着

### デプロイ時（コード push）

- [ ] 変更は **コードだけ**か **R2 も更新**かを明示したか
- [ ] `git add .` で `_data/` を入れていないか
- [ ] Vercel の Deployment が **Ready** か

### データ更新時

- [ ] `daily:npb-pipeline`（または `rankings:rebuild`）まで完了したか
- [ ] **Phase 9** のアップロードまで完了したか
- [ ] `/data/rankings/2026/CL/OPS.json` が 200 か

### 「表示が空」「2025 が混ざる」とき

1. `/data/rankings/2026/CL/OPS.json` は 200 か 404 か
2. `RANKINGS_BASE_URL` は **Production** か
3. Phase 5 / 9 のアップロードをしたか（Redeploy だけでは直らない）

---

## 付録 A — 工場層（本計画の Phase ではない）

| データ | 用途 |
|--------|------|
| `_data/scraped_games/canonical/` | 集計入力 |
| `_data/derived/player_season_*` | 個人ページ・API |
| `_data/master_csv*` | 歴史・英字名（`.vercelignore` 推奨） |

個人ページまで本番で揃える場合は [`plan_unified_ranking_personal_stats_phases.md`](plan_unified_ranking_personal_stats_phases.md) を参照。

---

## 付録 B — 工場 Phase 番号との対応（別系統）

| 会話 | 工場（生成） | 本計画（表示・R2） |
|------|-------------|-------------------|
| 一括取得 | `daily:npb-pipeline` | Phase 9 の前提 |
| ランキング再生成 | 工場 Phase 12 + 19 + 28 | Phase 3 の中身 |
| トップ切り出し | `top-leaders:build:2026` | Phase 3 → Phase 5 / 9 |
| 本番へ反映 | — | **Phase 5**（初回）、**Phase 9**（日次） |
| 日程取得 | `phase0:sportsnavi:schedule` | **無関係**（工場のみ） |

---

## 旧番号からの対応表（移行用）

| 旧 | 新 |
|----|-----|
| Phase 0 | **Phase 1** |
| Phase 1 | **Phase 2** |
| Phase 4-A | **Phase 3** |
| Phase 4-B | **Phase 4** |
| Phase 4-C | **Phase 5** |
| Phase 2 | **Phase 6** |
| Phase 3 | **Phase 7** |
| Phase 6 | **Phase 8** |
| Phase 5 / 5a・5b・5c | **Phase 9**（内部 1〜3） |
| Phase 7 | **Phase 10** |
| Phase 8（別枠） | **付録 A** |

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-05-22 | 初版 |
| 2026-05-22 | Phase を実行順の自然数 1〜10 に再編。4-A/B/C・5a/b/c を廃止。工場層は付録 A に分離。 |
