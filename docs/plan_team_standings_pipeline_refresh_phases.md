# 順位表更新 — 再生成・一括取得スクリプト組込 計画書（Phase 別）

**Phase の数:** **5 段階（Phase 0〜4）**。順位表の集計・UI・R2 配信は親計画 [`plan_team_standings_phases.md`](plan_team_standings_phases.md)（工場 **Phase 29**）で実装済み。本書は **「順位表が更新されていない」** という運用上のギャップを、**再生成スクリプトと一括取得パイプラインの組込**で解消するための計画書である。

## 文書の位置づけ

| 用途 | 内容 |
|------|------|
| **初回** | Phase 0〜4 の実施順と完了条件 |
| **継続運用** | canonical 更新後に順位表 JSON が追従するまでのコマンド・確認手順 |
| **オンボーディング** | 順位表データの生成 → R2 反映 → UI 表示の流れ |

**改訂時は文末の改訂履歴を更新する。**

---

## 1. 背景と目的

### 1.1 問題

トップページ **「順位表」タブ**（`TopPageStandingsTab`）の勝敗・率指標が **最新試合分まで反映されていない**。

UI・API 経路・工場 Phase 29 ビルドスクリプト・R2 アップロード設定は **既に存在する** が、**日次一括パイプライン**（`scripts/run_daily_npb_pipeline.mjs`）の末尾で **Phase 29 が実行されていない**。その結果、運用で `daily:npb-pipeline` だけ回した場合、ランキング・トップリーダーは更新されても **順位表 JSON は古いまま** になる。

### 1.2 用語

| 用語 | 意味 |
|------|------|
| **Phase 29** | `scripts/phase29_build_team_standings.ts` — canonical から CL/PL 順位表 JSON を生成する工場派生 |
| **表示用 JSON** | `public/data/standings/{year}/{CL\|PL}.json`（Git 外・R2 アップロード元） |
| **工場派生** | `_data/derived/team_standings/{year}/{CL\|PL}.json` |
| **本番 SSOT** | R2 オブジェクト `data/standings/{year}/{CL\|PL}.json` → ブラウザ `/data/standings/...` |
| **一括取得** | `npm run daily:npb-pipeline` / `pipeline:daily:2026`（`run_daily_npb_pipeline.mjs`） |
| **表示反映** | `display:r2:upload:2026` / `display:publish:2026` / `pipeline:sync:2026` |

### 1.3 成功条件（本計画の Definition of Done）

1. **`npm run daily:npb-pipeline`**（および `--derive-only` / `--finalize-only` の派生ブロック）実行後、`public/data/standings/2026/` の **`generatedAt` が更新** される。
2. 日次パイプライン末尾の実行順が **`rankings:rebuild` と一致** する（Phase 29 を含む）。
3. **`docs/data_operation_rules.md`** に順位表（Phase 29）の位置づけが追記され、運用 SSOT として参照できる。
4. **`npm run pipeline:sync:2026`** または **`display:refresh:2026`** 実行後、本番 `/data/standings/2026/CL.json` の **`generatedAt` がローカルと一致** する（R2 反映）。
5. トップ **「順位表」タブ**で最新の勝敗が表示される。

### 1.4 スコープ

| 本計画でやる | 本計画でやらない |
|-------------|-----------------|
| 日次一括パイプラインへの Phase 29 組込 | 順位表集計ロジックの変更（親計画 Phase 1） |
| 運用ドキュメントの整合 | 過去年度マスタ CSV 再生成（親計画 Phase 3） |
| 即時復旧手順の明文化 | UI デザイン変更（親計画 Phase 5 完了済） |
| 検証・本番確認手順 | 新指標列の追加 |

---

## 2. 現状整理（ギャップ）

### 2.1 実装済み（変更不要）

| 項目 | パス / コマンド |
|------|----------------|
| 集計ライブラリ | `lib/standings/aggregateTeamStandingsFromCanonical.ts` 他 |
| ビルド | `npm run phase29:build:standings -- --year 2026` |
| UI | `app/components/top/TopPageStandingsTab.tsx` |
| 取得 | `lib/standings/fetchStandingsJson.ts` → `/data/standings/{year}/{league}.json` |
| R2 アップロード | `scripts/display_r2_upload.mjs`（`public/data/standings` → `data/standings`） |
| `rankings:rebuild` | Phase12 → Phase19 → Phase28 → **Phase29** → top-leaders → top-weekly-leaders ✅ |
| `display:build:2026` | Phase12 → Phase28 → **Phase29** → top-leaders → top-weekly-leaders ✅ |
| `display:refresh:2026` | `rankings:rebuild` → R2 アップロード ✅ |
| `pipeline:sync:2026` | 日次一括 + `display:publish:2026` ✅ |

