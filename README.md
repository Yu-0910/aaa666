# TopPage - プロ野球データ表示サイト

Next.js App Router を使用したプロ野球の成績ランキング表示サイトです。

## 開発サーバーの起動

**重要**: プロジェクトルート（`TopPage/`）で起動してください。

```bash
# キャッシュをクリア（必要に応じて）
Remove-Item -Recurse -Force .next

# 開発サーバーを起動
npm run dev
```

起動時に `[DEV_START] CWD: ...` が表示されます。プロジェクトルート以外で起動している場合は、正しいディレクトリに移動してから再起動してください。

## セットアップ

### データファイルの配置場所

**推奨：`_data/master_csv/` フォルダにまとめて配置**

今後、複数年度のデータを管理しやすくするため、以下のフォルダにCSVファイルを配置することを推奨します：

```
TopPage/
└── _data/
    └── master_csv/
        ├── Record.csv
        ├── batting_2025_PL_from_master.csv
        ├── batting_2025_CL_from_master.csv
        └── ...（将来、他の年度・リーグのCSVもここに配置）
```

**後方互換性：プロジェクトルート直下でも動作します**

既存の運用を維持するため、プロジェクトルート直下に配置しても動作します（後方互換）。

### 必要なファイル

以下のCSVファイルを配置してください：

1. **batting_2025_PL_from_master.csv**
   - 2025年パ・リーグのバッティングデータ（マスターデータ）
   - 選手名、チーム名、各種成績指標を含む
   - **推奨配置場所**: `_data/master_csv/batting_2025_PL_from_master.csv`
   - **代替配置場所**: プロジェクトルート直下（後方互換）

2. **Record.csv**
   - 生成すべき指標のリスト
   - 以下のいずれかの形式：
     - 1列だけの場合：その列の値を指標名リストとして使用
     - "metric" または "指標" という列がある場合：その列を指標名リストとして使用
     - それ以外：ヘッダー行（columns）を指標名リストとして使用
   - **推奨配置場所**: `_data/master_csv/Record.csv`
   - **代替配置場所**: プロジェクトルート直下（後方互換）

### 規定用・全員用CSVとランキング（全年度）

規定打席到達者用CSVと全員用CSVの役割、実行順序、全年度展開の詳細は **`docs/ranking_qualifying_csv_all_years_plan.md`** および **`docs/DATA_PATHS.md`** を参照してください。

### Yahoo canonical と投手コース別（シーズン表示）

投手個人ページの「コース別」シーズン集計は、CSV ランキングとは別系統で **`_data/scraped_games/canonical/`** の試合 JSON と、**`npm run phase20:build:pitcher-zones`** で作る **`_data/derived/pitcher_zone_from_canonical/`** に依存します。コマンド・前提・手動チェックリストは **`scripts/RUN.md`** の「投手コース別（シーズン横断・Phase 20）」を参照してください。全体の設計と障害時の切り分けは **`docs/plan_pitcher_course_zone_stats.md`** です。

### スポナビ raw テキスト（試合前スナップショットの再発防止）

テキスト速報 HTML（`_data/scraped_games/raw_sportsnavi_text/`）を**試合終了前**に取得すると、`bb-liveText` が無い**未充足**になり得ます。**日次パイプライン**（`scripts/run_daily_npb_pipeline.mjs`）で Phase2a を回す場合は、その日のカードが**試合終了後**に相当するまで待つか、翌日に **`npm run phase2:sportsnavi:stats-text:refetch-incomplete`**（`--only-incomplete`）で不足分だけ取り直してください。

`season_YYYY.json` に **merge で gameId を追加した直後**は、まず **`node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year YYYY --game-ids <カンマ区切り>`** で試し取得し、**`npm run diag:phase2-raw-completeness`** で未充足なら、計画書 **`docs/plan_phase2026_raw_text_completeness_and_refetch.md`** の **フェーズ 2**（再取得）に戻ってください。

**スタメン打順（打順別・守備位置別の入力）**は、出場成績 HTML の括弧付き「位置」行から Phase2b が `game.teams` に載せる。再生成・日次の手順は **`docs/plan_sportsnavi_stats_starting_lineup.md`** と **`scripts/RUN.md`**（スタメン打順の節）を参照。

### 併殺打（GIDP）の取得方針（2026）

Yahoo 一球速報（`domain.plateAppearances`）の `resultSummaryJa` は、試合によって **空文字**になったり、実際はダブルプレーでも **「併殺/併打」表現が欠落**することがあります。
そのため **GIDP は plateAppearances だけを正とせず**、まず canonical に入っている実況（`game.textPlayByPlay`）の
`併殺/併打/ダブルプレー/ゲッツー` を **下限（minimum）**として補完します（実況に「○番 姓 名 … ダブルプレー」等が出ている場合に限り加算）。

