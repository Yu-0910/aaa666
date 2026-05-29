# 全選手の名前・成績スクレイピングプロセス レポート

## 📋 概要

本レポートでは、NPB（日本プロ野球）の全選手の名前と成績をスクレイピングし、ランキング表示システムに至るまでの全プロセスをまとめています。

---

## 🔄 データフロー全体図

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. HTMLスクレイピング（NPB.jp）                                  │
│    └─ scripts/build_player_name_kana_and_official_roman.py      │
│    └─ 各選手のHTMLページを取得                                    │
└─────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. HTMLキャッシュ保存                                            │
│    └─ output/html_cache/players/{player_id}.html                │
│    └─ 約6,958ファイル（2025年1月時点）                           │
└─────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. 選手名・かな・ローマ字抽出                                     │
│    └─ HTMLから選手名（日本語）、かな、ローマ字を抽出              │
│    └─ output/master/player_id_name_kana_official.csv            │
└─────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. 全選手IDリスト生成                                            │
│    └─ scripts/build_all_player_ids.py                            │
│    └─ 成績CSVから全player_idを抽出                               │
│    └─ output/master/all_player_ids.csv                          │
└─────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. ローマ字変換・最終辞書作成                                     │
│    └─ scripts/build_player_id_to_roman_full.py                  │
│    └─ かなからローマ字を生成（ヘボン式）                         │
│    └─ output/master/player_id_to_roman_full.csv                 │
└─────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. マスターCSV生成（成績データ）                                  │
│    └─ _data/master_csv/batting_{YEAR}_{LEAGUE}_from_master.csv │
│    └─ 1950年〜2025年の全年度・全リーグの成績データ               │
└─────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. 指標計算                                                      │
│    └─ scripts/compute_metrics_all_seasons.py                    │
│    └─ Record.csvに記載された指標を計算                           │
│    └─ _data/master_csv_calculated/                              │
└─────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. ランキングJSON生成                                            │
│    └─ scripts/build_rankings_all_from_yearly_dir.py             │
│    └─ public/data/rankings/{YEAR}/{LEAGUE}/{METRIC}.json         │
└─────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. UI表示                                                        │
│    └─ app/[year]/page.tsx                                        │
│    └─ ブラウザでランキング表示                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 各段階の詳細

### 段階1: HTMLスクレイピング

**スクリプト**: `scripts/build_player_name_kana_and_official_roman.py`

**目的**: NPB公式サイト（npb.jp）から各選手のHTMLページを取得し、選手名・かな・ローマ字を抽出

**処理内容**:

1. **player_idリストの読み込み**
   - `output/master/all_player_ids.csv` から全player_idを読み込み
   - 既に処理済みのplayer_idはスキップ（`--resume`オプション）

2. **URL生成**
   - 各player_idから複数のURL候補を生成
   - 例: `https://npb.jp/bis/players/{player_id}.html`
   - ゼロ埋め8桁・7桁のパターンも試行

3. **HTML取得**
   - レート制限を考慮（デフォルト: 1秒間隔）
   - リトライ機能（最大5回）
   - タイムアウト処理（5秒〜15秒）
   - エンコーディング自動検出（UTF-8、CP932、Shift_JIS、EUC-JP）

4. **HTMLキャッシュ保存**
   - `output/html_cache/players/{player_id}.html` に保存
   - 次回実行時にキャッシュを優先使用（`--use-cache`オプション）

5. **データ抽出**
   - **選手名（日本語）**: `id="pc_v_name"` のli要素から抽出
   - **かな**: `id="pc_v_kana"` のli要素から抽出（ひらがな優先）
   - **ローマ字**: 括弧内の英字名を抽出（外国人選手用）

6. **結果保存**
   - `output/master/player_id_name_kana_official.csv` に保存
   - カラム: `player_id`, `name_ja`, `name_kana`, `roman_official`, `url_used`, `http_status`, `outcome`