### 2.2 ギャップ（本計画の修正対象）

| # | ギャップ | 影響 |
|---|---------|------|
| G1 | **`run_daily_npb_pipeline.mjs` に Phase 29 が無い** | 日次運用で順位表 JSON が再生成されない |
| G2 | ファイル先頭コメントが「`rankings:rebuild` と同順」と記載されているが **実際は Phase 29 欠落** | 誤った運用前提 |
| G3 | **`docs/data_operation_rules.md`** に順位表・Phase 29 の記述が無い | 運用 SSOT から漏れ、再発しやすい |
| G4 | **`docs/plan_full_pipeline_from_games_to_pages_and_rankings.md`** に Phase 29 行が無い | パイプライン全体図と実態不一致 |
| G5 | 日次一括だけでは **R2 に載らない**（ローカル生成のみ） | 本番 UI は古い R2 を参照し続ける |
| G6 | **`validate:team-standings`** 系スクリプト未整備（親計画 Phase 6 未着手） | 再生成後の自動検証が弱い |

### 2.3 実行経路の比較

```
rankings:rebuild:
  phase12 → phase19 → phase28 → phase29 → top-leaders → top-weekly-leaders → validate:canonical-batting-completeness

daily:npb-pipeline（現状・派生ブロック末尾）:
  phase12 → phase19 → phase28 → top-leaders → top-weekly-leaders → validate:canonical-batting-completeness
                              ↑ Phase 29 欠落（G1）

phase3:derived:2026:
  野手・投手個人ページ派生のみ（順位表は対象外 — 意図どおり）
```

> **補足:** 順位表は **トップ表示用 JSON**（`public/data/standings/`）であり、個人ページ派生（`phase3:derived:2026`）とはレイヤが異なる。`phase3:derived:2026` への Phase 29 追加は **不要**。

---

## 3. Phase 設計

### Phase 0 — 現状診断 ✅ 実施前

**目的:** 「更新されていない」の原因が **(A) ローカル未生成** / **(B) R2 未反映** / **(C) キャッシュ** のどれかを切り分ける。

**手順:**

| # | 確認 | コマンド / URL |
|---|------|----------------|
| 1 | ローカル JSON の有無・日時 | `public/data/standings/2026/CL.json` の `generatedAt` |
| 2 | 工場派生 | `_data/derived/team_standings/2026/CL.json` の `generatedAt` |
| 3 | 本番 R2 | `GET /data/standings/2026/CL.json` の `generatedAt` |
| 4 | 直近パイプライン | `_data/logs/pipeline_bulk.log` で phase29 / standings の有無 |
| 5 | 日次コマンド | 運用が `daily:npb-pipeline` のみか、`pipeline:sync:2026` までか |

**判定:**

| パターン | 原因 | 次アクション |
|---------|------|-------------|
| ローカル古い・R2 古い | G1（パイプライン未組込） | Phase 1 → Phase 2 |
| ローカル新・R2 古い | G5（R2 未アップロード） | Phase 1 の R2 反映 |
| ローカル新・R2 新・UI 古い | ブラウザ / CDN キャッシュ | ハードリロード、`fetchJsonCached` 確認 |

**完了条件:** 上記 5 項目を記録し、G1〜G5 の該当を特定した。

---

### Phase 1 — 即時復旧（手動再生成 + R2 反映）

**目的:** 本番表示を **当日中に最新化** する（スクリプト改修前の暫定対応）。

**手順（PowerShell）:**

```powershell
# 1. 順位表 JSON 再生成（canonical 全体から集計）
npm run phase29:build:standings -- --year 2026

# 2-A. 順位表だけ R2 へ（他表示 JSON は触らない）
npm run display:r2:upload:2026

# 2-B. または ランキング・トップ・順位表をまとめて再生成 + R2
npm run display:refresh:2026
```

**確認:**

| # | 内容 |
|---|------|
| 1 | `public/data/standings/2026/CL.json` の `rows[].w` / `rows[].l` が期待値 |
| 2 | `generatedAt` が実行時刻付近 |
| 3 | 本番 `/data/standings/2026/CL.json` が 200、`generatedAt` 一致 |
| 4 | トップ `/2026` → 「順位表」タブで勝敗反映 |

**完了条件:** 本番順位表が最新試合まで反映されている。

---

### Phase 2 — 日次一括パイプラインへの Phase 29 組込 ✅ 完了（2026-06-14）

**目的:** `daily:npb-pipeline` 実行だけで **ローカル順位表 JSON が毎回再生成** されるようにする。

