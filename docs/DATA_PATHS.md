# ランキング用データのパス一覧（正のパス）

規定用・全員用CSV分割およびランキングJSON生成で参照する「正」のディレクトリと、各スクリプトの入出力をまとめる。  
詳細な実行順序・Phase は `docs/ranking_qualifying_csv_all_years_plan.md` を参照。

---

## ディレクトリ役割

| パス | 役割 | 備考 |
|------|------|------|
| `_data/master_csv__import_1950_2024/` | スクレイピング／インポート済みの**生CSV**（年度・リーグ別） | 1950年〜2025年を格納。スクレイパの出力先。 |
| `_data/master_csv/` | 生CSVの別置き場（従来運用） | 必要に応じて import フォルダからコピーする運用も可。 |
| `_data/master_csv_calculated/` | 指標計算済みの**全員用CSV**および**規定到達版CSV**の格納先 | 入力: 生CSV。出力: `*_from_master.csv`（全員用）、`*_qualifying.csv`（Phase 1 で生成）。 |
| `public/data/rankings/` | ランキング用**JSON**の出力先 | 年度／リーグ／指標別。サイト頁が読みにいく。 |
| `public/data/rankings/{year}/{CL\|PL}/team-games.json` | **2026 球団別消化試合数**（canonical 集計） | Phase 12 と同時出力。率系 `minPA` / `minIp` の SSOT。 |
| `public/data/rankings/weekly/{year}/{weekKey}/{CL\|PL}/team-games.json` | **当週**の球団別試合数 | Phase 28 と同時出力。 |
| `config/games_per_team_by_season.json` | 試合数マップ（**2026 本番では使わない**） | 1950–2025 CSV 系の規定算出用。 |

---

## スクリプト別 入力・出力

| スクリプト | 入力 | 出力 |
|------------|------|------|
| `scripts/scrape_npb_batting_stats.py` | NPB 公式（HTTP） | `_data/master_csv__import_1950_2024/batting_{year}_{league}_from_master.csv` |
| `scripts/compute_metrics_all_seasons.py` | `_data/master_csv/` または `--input-dir` で指定（例: `_data/master_csv__import_1950_2024`） | `_data/master_csv_calculated/batting_*_from_master.csv` |
| `scripts/create_qualifying_csv_all_years.py` | `_data/master_csv_calculated/batting_*_from_master.csv` | `_data/master_csv_calculated/batting_*_qualifying.csv` |
| `scripts/build_rankings_from_calculated.py` | `_data/master_csv_calculated/`（from_master + qualifying） | `public/data/rankings/{YEAR}/{LEAGUE}/*.json` |
| `scripts/build_rankings_2025_PL_full.py` | `_data/master_csv_calculated/`（2025年セ・パ） | `public/data/rankings/2025/{CL\|PL}/*.json` |

---

## 推奨実行順序（ランキング用データ更新）

1. スクレイピング／インポート → 生CSVを `_data/master_csv__import_1950_2024/` に配置
2. 指標計算: `python scripts/compute_metrics_all_seasons.py`（必要なら `--input-dir _data/master_csv__import_1950_2024`）
3. 規定到達版CSV生成: `python scripts/create_qualifying_csv_all_years.py`
4. ランキングJSON生成:  
   - 2024年以前: `python scripts/build_rankings_from_calculated.py`  
   - 2025年: `python scripts/build_rankings_2025_PL_full.py --year 2025 --league CL` および `--league PL`（規定/全員の切り替え・romanName 出力に対応。両方: `--league CL` のあとに `--league PL` を実行）。
5. **2025年新入団選手の追加（報告書ベース・運用ルール）**  
   シーズン中・オフに新入団が判明したら、**報告書に1行追加**し、以下を実行する。  
   - **詳細な手順・バックアップ・コマンド例**: **`docs/2025_ranking_update_operations.md`**（Phase 5 運用手順書）を参照。  
   - **手順（2025年ランキング更新チェックリスト）**  
     1. `_data/reports/2025_new_players_report.csv` を編集し、新入団選手の行を追加（player_name_ja, team, player_name_en 必須。備考は任意）。  
     2. `python scripts/merge_2025_new_players_from_report.py` で全員版CSVに不足分を追加（バックアップに成績があれば流用、無ければ最小行で追加）。  
     3. `python scripts/apply_report_en_to_from_master_2025.py` で報告書の英字名を from_master に反映。  
     4. `python scripts/create_qualifying_csv_2025.py` で規定打席到達版CSVを再生成。  
     5. `python scripts/build_rankings_2025_PL_full.py --year 2025 --league CL` および `--league PL` でランキングJSONを再生成（2025年はこのスクリプト推奨。romanName 出力対応）。  
   - 一括実行（マージ＋ビルドのみ）: `python scripts/merge_2025_new_players_and_build_rankings.py`。英字名反映・規定用CSV再生成は含まれないため、確実に反映する場合は上記 1〜5 を順に実行すること。