**実行例**:
```bash
python scripts/build_player_name_kana_and_official_roman.py
```

**オプション**:
- `--ids`: 入力CSVファイル（デフォルト: `output/master/all_player_ids.csv`）
- `--out`: 出力CSVファイル（デフォルト: `output/master/player_id_name_kana_official.csv`）
- `--rate`: レート制限（秒、デフォルト: 1.0）
- `--resume`: 既存の結果を読み込んで続きから実行（デフォルト: True）
- `--use-cache`: HTMLキャッシュを使用（デフォルト: True）
- `--limit`: 処理件数の上限（デバッグ用）

**エラーハンドリング**:
- HTTP 404: 次のURL候補を試行
- HTTP 429（レート制限）: バックオフしてリトライ
- HTTP 500以上: バックオフしてリトライ
- タイムアウト: バックオフしてリトライ
- ネットワークエラー: エラーを記録して次へ

**統計情報**:
- 処理済みplayer_id数
- OK/FAIL件数
- name_kana非空率
- roman_official非空率
- outcome別件数

---

### 段階2: HTMLキャッシュ

**ディレクトリ**: `output/html_cache/players/`

**内容**: 各選手のHTMLページをキャッシュとして保存

**ファイル数**: 約6,958ファイル（2025年1月時点）

**ファイル名形式**: `{player_id}.html`

**用途**:
- 再実行時の高速化（ネットワークアクセス不要）
- データのバックアップ
- デバッグ・検証用

**注意事項**:
- HTMLキャッシュは手動で削除しない限り保持される
- キャッシュが古い場合は `--no-cache` オプションで再取得可能

---

### 段階3: 選手名・かな・ローマ字抽出

**スクリプト**: `scripts/build_player_name_kana_and_official_roman.py`（段階1と同じ）

**抽出ロジック**:

1. **選手名（日本語）の抽出**
   ```python
   # 優先1: id="pc_v_name" のli要素を直接探す
   pc_v_name_li = soup.find('li', id='pc_v_name')
   
   # 優先2: div#pc_v_name の中のli#pc_v_nameを探す
   pc_v_name_div = soup.find('div', id='pc_v_name')
   ```

2. **かなの抽出**
   ```python
   # id="pc_v_kana"のli要素を探す
   pc_v_kana_li = ul.find('li', id='pc_v_kana')
   
   # ひらがなのみを優先（カタカナ・漢字・英字が混ざっていない）
   if re.match(r'^[あ-ん・\s]+$', kana_text):
       return kana_text
   ```

3. **ローマ字の抽出**
   ```python
   # 括弧内の英字名を抽出（外国人選手用）
   match = re.search(r'[（(]([A-Za-z\s\.\-\']+)[）)]', name_text)
   
   # 組織名を除外（NIPPON、PROFESSIONAL、BASEBALLなど）
   if not any(exclude in roman_name.upper() for exclude in [...]):
       return roman_name
   ```

**出力ファイル**: `output/master/player_id_name_kana_official.csv`

**カラム**:
- `player_id`: 選手ID
- `name_ja`: 選手名（日本語）
- `name_kana`: かな（ひらがな優先）
- `roman_official`: ローマ字（公式表記）
- `url_used`: 使用したURL（またはキャッシュパス）
- `http_status`: HTTPステータスコード
- `outcome`: 処理結果（OK、NAME_JA_ONLY、NO_DATA、FAILEDなど）

---

### 段階4: 全選手IDリスト生成

**スクリプト**: `scripts/build_all_player_ids.py`

**目的**: 成績CSVファイルから全player_idをユニーク抽出

**処理内容**:

1. **成績CSVファイルの探索**
   - `_data/master_csv/` ディレクトリを再帰的に検索
   - パターン: `batting_YYYY_(PL|CL)_from_master.csv`
   - `_data/master_csv_calculated/` も探索対象

2. **player_id抽出**
   - 各CSVファイルから `player_id` 列を抽出
   - 空文字・NaN・Noneを除外