**実施内容:** `scripts/run_daily_npb_pipeline.mjs` の `runDerivedAndRankings` 内、phase28 直後に `phase29:build:standings` を追加。先頭コメントを同期。

**完了条件:** ✅ 上記マージ済み。

---

### Phase 3 — 運用ドキュメント・親計画の整合 ✅ 完了（2026-06-14）

**目的:** 再発防止のため SSOT ドキュメントを実態に合わせる。

**実施内容:**

| ファイル | 状態 |
|----------|------|
| `docs/data_operation_rules.md` | ✅ Phase 29・R2 反映・日次順序を追記 |
| `docs/DATA_PATHS.md` | ✅ 順位表セクション追加 |
| `docs/plan_full_pipeline_from_games_to_pages_and_rankings.md` | ✅ 日次一括に Phase 29 / R2 反映を追記 |
| `docs/plan_team_standings_phases.md` | ✅ Phase 4 完了マーク |

**完了条件:** ✅ 上記マージ済み。

---

### Phase 4 — 検証・本番確認・再発防止 ✅ 完了（2026-06-14）

**目的:** 組込後も数値・配信が正しいことを確認する仕組みを整える。

**実施内容:**

| 成果物 | 内容 | 状態 |
|--------|------|------|
| `scripts/validate_team_standings_2026.ts` | `g === w + l + t`、6 球団、derived/public 一致、team-games 参考比較 | ✅ |
| npm `validate:team-standings:2026` / `:fail` | package.json 登録 | ✅ |
| `run_daily_npb_pipeline.mjs` | Phase 29 直後に `:fail` 版を実行 | ✅ |
| `scripts/verify_production_display_2026.mjs` | R2 / 本番 `/data/standings/2026/CL.json` の 200 + 1 位表示 | ✅ |

**手動確認:**

```powershell
npm run validate:team-standings:2026:fail
npm run display:r2:verify:production
```

**完了条件:** ✅ 上記マージ済み。ローカル JSON 生成後に `validate:team-standings:2026:fail` が通ること。

---

## 4. 実施順序（推奨）

```
Phase 0（診断）
  ↓
Phase 1（即時復旧 — 本番を先に直す）
  ↓
Phase 2（run_daily_npb_pipeline.mjs 改修）  ← 再発防止の核心
  ↓
Phase 3（ドキュメント整合）
  ↓
Phase 4（検証・本番確認）
```

Phase 1 と Phase 2 は **同日に Phase 1 を先** に実施可能（本番復旧を優先）。

---

## 5. リスク・注意点

| リスク | 対策 |
|--------|------|
| 日次一括だけ回して R2 未反映（G5） | `data_operation_rules.md` と運用チェックリストで **`pipeline:sync:2026` または `display:refresh:2026`** を日次締めに明記 |
| canonical の scoreboard 空 | Phase 29 は **出場成績 raw「計」列** を SSOT（親計画 §5）。stats raw 未取得試合は勝敗に含まれない |
| `phase29` 失敗でパイプライン全体停止 | 他ランキングと同様、失敗時はログ + 非ゼロ終了（日次で気づける） |
| 交流戦の扱い | 親計画 `isLeagueStandingsGame` 準拠。検証は公式表との目視突合を Phase 4 で |
| Git に standings JSON を載せない | `.gitignore` 済み。R2 が本番 SSOT |

---

## 6. 主要参照ファイル

| 用途 | パス |
|------|------|
| 親計画（機能全体） | `docs/plan_team_standings_phases.md` |
| Phase 0 要件 | `docs/plan_team_standings_phase0_spec.md` |
| 日次一括 | `scripts/run_daily_npb_pipeline.mjs` |
| 順位表ビルド | `scripts/phase29_build_team_standings.ts` |
| npm 再生成 | `package.json` → `phase29:build:standings`, `rankings:rebuild`, `display:refresh:2026` |
| R2 アップロード | `scripts/display_r2_upload.mjs` |
| 運用 SSOT | `docs/data_operation_rules.md` |
| UI | `app/components/top/TopPageStandingsTab.tsx` |
| 球団別パイプライン組込の参考 | `docs/plan_fielder_vs_team_pitch_distribution_phases.md` §Phase 4 |

---

## 7. 改訂履歴

| 日付 | 内容 |
|------|------|
| 2026-06-14 | 初版作成（順位表未更新ギャップ診断、Phase 0〜4、日次一括への Phase 29 組込計画） |
| 2026-06-14 | **Phase 2・3 完了**（`run_daily_npb_pipeline.mjs` 組込、運用ドキュメント整合） |
| 2026-06-14 | **Phase 4 完了**（`validate:team-standings:2026`、日次パイプライン検証、本番 R2 確認） |