6. **2025年「全選手用」CSVの更新版を作り、新入団・新外国人を組み込んでランキング反映（一括）**:  
   2024年型の非規定（全選手用）CSVの更新版を作成し、2025年新入団・新外国人を組み込み、規定用CSV作成〜ランキングJSON再生成まで一括で行う場合:  
   `python scripts/build_2025_full_from_master_and_rankings.py`  
   - スクレイプをスキップして既存CSVのみでマージ〜ランキングまで行う: `--skip-scrape`  
   - 手順: 現在の2025 from_masterをバックアップ → （オプション）NPBスクレイプ → 指標計算 → 報告書の選手で不足分を追加（バックアップに居れば成績を反映） → 規定打席到達版CSV作成 → ランキングJSON再生成（CL/PL）

---

## 分割実行の例（Phase 5）

- **規定用CSVを decade 単位で生成**: `--year` は単年度指定のため、複数回実行する。例: 1950年代のみ → `python scripts/create_qualifying_csv_all_years.py --year 1950` から `--year 1959` まで順に実行（または一括で `create_qualifying_csv_all_years.py` を引数なしで実行）。
- **ランキングビルドを年度・リーグで絞る**: `python scripts/build_rankings_from_calculated.py --year 2024 --league CL`（2024年CLのみ）。`--year 1975 --league PL` で1975年PLのみ。
- **規定ルールや games_map を変更した場合**: 規定打席の算出ロジック（`qualifying_rules.py` / `games_per_team_by_season.json`）を変更したら、規定用CSVの再生成とランキングの再ビルドを行う。対象ファイル確認: `create_qualifying_csv_all_years.py --dry-run`。

---

## Yahoo canonical 派生とランキング再ビルド（2026・統一計画）

canonical を増やしたあと、派生 JSON（Phase 11 / PoC1 等）を更新したら **必ず** 野手・投手ランキング JSON も揃える。

- **派生一括（例）**: `npm run phase3:derived:2026`
- **続けてランキング**: `npm run rankings:rebuild`（Phase 12 + 19 + 28 + **29（順位表）** → `team-games.json` 同梱 → top-leaders）
- **一括エイリアス**: `npm run phase3:derived:2026:and-rankings`（上記を連続実行）
- **2026 規定の検証**: `npm run validate:ranking-qualifying-2026`（Phase 5。`--fail` で CI 用 exit 1）

投手の Yahoo→NPB インデックスは `npm run build:yahoo-pitcher-npb-index`（PoC 由来＋ランキング掲載 ID の名簿補完）。PoC 生成の末尾でも実行される。

個人の Phase 11 JSON と野手ランキング JSON が同じ canonical 由来か確認する: `npm run validate:batting-phase11-vs-phase12`（不一致は派生とランキングの**生成タイミングのズレ**が典型）。

| パス | 役割 |
|------|------|
| `_data/derived/player_matchup_batting/{year}/npb_*.json` | 野手個人ページ「対戦成績」— 対戦投手別（**Phase30**） |
| `_data/derived/player_matchup_pitching/{year}/npb_*.json` | 投手個人ページ「対戦成績」— 対戦打者別（**Phase30**） |
| `_data/derived/player_batter_vs_team_count_pitch_types/{year}/yahoo_*.json` | 野手個人ページ「球団別」— 対戦球団×カウント別配球（**Phase33**） |

**検証**: `npm run validate:phase31-matchup-vs-phase11:fail`（全相手打数合計 ≤ Phase11 通算打数、打者↔投手の双方向一致）。Phase30 の直後に日次パイプラインでも実行される。

**検証（Phase33）**: `npm run validate:phase34-batter-vs-team-pitch-vs-phase14:fail`（全球団投球合計 ≤ Phase14 球種別投球合計）。Phase33 の直後に日次パイプラインでも実行される。

Yahoo 一球の **Phase10 取得**（同一打席が複数の投球表に分かれるケース・再取得の目安）は **`docs/yahoo_plate_appearance_batting_rules.md` §6a** を参照。

---

## 週間ランキング用パス（Phase 0 草案 → Phase 28 以降で使用）

トップ「今週」タブ・週間ランキングの要件は **`docs/plan_top_weekly_phase0_spec.md`**。  
週次の**集計**は Phase 17（打撃）/ Phase 7（投球）のみ。週間ランキング JSON はその派生を**読んで並べ替える**だけ（再集計しない）。

