# 投手ランキング（1950〜2025）— マスタ CSV 由来 JSON 生成とランキングページ公開

## 1. 目的

**野手ランキングと同型**に、**1950〜2025年**の投手成績を `/ranking/pitching/{year}/{league}` で閲覧できるようにする。

| 区分 | 現状 | ゴール |
|------|------|--------|
| マスタ CSV | `_data/master_csv_calculated/pitching_{year}_{CL\|PL}_from_master.csv` が **152 ファイル（1950〜2025）** あり | 変更なし（SSOT） |
| 計算済み CSV | `compute_metrics_pitching_all_seasons.py` 済み（ERA / WHIP / K-BB% 等） | 必要時のみ `--overwrite` で再計算 |
| ランキング JSON | **`pitching/2026/` のみ**（Phase 19・canonical 由来） | **`pitching/1950/` 〜 `pitching/2025/`** を一括生成 |
| ランキングページ | ルート・Client は **1950〜2026** を受け付けるが JSON 欠損でエラー | JSON 配置後に **そのまま表示** |

**2026 年**は既存の **Phase 19**（canonical 集計）を正とし、本計画では **上書きしない**（デュアルパイプライン）。

---

## 2. 背景（野手との対応関係）

### 野手（参考・完成済み）

```
master_csv_calculated/batting_*_from_master.csv
  → build_rankings_from_calculated.py
  → public/data/rankings/{year}/{league}/{metric}.json
```

- **2026**: Phase 11 → Phase 12（canonical）
- **1950〜2025**: 上記 Python 一括ビルド

### 投手（本計画で埋める穴）

```
master_csv_calculated/pitching_*_from_master.csv   ← 既にある
  → 【新規】build_pitching_rankings_from_calculated.py
  → public/data/rankings/pitching/{year}/{league}/{metric}.json
```

- **2026**: Phase 19（canonical）— **維持**
- **1950〜2025**: 本計画の Phase 2 で新規

---

## 3. スコープ

| 含む | 含まない |
|------|----------|
| 1950〜2025・CL/PL の投手ランキング JSON 一括生成 | 2026 canonical パイプラインの置き換え |
| `scripts/build_pitching_rankings_from_calculated.py` 新規 | QS率 / 被BABIP 等 **CSV に無い指標**の歴史年度への遡及計算 |
| 規定投球回フィルタ（率系指標）の歴史年度ルール | 週間投手ランキング（2026 専用のまま） |
| npm スクリプト・検証・ドキュメント更新 | 投手データの NPB 再スクレイプ（マスタは既存を正とする） |
| TOP / ナビから過去年度へのリンク確認 | チームページ投手タブの新規実装（別計画） |

---

## 4. データ正本（SSOT）

| 項目 | 正 |
|------|-----|
| 投手年度成績 | `_data/master_csv_calculated/pitching_{year}_{CL\|PL}_from_master.csv` |
| 指標の並び（歴史年度） | 本書 **§5.1** の `Record_pitching_historical`（新規）またはルート `Record_pitching.csv` の **CSV に存在する列のみ** |
| 指標の並び（2026） | `_data/master_csv/Record_pitching.csv`（現行・Phase 19 と同一） |
| JSON 配置 | `public/data/rankings/pitching/{year}/{CL\|PL}/{metric}.json` および率系用 `{metric}_all.json` |
| 規定投球回（歴史） | ビルド時: **チーム別 max(試合 G) × 1.0**（十進イニング）。2026 の `team-games.json` は使わない |
| 選手 ID | CSV の `player_id`（空なら `player-{連番}` フォールバック。野手 JSON と同方針） |
| ローマ字 | 既存 `/api/roman-names/{year}/{league}`（投手 CSV から供給できるよう Phase 6 で確認） |

---

## 5. Phase 0 — 要件・指標スコープ確定

### 5.1 歴史年度で出せる指標（マスタ CSV 32 列ベース）

計算済み CSV に実在する英語列と、`config/pitching_metric_map.json` の対応:

| 区分 | 指標（UI ラベル例） | JSON キー | 備考 |
|------|---------------------|-----------|------|
| 率・効率 | 防御率, WHIP, K-BB％, K％, BB％, 勝率 | `era`, `whip`, `k_bb_pct`, `k_pct`, `bb_pct`, `wpct` | 規定到達が必要（§5.2） |
| カウント | 勝利, 敗戦, 試合, 回数, Ｓ, 被打者, 被安, 被本, 三振, 四球, 完投, 完封, HLD, ＨＰ | `w`, `l`, `g`, `ip`, `sv`, `bf`, `ha`, `hra`, `so`, `bb`, `cg`, `sho`, `hld`, `hp` | 規定不要 → `_all.json` も検討 |
| その他 | 敬遠, 死球, 自責, 失点, 暴投 | `ibb`, `hbp`, `er`, `r`, `wp` | UI 列に無ければ JSON のみ保持 |