また、実況側も欠落する可能性があるため、必要に応じて **Yahoo 選手トップページのサマリ表（`/npb/player/{id}/top`）の GIDP** を参照し、
集計値がそれより小さい場合は **サマリ表を下限として補完**します（限定的に利用）。

運用上の方針:
- **日次運用**: 追加取得を増やさず、まずは実況補完で指標（RC 等）の材料を安定させる
- **品質監視**: `resultSummaryJa` 空欄が多い日や、補完量が急増した日は、必要に応じて Yahoo 一球取得（phase10）側の再実行を検討

### 盗塁／盗塁死（SB/CS）の取得方針（2026）

盗塁／盗塁死は **Yahoo `/text` 実況 DOM（`domain.runnerEvents`）** を一次ソースとして扱います。
スポナビ実況（`game.textPlayByPlay`）からのパースは、`domain.runnerEvents` が欠ける可能性があるための **補完（best-effort）** です。

二重計上（同一イベントが複数ソースに存在して合算される）を防ぐため、以下を徹底します:
- **canonical更新時**: `kind + inningHalf + yahooRunnerId`（欠ける場合は `sourceLine` を含む）で重複排除してマージする
- **集計時**: `domain.runnerEvents` と `game.textPlayByPlay` の補完結果を、同一 `(inningHalf, kind, runnerId)` で重複排除した上で合算する

### データ生成（最小テスト：2025年PL）

ランキングデータを生成するには、以下のコマンドを実行してください：

```bash
python scripts/build_rankings_2025_PL_full.py
```

**ファイル探索の優先順位：**

- **Record.csv**: 
  1. プロジェクトルート直下
  2. `_data/master_csv/Record.csv`（上記が見つからない場合）

- **batting_2025_PL_from_master.csv**（2025年PLの入力CSV）:
  1. `_data/master_csv_calculated/batting_2025_PL_from_master.csv`（計算済みCSV優先）
  2. `_data/master_csv/batting_2025_PL_from_master.csv`
  3. プロジェクトルート直下（上記が見つからない場合、後方互換）

スクリプト実行時に、実際に使用したファイルのパスが表示されます（デバッグ用）。

このコマンドを実行すると、`public/data/rankings/2025/PL/` ディレクトリに、Record.csvに記載された各指標のJSONファイルが生成されます。

**生成物の場所：**
- `public/data/rankings/2025/PL/{METRIC}.json`

例：
- `OPS.json`
- `打率.json`
- `AVG.json`
- `HR.json`
- など（Record.csvに記載された指標数だけ生成されます）

**注意：**
- 数値で並べられない指標（文字列など）は自動的にスキップされます
- 2025年PLのみを対象とし、他年度・他リーグには影響しません

### 指標計算スクリプト（計算済みCSV生成）

Record.csvに記載された指標を計算して、計算済みCSVを生成するスクリプトです。

**出力先**: `_data/master_csv_calculated/`（元CSVは絶対に上書きしません）

#### テスト実行（2025年PLだけ）

```bash
python scripts/compute_metrics_all_seasons.py --year 2025 --league PL
```

#### 全年度実行

```bash
python scripts/compute_metrics_all_seasons.py
```

#### ドライラン（書き込みなしで確認）

```bash
python scripts/compute_metrics_all_seasons.py --dry-run
```

#### オプション

- `--year YYYY`: 年度でフィルタ（例: `--year 2025`）
- `--league PL|CL`: リーグでフィルタ（例: `--league PL`）
- `--dry-run`: 書き込みなしで、対応指標/未対応指標/対象ファイルだけ表示
- `--overwrite`: 出力先に同名があれば上書き許可（デフォルトは上書きしない）

#### 計算される指標

Record.csvに記載された指標（36個）のうち、計算可能な指標が自動計算されます：

- 基本統計: 単打、塁打、打率、出塁率、長打率、OPS
- 派生指標: IsoP, IsoD, BB%, K%, BB/K, RC, XR, BABIP, SecA, TA, NOI, GPA

計算不能な指標は理由付きでログに表示されます。

### 将来の全年度対応について

`scripts/build_rankings_all_years.py` は将来の全年度・全リーグ一括生成用のスクリプトです。
現時点では未使用ですが、将来的に `_data/master_csv/` 内の全CSVファイルを自動処理するための足場として用意されています。

### 開発サーバーの起動

**重要**: プロジェクトルート（`TopPage/`）で起動してください。