| パス | 役割 |
|------|------|
| `_data/derived/player_season_batting_period/{year}/yahoo_*.json` | 打撃・週間行（`calendar_week`）。個人ページと共有 |
| `_data/derived/player_season_pitching_period/{year}/npb_*.json` | 投球・週間行（`calendar_week`） |
| `public/data/rankings/weekly/{year}/{weekKey}/{CL\|PL}/*.json` | 打撃・週間ランキング（率系は規定到達者のみ） |
| `public/data/rankings/weekly/{year}/{weekKey}/{CL\|PL}/team-games.json` | 当週・球団別試合数（規定算出用） |
| `public/data/rankings/pitching/weekly/{year}/{weekKey}/{CL\|PL}/*.json` | 投球・週間ランキング（率系は規定到達者のみ） |
| `public/data/rankings/weekly/{year}/current-week.json` | ビルド時点の「今週」メタ（`weekKey` / `weekLabel`） |
| `public/data/top-leaders/weekly/{year}/{weekKey}/{CL\|PL}/batting.json` | 今週タブ・打撃スナップショット |
| `public/data/top-leaders/weekly/{year}/{weekKey}/{CL\|PL}/pitching.json` | 今週タブ・投球スナップショット |

**生成**: `npm run phase28:build:weekly-rankings`（Phase 17 / Phase 7 派生を読むだけ。再集計しない）

**トップ今週タブ用スナップショット**: `npm run top-weekly-leaders:build:2026`（週間 JSON + 当週 `team-games.json` で率系規定を適用して切り出し）

**更新順**: `phase3:derived:2026`（Phase 17/7 含む）→ `npm run rankings:rebuild`（Phase 12/19/28/**29** + top-leaders + top-weekly-leaders）

### 2026 通算ランキング JSON の種類（Phase 4）

| ファイル | 内容 |
|----------|------|
| `{指標}.json` | 率系: 規定到達者のみ（`team-games` 基準）。カウント系: 全員 |
| `{指標}_all.json` | 通算のみ・全選手（安打・本塁打等はこちらを fetch） |

---

## チーム順位表（2026・Phase 29）

トップ「順位表」タブの要件は **`docs/plan_team_standings_phase0_spec.md`**。  
勝敗は出場成績 HTML の **「計」列**（`raw_sportsnavi_stats`）。打撃・投手率指標は canonical から球団別合算。

| パス | 役割 |
|------|------|
| `_data/derived/team_standings/{year}/{CL\|PL}.json` | 工場派生（Git 外） |
| `public/data/standings/{year}/{CL\|PL}.json` | 表示用ローカル出力（Git 外・R2 アップロード元） |
| R2 `data/standings/{year}/{CL\|PL}.json` | **本番 SSOT**（ブラウザは `/data/standings/...` 経由） |

**生成**: `npm run phase29:build:standings -- --year 2026`

**更新順**: `rankings:rebuild` および `daily:npb-pipeline` の派生ブロック末尾で **Phase28 の直後・top-leaders の直前**に実行（`rankings:rebuild` と同順）。

**本番反映**: `npm run display:r2:upload:2026` / `display:refresh:2026` / `pipeline:sync:2026`（**`daily:npb-pipeline` だけでは R2 は更新されない**）。

**検証**: `npm run validate:team-standings:2026:fail`（Phase29 直後に日次パイプラインでも実行）

**再発防止計画**: `docs/plan_team_standings_pipeline_refresh_phases.md`

---

## チームページ（2026・表示のみ）

| パス | 役割 |
|------|------|
| `/teams/{teamCode}/2026/batting` | 所属選手の打撃ランキング（リーグ JSON をクライアントフィルタ） |
| `/teams/{teamCode}/2026/pitching` | 所属選手の投手ランキング（同上） |
| `/teams/{teamCode}/2026/catchers` | 所属捕手一覧（個人捕手派生 API を並列取得） |

**データ**: 打撃・投手は `public/data/rankings/` の既存 JSON をそのまま使用（チーム別の再ビルドなし）。捕手は `_data/derived/player_catcher_*` と名簿。

**導線**: トップ順位表の球団名・モバイルドロワー「球団ページ」（`lib/teamPage/teamPageNavLinks.ts`）。

詳細: `docs/plan_team_page_phase0_spec.md`

---

## 検証（Phase 3）

- **サンプル年度での確認**: `--year 2024 --league CL` や `--year 1975 --league PL` で Phase 1 → Phase 2 を実行し、規定必須指標の JSON が規定用CSV由来で行数・上位が期待どおりか確認する。
- **規定用CSVなし時のフォールバック**: 規定用CSVを一時的にリネームまたは削除した状態でビルドし、従来どおり全員用CSV＋minPA で JSON が生成されることを確認する。
