# スクリプト実行ガイド

## PowerShellでの実行時の注意事項

### コメント行の扱い

PowerShellでは、`#` で始まるコメント行をコピペすると、コマンドに渡ってしまう可能性があります。

**❌ 避けるべき例:**
```powershell
# これはコメント
py scripts/validate_outputs.py --max-year 1937
```

**✅ 推奨:**
```powershell
py scripts/validate_outputs.py --max-year 1937
```

コメントは別行に書くか、実行コマンドのみをコピペしてください。

### レポート閲覧

Markdownレポートを閲覧する際は、`type` コマンドと `more` を使用してください：

```powershell
type output\reports\audit_rankings_structure.md | more
```

`morepy` のような連結事故を防ぐため、`type` と `more` を組み合わせて使用します。

## ランキング用データの更新

- **2025年のみ（新入団追加・英字名反映・再ビルド）**: **`docs/2025_ranking_update_operations.md`**（Phase 5 運用手順書）に手順・コマンド例を記載。
- **全般**: ランキングJSON更新の推奨順序は 1) 指標計算（`compute_metrics_all_seasons.py`）→ 2) 規定到達版CSV生成（`create_qualifying_csv_all_years.py` または 2025年は `create_qualifying_csv_2025.py`）→ 3) ランキングビルド。詳細・パス一覧は **`docs/DATA_PATHS.md`** および **`docs/ranking_qualifying_csv_all_years_plan.md`** を参照。

## 実行コマンド

### 投手成績スクレイピング（1950〜2002年）

2002年を成功として、1950年まで遡って投手成績を取得する。

```powershell
py scripts/run_pitching_scrape_1950_2002.py
```

オプション:
- `--from-year 1960` … 開始年度
- `--to-year 1990` … 終了年度
- `--year 1975` … 単年度のみ
- `--dry-run` … 対象年度を表示するだけで実行しない

出力先: `_data/master_csv__import_1950_2024/pitching_{年}_{CL|PL}_from_master.csv`

注意: 1年度あたり数分〜十数分かかる場合あり。`time.sleep` によりサーバー負荷に配慮している。

### ランキング構造監査

```powershell
py scripts/audit_rankings_structure.py --from-year 1950 --to-year 2024
```

### バリデーション

```powershell
py scripts/validate_outputs.py --max-year 1937
```

### 2026年NPB選手名簿作成

NPB公示ページを基に2026年支配下選手名簿を作成し、打席・投球の利き手を記録する。

```powershell
py scripts/build_npb_roster_2026.py
```

オプション:
- `--delay 1.0` … リクエスト間隔（秒）。サーバー負荷軽減のため推奨
- `--skip-handedness` … 投打取得をスキップ（名簿のみ取得、高速）
- `--resume` … 既存CSVから再開（未取得の投打のみ取得）。中断した場合に使用
- `--output _data/npb_roster_2026.csv` … 出力パス

出力: `_data/npb_roster_2026.csv`  
列: npb_player_id, name_ja, name_en, team, team_code, position, uniform_no, throw_hand, bat_hand, is_new_2026  
- throw_hand: R=右投, L=左投  
- bat_hand: R=右打, L=左打, B=両打  

注意: 785名の利き手取得のため、約10〜15分かかる場合あり。

新規選手のローマ字名をアプリに反映する場合:

```powershell
py scripts/generate_new_players_roman_for_app.py
```

出力されたエントリを `app/players/[playerId]/page.tsx` の `playerRomanNames` に追加してください。

### 菊池涼介ブロック集計（パイロット日別）

菊池涼介（batter_id=1100082）の 2026-03-04 のYahooパイロットデータから、個人ページブロック B,D,E,F,G,H,I,J 相当を収集・集計する。

```powershell
py scripts/collect_kikuchi_blocks.py
```

出力: `_data/yahoo_games_pilot/kikuchi_20260304_blocks.json`




### 投手コース別成績（対右/対左）

森翔平 3/15 試合のコース別投球成績を取得し、青柳ページの「対右打者/対左打者 コース別の投球成績」に表示する。

```powershell
py scripts/fetch_pitcher_zone_stats.py --game-id 2021040084 --pitcher-id 2103788
```

森翔平 3/15 コース別成績（被OPS・被打率・被本塁打）のレポート表示:
```powershell
py scripts/report_mori_zone_stats.py --fetch
```

出力: `_data/yahoo_games_pilot/zone_stats_2021040084_2103788.json`

---

## スタメン打順（出場成績 HTML → canonical → 打順別派生）

計画: **`docs/plan_sportsnavi_stats_starting_lineup.md`**

スポーツナビ **出場成績**（`raw_sportsnavi_stats/{gameId}.html`）の「位置」列で、括弧付き `(二)` `(右)` などの行をスタメン 1〜9 番として `game.teams[].startingLineup` に載せる。**新規 fetch は不要**（Phase2a で既に取得している HTML を Phase2b が再パースする）。