```powershell
# プロジェクトルートに移動
cd TopPage

# キャッシュをクリア（必要に応じて）
Remove-Item -Recurse -Force .next

# 開発サーバーを起動
npm run dev
```

起動時に `[DEV_START] CWD: ...` が表示されます。プロジェクトルート以外で起動している場合は警告が表示されます。

ブラウザで `http://localhost:3000` を開いてください。

#### ランキングページの確認

```powershell
# 開発サーバー起動後、ブラウザで以下にアクセス
# http://localhost:3000/ranking/2025/CL
# http://localhost:3000/ranking/2025/PL
```

### 計算済みCSVとランキングJSONの一括生成

2025年CLとそれ以前の全年度の計算済みCSVとランキングJSONを一括生成する場合：

#### STEP 1: 小規模確認（2025年CLだけ）

```powershell
# プロジェクトルートに移動
cd "C:\Users\short\OneDrive\ドキュメント\デスクトップ\TopPage"

# 1. 計算済みCSV生成（2025年CLのみ）
py scripts/compute_metrics_all_seasons.py --year 2025 --league CL

# 2. ランキングJSON生成（2025年CLのみ、2025PLは除外）
py scripts/build_rankings_from_calculated.py --exclude "2025:PL"

# 3. バリデーション
py scripts/validate_outputs.py --exclude "2025:PL"
```

#### STEP 2: 一括生成（2024以前すべて、2025年は除外）

```powershell
# プロジェクトルートに移動
cd "C:\Users\short\OneDrive\ドキュメント\デスクトップ\TopPage"

# 1. 計算済みCSV一括生成（2024以前のみ）
py scripts/compute_metrics_all_seasons.py --max-year 2024

# 2. ランキングJSON一括生成（2024以前のみ）
py scripts/build_rankings_from_calculated.py --max-year 2024

# 3. バリデーション（2024以前のみ）
py scripts/validate_outputs.py --max-year 2024
```

**注意**: 
- `--max-year 2024` により、2024年以下（<=2024）のみ処理されます
- 2025年（PL/CL）は自動的に除外され、既存ファイルは一切更新されません
- 既存の出力ファイルがある場合はデフォルトでスキップされます（上書きする場合は `--overwrite` を使用）

### 全シーズンランキング一括生成（yearly_from_master_dedupから）

1936-2025年の全シーズンのランキングJSONを一括生成する場合（別の入力ソースを使用）：

```powershell
# プロジェクトルートに移動
cd "C:\Users\short\OneDrive\ドキュメント\デスクトップ\TopPage"

# 0. 前回の生成残骸を削除（任意、必要に応じて）
# Remove-Item -Recurse -Force .\public\data\rankings

# 1. 試合数マップのスモークテスト（ここで落ちたら次へ進まない）
py scripts/build_games_per_team_map.py --smoke

# 2. 試合数マップ生成
py scripts/build_games_per_team_map.py

# 3. ランキング一括生成（本番）
py scripts/build_rankings_all_from_yearly_dir.py `
  --input_dir "C:\Users\short\OneDrive\ドキュメント\デスクトップ\npb_batting\data\batting\yearly_from_master_dedup" `
  --out_dir "public\data\rankings" `
  --games_map "config\games_per_team_by_season.json"
```

#### 成功判定

生成後、以下を確認：

```powershell
# 1. 2025年CLのランキングJSONが72個あることを確認
$clFiles = Get-ChildItem -Path "public\data\rankings\2025\CL" -Filter "*.json"
Write-Host "2025年CLのJSONファイル数: $($clFiles.Count)"
if ($clFiles.Count -eq 72) {
    Write-Host "✅ 成功: 72個のJSONファイルが生成されました"
} else {
    Write-Host "❌ 失敗: 期待値72個に対して $($clFiles.Count)個しかありません"
}

# 2. _all.json と通常 .json が混在していることを確認
$allFiles = $clFiles | Where-Object { $_.Name -like "*_all.json" }
$normalFiles = $clFiles | Where-Object { $_.Name -notlike "*_all.json" }
Write-Host "_all.json: $($allFiles.Count)個"
Write-Host "通常.json: $($normalFiles.Count)個"
if ($allFiles.Count -eq 36 -and $normalFiles.Count -eq 36) {
    Write-Host "✅ 成功: 2種類のJSONファイルが正しく生成されました"
} else {
    Write-Host "❌ 失敗: ファイル数のバランスが崩れています"
}