**歴史年度に出さない指標**（2026 Phase 19 のみ）:

先発, 投球数, P/IP, QS率, HQS率, SQS率, 被打率, 被BABIP, 被出塁率, 被長打率

→ **Phase 5** で `year < 2026` のとき `loadMetricsFromRecordPitchingHistorical()` により列をフィルタし、**存在しない指標タブを出さない**。

### 5.2 規定投球回（歴史年度）

| 項目 | ルール |
|------|--------|
| 対象指標 | `lib/ranking/qualifyingPitching.ts` の `RATE_KEYS` と同一 |
| 閾値 | 各チーム `max(行.g)` × `QUALIFYING_IP_INNINGS_PER_TEAM_GAME`（1.0） |
| ビルド | 率系: 規定到達者のみ `{metric}.json` / 全員 `{metric}_all.json`（野手 `build_rankings_from_calculated.py` と同型） |
| ランタイム | 2026 以外は **JSON ビルド時にフィルタ済み**とし、`team-games.json` は不要 |

### 5.3 JSON 行スキーマ（歴史年度）

Phase 19 出力（2026）に **可能な限り合わせる**。最低限:

```json
{
  "rank": 1,
  "playerId": "41743801",
  "player": "藤本 英雄",
  "name": "藤本 英雄",
  "team": "読売ジャイアンツ",
  "metric": "防御率",
  "era": 2.15,
  "whip": 1.23,
  "w": 26,
  "l": 14,
  "g": 49,
  "ip": 360.1,
  "bf": 1442,
  "so": 70,
  "bb": 307,
  "romanName": "H.Fujimoto"
}
```

- ソート列は `pitching_metric_map` のキー（`row[metric.key]`）。野手と同様 **`value` 列は必須ではない**（UI は `metric.key` を参照）。
- チーム名は `normalize_team_name`（野手ビルドと共通）で正規化。

### 5.4 既知のデータ品質（期待値の調整）

- 1950 年代など **ER=0 が多く ERA=0.0** の行がある（元データ由来。ビルドでは隠さず表示）。
- 2024 など **import より calculated の行数が多い**ファイルあり（追補済みマスタ）。ビルドは **calculated のみ**読む。

**Phase 0 成果物**: 本節をチーム合意の正とし、`Record_pitching_historical.csv`（1 行・カンマ区切り）を `docs/` または `_data/master_csv/` に追加。

---

## 6. Phase 1 — ファイル名パース・出力パス

**目的**: 野手 `scripts/lib/filename_parser.py` と対称の投手パーサを追加する。

| タスク | 内容 |
|--------|------|
| 1.1 | `parse_pitching_filename(name) -> { year, league, league_key }` |
| 1.2 | `build_pitching_rankings_output_path(year, league_key) -> "pitching/{year}/{league_key}"` |
| 1.3 | 対象 glob: `pitching_*_{CL,PL}_from_master.csv`（**PRE は v1 対象外**。必要なら Phase 9 で拡張） |

**完了条件**: 単体テストまたは `python -c` で 1950/2024/2025 のパスが期待どおり。

---

## 7. Phase 2 — `build_pitching_rankings_from_calculated.py` 新規

**目的**: 野手 `build_rankings_from_calculated.py` をテンプレートに、投手版一括ビルドを実装する。

### 7.1 入出力

| | パス |
|---|------|
| 入力 | `_data/master_csv_calculated/pitching_{year}_{league}_from_master.csv` |
| 出力 | `public/data/rankings/pitching/{year}/{league}/{sanitized_metric}.json` |

### 7.2 処理フロー（1 ファイルあたり）

1. CSV 読込（`load_csv_with_encoding` 流用）
2. 行ごとに `build_pitching_player_row(row)` — 英語列 → `pitching_metric_map` キーへマップ
3. `Record_pitching_historical` の指標ごとに:
   - `get_pitching_metric_value(row, metric)` — 日本語列名・英語列名の両対応
   - 降順 / 昇順（`lib/ranking/pitchingSortOrder.ts` と同ルールを Python 側に表として複製）
   - 規定: `filterPitchingRowsForQualifyingAtBuild` 相当