3. **ユニーク化**
   - 重複するplayer_idを除去
   - ソート（長さ→文字列順）

4. **結果保存**
   - `output/master/all_player_ids.csv` に保存
   - カラム: `player_id`

**実行例**:
```bash
python scripts/build_all_player_ids.py
```

**オプション**:
- `--data-dir`: 成績CSVフォルダのルートディレクトリ
- `--output`: 出力CSVファイルパス（デフォルト: `output/master/all_player_ids.csv`）

**統計情報**:
- 処理したCSVファイル数
- 抽出したユニークplayer_id数

---

### 段階5: ローマ字変換・最終辞書作成

**スクリプト**: `scripts/build_player_id_to_roman_full.py`

**目的**: かなからローマ字を生成し、最終的な選手名辞書を作成

**処理内容**:

1. **入力データの読み込み**
   - `output/master/player_id_name_kana_official.csv` を読み込み
   - `output/master/all_player_ids.csv` を読み込み

2. **ローマ字変換**
   - **ヘボン式ローマ字変換テーブル**を使用
   - ひらがな→ローマ字の変換
   - カタカナ→ひらがな→ローマ字の変換
   - 長音記号（ー）の処理
   - 促音（っ）の処理

3. **優先順位**
   - **優先1**: 公式ローマ字（`roman_official`）が存在する場合
   - **優先2**: かなから生成したローマ字（`roman_from_kana`）
   - **優先3**: 選手名（日本語）から生成したローマ字（`roman_from_name`）

4. **結果保存**
   - `output/master/player_id_to_roman_full.csv` に保存
   - カラム: `player_id`, `roman_name`, `name_ja`, `name_kana`, `source`

**実行例**:
```bash
python scripts/build_player_id_to_roman_full.py
```

**ローマ字変換例**:
- `さとう てるあき` → `Sato Teruaki`
- `おかもと かずま` → `Okamoto Kazuma`
- `むらかみ むねたか` → `Murakami Munetaka`

---

### 段階6: マスターCSV生成（成績データ）

**ディレクトリ**: `_data/master_csv/`

**ファイル形式**: `batting_{YEAR}_{LEAGUE}_from_master.csv`

**内容**: 各年度・各リーグのバッティング成績データ

**カラム例**:
- `player_id`: 選手ID
- `player_name_ja`: 選手名（日本語）
- `team`: チーム名
- `G`: 試合数
- `PA`: 打席
- `AB`: 打数
- `H`: 安打
- `HR`: 本塁打
- `RBI`: 打点
- `AVG`: 打率
- `OBP`: 出塁率
- `SLG`: 長打率
- など

**データソース**:
- NPB公式サイトからスクレイピング
- または既存のデータベースからインポート

**注意事項**:
- 1950年〜2025年の全年度・全リーグのデータが含まれる
- 戦前データ（1936年、1937年など）も含まれる場合がある

---

### 段階7: 指標計算

**スクリプト**: `scripts/compute_metrics_all_seasons.py`

**目的**: Record.csvに記載された指標を計算し、計算済みCSVを生成

**処理内容**:

1. **Record.csvの読み込み**
   - 指標リストを抽出
   - ヘッダー行から指標名を取得

2. **元列のコピー処理**
   - 既存の列をそのままコピー（例: `G`, `PA`, `AB`, `H`など）
   - 英語名↔日本語名の相互コピー
   - 別名の処理（例: `K` → `SO`, `GIDP` → `GDP`）