# 3. レポートで2025/CLがOKであることを確認
$report = Get-Content "output\reports\ranking_generation_report.md" -Raw
if ($report -match "2025.*CL.*OK") {
    Write-Host "✅ 成功: レポートで2025/CLがOKと表示されています"
} else {
    Write-Host "❌ 失敗: レポートで2025/CLがOKと表示されていません"
    Write-Host "レポートを確認してください:"
    Get-Content "output\reports\ranking_generation_report.md" | Select-String "2025.*CL"
}
```

#### 失敗時のデバッグ

生成が失敗した場合、以下を確認：

```powershell
# 1. レポートの欠損一覧を確認
Get-Content "output\reports\ranking_generation_report.md" | Select-String -Pattern "欠損一覧|MISSING_FILES|ERROR" -Context 5

# 2. 2025年CLのディレクトリが存在するか確認
if (Test-Path "public\data\rankings\2025\CL") {
    Write-Host "✅ ディレクトリは存在します"
    Get-ChildItem -Path "public\data\rankings\2025\CL" -Filter "*.json" | Select-Object Name
} else {
    Write-Host "❌ ディレクトリが存在しません"
}

# 3. 試合数マップに2025/CLが含まれているか確認
$gamesMap = Get-Content "config\games_per_team_by_season.json" | ConvertFrom-Json
if ($gamesMap.'2025'.CL) {
    Write-Host "✅ 試合数マップに2025/CLが含まれています: $($gamesMap.'2025'.CL)"
} else {
    Write-Host "❌ 試合数マップに2025/CLが含まれていません"
}

# 4. 入力CSVファイルが存在するか確認
$csvPath = "C:\Users\short\OneDrive\ドキュメント\デスクトップ\npb_batting\data\batting\yearly_from_master_dedup\batting_2025_CL_from_master.csv"
if (Test-Path $csvPath) {
    Write-Host "✅ 入力CSVファイルが存在します: $csvPath"
} else {
    Write-Host "❌ 入力CSVファイルが存在しません: $csvPath"
}
```

## ランキング画面の確認方法

### 2025年パ・リーグの実データを表示

以下のURL形式でアクセスすると、実データが表示されます：

```
/ranking/{category}?year=2025&league=PL
```

例：
- `/ranking/OPS?year=2025&league=PL` - OPSランキング（実データ）
- `/ranking/AVG?year=2025&league=PL` - 打率ランキング（実データ）
- `/ranking/HR?year=2025&league=PL` - 本塁打ランキング（実データ）
- Record.csvに記載された任意の指標で同様に表示可能

### 従来のダミーデータを表示

以下のURL形式でアクセスすると、従来のダミーデータが表示されます（見た目・挙動は変更なし）：

```
/ranking/{category}
```

または

```
/ranking/{category}?year=2025&league=CL
```

例：
- `/ranking/OPS` - OPSランキング（ダミーデータ）
- `/ranking/AVG` - 打率ランキング（ダミーデータ）

## 注意事項

- **2025年PL以外は一切変更されていません**。既存のデザイン・挙動・ダミーデータは完全に維持されています。
- 実データを表示するには、先に `python scripts/build_rankings_2025_PL_full.py` を実行してJSONファイルを生成する必要があります。
- JSONファイルが存在しない、または読み込みに失敗した場合は、自動的に従来のダミーデータにフォールバックします。

## プロジェクト構造

```
TopPage/
├── app/
│   └── ranking/
│       └── [category]/
│           └── page.tsx          # ランキングページ（2025PLのみ実データ対応）
├── scripts/
│   ├── build_rankings_2025_PL_full.py  # データ生成スクリプト（2025年PL用）
│   ├── build_rankings_all_years.py     # 将来用：全年度一括生成スクリプト（未使用）
│   └── compute_metrics_all_seasons.py   # 指標計算スクリプト（計算済みCSV生成）
├── _data/
│   ├── master_csv/               # 推奨：CSVファイルの置き場（元データ）
│   │   ├── Record.csv
│   │   ├── batting_2025_PL_from_master.csv
│   │   └── ...（将来、他の年度・リーグのCSVもここに配置）
│   └── master_csv_calculated/    # 計算済みCSVの出力先
│       └── batting_YYYY_(PL|CL)_from_master.csv
├── public/
│   └── data/
│       └── rankings/
│           └── 2025/
│               └── PL/            # 生成されたJSONファイルの保存先
├── batting_2025_PL_from_master.csv  # バッティングデータ（後方互換：ルート直下でも可）
└── Record.csv                       # 指標リスト（後方互換：ルート直下でも可）
```

## 技術スタック

- Next.js 15.2.4
- React 19.2.3
- TypeScript
- Tailwind CSS



# ssss6