4. `rank` 付与、`sanitize_filename(metric)` で JSON 出力
5. サマリログ（成功指標数・スキップ理由）

### 7.3 CLI

```bash
python scripts/build_pitching_rankings_from_calculated.py
python scripts/build_pitching_rankings_from_calculated.py --year 1958 --league CL
python scripts/build_pitching_rankings_from_calculated.py --year-from 1950 --year-to 2025
python scripts/build_pitching_rankings_from_calculated.py --max-year 2025
python scripts/build_pitching_rankings_from_calculated.py --exclude 2026:CL
```

| オプション | 意味 |
|------------|------|
| `--max-year 2025` | 2026 を触らない（Phase 19 保護） |
| `--year` / `--league` | 部分再生成 |
| `--dry-run` | 件数のみ |

### 7.4 共通化方針

- 野手 `build_rankings_2025_PL_full.py` の `sanitize_filename`, `safe_int`, `safe_float` は **import して再利用**
- 投手専用のソート・規定・行マップは **新ファイル内**に閉じる（過剰抽象化しない）

**完了条件**:

- `public/data/rankings/pitching/1958/CL/防御率.json` が生成され、先頭行の `era` / `w` / `ip` が CSV と一致
- `public/data/rankings/pitching/2024/CL/WHIP.json` 同様
- **2026 配下の JSON が変更されない**（`--max-year 2025` デフォルト）

---

## 8. Phase 3 — 計算済み CSV の再確認（任意）

**目的**: ビルド前に派生列が最新か確認する。

```bash
python scripts/compute_metrics_pitching_all_seasons.py --overwrite
```

- 既存ファイルがあると **スキップ**するため、全再計算時のみ `--overwrite`
- 本 Phase は **ブロッカーではない**（calculated は既に存在）

---

## 9. Phase 4 — 規定投球回（ビルド時フィルタ）

**目的**: 率系指標 JSON が野手と同じ UX になるよう、ビルド時に規定を適用する。

| 指標種別 | 出力 |
|----------|------|
| 率系（`RATE_KEYS`） | `{metric}.json` = 規定到達のみ / `{metric}_all.json` = 全選手 |
| カウント系 | `{metric}.json` のみ（`_all` は野手に倣い不要なら省略可） |

**チーム別閾値**:

```text
minIp(team) = max( g | row.team == team ) × 1.0
```

IP は CSV の `IP` を十進化（`compute_metrics_pitching_all_seasons.ip_baseball_to_decimal` と同一ロジックを共有またはコピー）。

**完了条件**: 1958 CL 防御率で、1 回未満の投手が `.json` に含まれず `_all.json` には含まれる。

---

## 10. Phase 5 — フロントエンド・ローダ調整

**目的**: ページは既にあるため、**指標リストとエラーメッセージ**を歴史年度向けに整える。

| タスク | ファイル（想定） | 内容 |
|--------|------------------|------|
| 5.1 | `lib/ranking/recordPitching.ts` | `loadMetricsFromRecordPitchingForYear(year)` — 2026 は現行 Record、それ以前は historical |
| 5.2 | `app/ranking/pitching/[year]/[league]/page.tsx` | 上記で metrics を渡す |
| 5.3 | `hooks/usePitchingRankingTable.ts` | 変更最小（既に `loadPitchingRankingJson` 使用） |
| 5.4 | TOP / 年度切替 | `/ranking/pitching/{year}/CL` へのリンクが全年度で有効か確認 |

**完了条件**:

- `/ranking/pitching/1958/CL?sort=era` で表が表示される
- QS率タブが **1958 では出ない**
- `/ranking/pitching/2026/CL` は **従来どおり** Phase 19 の JSON + 全指標

---

## 11. Phase 6 — ローマ字・選手名

**目的**: 歴史年度でもローマ字行が表示される。

- 野手: `getRomanNameMap(year, league)` + master CSV
- 投手: 投手 CSV に `player_name_en` があれば API / ビルド時に `romanName` へ
- 不足時は空（UI は既存どおりローマ字行を非表示）

**完了条件**: 1958 CL で数名列に `romanName` が入る（取得できる範囲で）。

---

## 12. Phase 7 — npm スクリプト・パイプライン統合

```json
"pitching-rankings:build:historical": "python scripts/build_pitching_rankings_from_calculated.py --max-year 2025",
"rankings:rebuild:historical": "python scripts/sync_sb_ja_columns.py && python scripts/build_rankings_from_calculated.py --max-year 2025 && python scripts/build_pitching_rankings_from_calculated.py --max-year 2025"
```