3. **派生指標の計算**
   - **OPS**: `OBP + SLG`
   - **IsoP**: `SLG - AVG`
   - **IsoD**: `OBP - AVG`
   - **BB%**: `(BB / PA) * 100`
   - **K%**: `(SO / PA) * 100`
   - **BB/K**: `BB / SO`
   - **BABIP**: `(H - HR) / (AB - SO - HR + SF)`
   - **SecA**: `(BB + (TB - H) + (SB - CS)) / AB`
   - **TA**: `(TB + HBP + BB + SB) / (AB - H + CS + GDP)`
   - **NOI**: `(OBP + (SLG / 3)) * 1000`
   - **GPA**: `(1.8 * OBP + SLG) / 4`
   - **RC**: nf3互換  
     - \(A = H + BB + HBP - CS - GIDP\)  
     - \(B = TB + 0.26 \times (BB + HBP) + 0.53 \times (SF + SH) + 0.64 \times SB - 0.03 \times SO\)  
     - \(C = AB + BB + HBP + SF + SH\)  
     - \(RC = \left(\frac{(A + 2.4B)(B + 3C)}{9C}\right) - 0.9C\)（ただし \(C \le 0\) のときは "—"）
   - **XR**: `0.50 * 1B + 0.72 * 2B + 1.04 * 3B + 1.44 * HR + 0.33 * (BB + HBP) + 0.18 * SB - 0.32 * CS - 0.098 * (AB - H)`

4. **結果保存**
   - `_data/master_csv_calculated/` に保存
   - ファイル名: `batting_{YEAR}_{LEAGUE}_from_master.csv`
   - 元CSVは絶対に上書きしない（破壊的変更禁止）

**実行例**:
```bash
# 2025年PLのみ
python scripts/compute_metrics_all_seasons.py --year 2025 --league PL

# 全年度実行
python scripts/compute_metrics_all_seasons.py

# ドライラン（書き込みなし）
python scripts/compute_metrics_all_seasons.py --dry-run
```

**オプション**:
- `--year`: 年度でフィルタ
- `--league`: リーグでフィルタ（PL、CL、PRE）
- `--exclude`: 除外パターン（例: `"2025:PL"`）
- `--max-year`: 最大年度（この年度以下のみ処理）
- `--dry-run`: 書き込みなしで確認
- `--overwrite`: 出力先に同名があれば上書き許可

**統計情報**:
- 処理成功件数
- スキップ（既存）件数
- スキップ（フィルタ）件数
- 処理失敗件数
- 追加できた指標リスト
- スキップした指標と理由
- 未対応指標リスト

---

### 段階8: ランキングJSON生成

**スクリプト**: `scripts/build_rankings_all_from_yearly_dir.py`

**目的**: 計算済みCSVからランキングJSONを生成

**処理内容**:

1. **計算済みCSVの読み込み**
   - `_data/master_csv_calculated/` からCSVファイルを読み込み
   - 年度・リーグごとに処理

2. **指標ごとのランキング生成**
   - Record.csvに記載された各指標についてランキングを生成
   - 規定打席フィルタリング（指標によって異なる）
   - 降順ソート（または昇順）

3. **規定打席の判定**
   - 指標によって規定打席の有無が異なる
   - 例: OPS、打率は規定打席必要、HR、安打は不要
   - `games_per_team_by_season.json` から試合数を取得
   - 規定打席 = `試合数 × 3.1`

4. **結果保存**
   - `public/data/rankings/{YEAR}/{LEAGUE}/{METRIC}.json` に保存
   - ファイル名は `sanitize_filename()` で正規化（例: `BB/K` → `BB_K.json`）

**実行例**:
```bash
python scripts/build_rankings_all_from_yearly_dir.py
```

**出力形式**:
```json
[
  {
    "rank": 1,
    "playerId": "player-1",
    "name": "選手名",
    "romanName": "Roman Name",
    "team": "チーム名",
    "value": 0.950,
    "age": 25,
    "ops": "0.950",
    "avg": "0.300",
    ...
  },
  ...
]
```

**統計情報**:
- 処理したCSVファイル数
- 生成したランキングJSON数
- 各指標のランキング件数

---

### 段階9: UI表示

**ファイル**: `app/[year]/page.tsx`

**目的**: ブラウザでランキングを表示

**処理内容**:

1. **ランキングJSONの読み込み**
   - `public/data/rankings/{YEAR}/{LEAGUE}/{METRIC}.json` を読み込み

2. **ランキング表示**
   - 指標ごとにランキングを表示
   - ソート機能（昇順/降順）
   - フィルタリング機能（規定打席など）

3. **選手詳細ページへのリンク**
   - 各選手をクリックすると詳細ページへ遷移

**URL例**:
- `/2025/PL?sort=OPS`
- `/2025/CL?sort=HR`

---

## 🔧 使用技術・ツール

### プログラミング言語
- **Python 3**: スクレイピング・データ処理
- **TypeScript/JavaScript**: UI開発（Next.js）
- **Node.js**: 一部のスクリプト（.mjs）

### ライブラリ・フレームワーク
- **BeautifulSoup4**: HTMLパース
- **requests**: HTTPリクエスト
- **pandas**: データ処理（一部スクリプト）
- **Next.js**: UIフレームワーク
- **React**: UIライブラリ

### データ形式
- **CSV**: 成績データ、選手名辞書
- **JSON**: ランキングデータ、設定ファイル
- **HTML**: スクレイピング元データ（キャッシュ）

---

## 📊 データ規模

### HTMLキャッシュ
- **ファイル数**: 約6,958ファイル
- **ディレクトリ**: `output/html_cache/players/`

### マスターCSV
- **年度範囲**: 1950年〜2025年
- **リーグ**: PL（パ・リーグ）、CL（セ・リーグ）、PRE（戦前）
- **ファイル数**: 150ファイル以上（`_data/master_csv__import_1950_2024/`）

### 計算済みCSV
- **ディレクトリ**: `_data/master_csv_calculated/`
- **ファイル数**: 167ファイル（2025年1月時点）

### ランキングJSON
- **ディレクトリ**: `public/data/rankings/`
- **年度・リーグ・指標ごとにJSONファイルを生成**

---

## ⚠️ 注意事項・制約事項

### レート制限
- NPB公式サイトへのアクセスはレート制限を考慮（デフォルト: 1秒間隔）
- HTTP 429エラーが発生した場合は自動的にバックオフ

### エラーハンドリング
- ネットワークエラー、タイムアウト、HTTPエラーなどに対応
- リトライ機能（最大5回）
- エラーは結果CSVに記録（`outcome`カラム）

### データの整合性
- 元CSVは絶対に上書きしない（破壊的変更禁止）
- 計算済みCSVは `_data/master_csv_calculated/` に保存
- 既存ファイルの上書きは `--overwrite` オプションが必要

### キャッシュ管理
- HTMLキャッシュは手動で削除しない限り保持される
- キャッシュが古い場合は `--no-cache` オプションで再取得可能

---

## 🚀 実行手順（まとめ）

### 1. 全選手IDリスト生成
```bash
python scripts/build_all_player_ids.py
```

### 2. HTMLスクレイピング（選手名・かな・ローマ字抽出）
```bash
python scripts/build_player_name_kana_and_official_roman.py
```

### 3. ローマ字変換・最終辞書作成
```bash
python scripts/build_player_id_to_roman_full.py
```

### 4. 指標計算（計算済みCSV生成）
```bash
python scripts/compute_metrics_all_seasons.py
```

### 5. ランキングJSON生成
```bash
python scripts/build_rankings_all_from_yearly_dir.py
```

### 6. UI表示
```bash
npm run dev
```

---

## 📝 まとめ

本システムは、NPB公式サイトから全選手のHTMLページをスクレイピングし、選手名・かな・ローマ字を抽出、成績データと組み合わせて指標を計算し、ランキングJSONを生成するまでの全プロセスを自動化しています。

各段階で適切なエラーハンドリングとリトライ機能を実装し、データの整合性を保ちながら効率的に処理を進めています。

HTMLキャッシュ機能により、再実行時の高速化とデータのバックアップを実現しています。

---

**作成日**: 2025年1月
**最終更新**: 2025年1月