### 検証（固定試合）

```powershell
npm run validate:sportsnavi-stats-starting-lineup
```

### 過去 canonical の埋め直し

```powershell
npm run phase2:sportsnavi:stats-text:refetch-incomplete
npm run phase2:sportsnavi:canonical:lineup-backfill
npm run phase15:build:batting-splits
```

全試合上書き: `node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year 2026 --force` のあと、日次と同様に `npm run phase3:derived:2026` など。

### 日次パイプライン

`npm run daily:npb-pipeline` は従来どおり。Phase2b の canonical 生成で **自動的に teams が入る**。派生は `loadCanonicalGamesMergedForDerivedPipeline` が古い JSON 向けに raw stats からも注入する。

---

## 投手コース別（シーズン横断・Phase 20）

計画書: **`docs/plan_pitcher_course_zone_stats.md`**（Phase 1-A / Phase 4 の Runbook あり）

### この節でやること（他と混同しない）

| 手段 | 用途 |
|------|------|
| **`npm run phase20:build:pitcher-zones`**（TypeScript / Node） | **canonical 内の全試合**から、投手ごとに対右・対左の 5×5 を **シーズン集計**して JSON を出す。**アプリの「今季」コース別の主データ。** |
| **`py scripts/fetch_pitcher_zone_stats.py`**（Python） | **1 試合 × 1 投手**を Yahoo 系から取る補助。上とは別ルート。 |

**注意:** ここで使うのは **`pa_outcome_from_ts` や打席結果分類 CLI ではない**。入力は **`_data/scraped_games/canonical/*.json`** の `pitchEvents` など。

### 前提（データ）

- **canonical** がプロジェクトに存在すること: `_data/scraped_games/canonical/*.json`  
  （無い・空に近いと、派生フォルダが空のままになる。取得は別手順: `package.json` の `phase10:yahoo:*` などチーム運用に従う。）

### 前提（実行環境）

- **Node.js 18 以上**（`package.json` の `engines` 参照）
- プロジェクトルートで **`npm install` 済み**（`npx tsx` が使えること）

### コマンド（プロジェクトルートで実行）

```powershell
npm run phase20:build:pitcher-zones
```

既定年度は `package.json` の script に合わせる（例: `--year 2026`）。変更する場合は次のように直接指定できる。

```powershell
npx tsx scripts/phase20_build_pitcher_zone_from_canonical.ts --year 2026
```

### 出力先

`_data/derived/pitcher_zone_from_canonical/{year}/yahoo_{yahooPitcherId}.json`

### アプリの年度と揃える

フロント・API の既定年度は **`lib/seasonStatsPilotShared.ts` の `DERIVED_SEASON_YEAR_DEFAULT`**。Phase 20 の `--year` とずれると、ビルドしても画面が 404（データなし）になりやすい。

### API のスモーク確認（開発サーバー起動後）

ブラウザで開く（`{公開の playerId}` は実在 ID に置き換え）:

`http://localhost:3000/api/players/{公開のplayerId}/pitcher-zone-stats?year=2026`

- **200**: `vsRight` / `vsLeft` などが返れば OK（その投手用の派生がある場合）。
- **404**: 本文の `code` が `NO_YAHOO_ID` または `NO_DERIVED_DATA` のときは、名簿・Yahoo ID 橋渡し・派生ファイルの有無を確認（詳細は計画書 Runbook）。

PowerShell では `Invoke-WebRequest` や **`curl.exe`**（`curl` 単体は別物になりがち）を使うか、ブラウザの開発者ツールの Network タブで確認してよい。

### スモークチェックリスト（canonical 更新後・手動で可）

データを更新したあと、次を順に確認する（計画書 Phase 4 の運用チェックと同趣旨）。

1. [ ] `npm run phase20:build:pitcher-zones` が **エラーなく最後まで終わる**
2. [ ] `_data/derived/pitcher_zone_from_canonical/{年度}/` に **少なくとも 1 つ** `yahoo_*.json` がある（canonical に投球イベントがある前提）
3. [ ] **登板のある投手 1 名**について、上記 API が **200** になる（または 404 でも `code` が仕様どおり）
4. [ ] `npm run dev` で **投手の個人ページ**を開き、「コース別」に **数値が出る**、または **データが無い旨の表示**だけになる（真っ黒・未処理のままにならない）

**Phase 4 の「完了」の目安:** 新しくクローンした人が、この節と計画書を読み、**canonical と Node が揃った環境**で 1〜4 を再現できること。派生 JSON を Git に含めない方針の場合は、**デプロイ前に必ず Phase 20 を回す**ことを README などチーム合意で明示する。

## ✅ 監査ルール（ファイル名）
- 表示名 BB/K はファイル名で BB_K に正規化（sanitize_filename準拠）
- 監査/生成ともに sanitize_filename の出力を正とする（手作業のBB-Kは禁止）