| スクリプト | 役割 |
|------------|------|
| `pitching-rankings:build:historical` | 投手 1950〜2025 のみ |
| `rankings:rebuild:historical` | 野手 + 投手の歴史年度一括（2026 は各 Phase 12/19 のまま） |

`docs/DATA_PATHS.md` に投手歴史 JSON のパスを追記。

---

## 13. Phase 8 — 検証

| チェック | 方法 |
|----------|------|
| 件数 | 1950〜2025 × CL/PL × 指標数 ≒ 期待ファイル数 |
| 値の一致 | 藤本英雄 1958 / 近本とは別投手 2024 で CSV ↔ JSON 突合 |
| 2026 非破壊 | `pitching/2026/` の mtime / ハッシュがビルド前後で不変 |
| 規定 | 防御率 `.json` と `_all.json` の行数差 |
| UI スモーク | `npm run dev` → 1958 / 2000 / 2024 / 2026 の 4 年 |

```bash
# 例: 生成後スポット確認
python -c "import json; from pathlib import Path; p=Path('public/data/rankings/pitching/1958/CL/防御率.json'); d=json.loads(p.read_text(encoding='utf-8')); print(len(d), d[0].get('name'), d[0].get('era'))"
```

---

## 14. Phase 9（任意）— R2 / 本番反映

野手と同様、`display:r2:upload` 系で `public/data/rankings/pitching/{1950..2025}/` をアップロード。

- 2026 は既存オブジェクトを誤上書きしないようパスを分ける
- 詳細は `docs/plan_display_data_r2_unified_phases.md` に従う

---

## 15. デュアルパイプライン整理（運用メモ）

| 年度 | 野手 JSON | 投手 JSON |
|------|-----------|-----------|
| 2026 | Phase 12（canonical） | Phase 19（canonical） |
| 1950〜2025 | `build_rankings_from_calculated.py` | **`build_pitching_rankings_from_calculated.py`（本計画）** |

再実行時の原則:

- 歴史年度を直す → `pitching-rankings:build:historical` のみ
- 2026 を直す → `phase19:build:pitching-rankings` のみ
- **両方を一度に走らせない**（`--max-year 2025` をデフォルトにする理由）

---

## 16. リスクと緩和

| リスク | 緩和 |
|--------|------|
| 指標が UI にあるが JSON が無い | Phase 5 で年度別指標フィルタ |
| ERA=0 の歴史データ | 仕様として許容。ヘルプテキストは将来対応 |
| 投手 ID が空 | `player-{n}` フォールバック。個人ページリンクは切れる可能性を README に記載 |
| ビルド時間 | 野手と同程度（数十分）。`--year` で部分ビルド |
| Phase 19 行スキーマとの差 | Phase 2 でキー名を `pitching_metric_map` に統一 |

---

## 17. 実装順序（推奨）

1. **Phase 0** — `Record_pitching_historical.csv` 確定  
2. **Phase 1** — パーサ  
3. **Phase 2 + 4** — ビルドスクリプト（規定込み）  
4. **Phase 8** — 1958 / 2024 でスポット検証  
5. **Phase 5 + 6** — UI 指標フィルタ・ローマ字  
6. **Phase 7** — npm  
7. **Phase 9** — 必要なら R2  

---

## 18. 関連ファイル

| 種別 | パス |
|------|------|
| 野手ビルド（テンプレ） | `scripts/build_rankings_from_calculated.py` |
| 投手計算 | `scripts/compute_metrics_pitching_all_seasons.py` |
| 投手 2026 ビルド | `scripts/phase19_build_pitching_rankings_from_canonical.ts` |
| 投手ページ | `app/ranking/pitching/[year]/[league]/page.tsx` |
| 投手 Client | `app/ranking/pitching/[year]/[league]/PitchingRankingPageClient.tsx` |
| JSON ローダ | `lib/ranking/jsonLoader.ts` (`loadPitchingRankingJson`) |
| 指標マップ | `config/pitching_metric_map.json` |
| 規定（TS） | `lib/ranking/qualifyingPitching.ts` |
| 野手計画（参考） | `docs/plan_batting_rankings_cl_pl_2026.md` |

---

**状態**: ✅ Phase 0 完了（[`pitching_rankings_historical_phase0_spec.md`](./pitching_rankings_historical_phase0_spec.md)）／✅ Phase 1 完了／Phase 2〜 未実装  
**作成**: 投手マスタ CSV は取得・計算済み。本計画は **JSON 生成〜ページ表示** を Phase 0〜9 で完結させる。
