# プロフィール欄「FA取得（推定）」追加計画（facounter連携）

## 目的

- 選手個人ページのプロフィール欄に **「FA取得（推定）」** を追加する。
- `facounter`（`https://facounter.net/`）の **各球団ページ**にある **「国内FAまで」**（年・日／取得済）を取り込み、**取得が予想される西暦年（例: `2028年`）**を表示する。
- facounter の「国内FAまで」から **取得が見込まれる西暦年**を算出し、プロフィール欄には **`YYYY年`（4桁＋年）だけ** を表示する（例: `2028年`）。`（今季可能）` `（推定）` などの括弧付き文言は付けない。
- **取得済み**の選手は、年の代わりに **「取得済」** と表示する（括弧修飾なしの固定文言として例外とする）。
- 対象は **2026年選手名簿（`_data/npb_roster_2026.csv`）に名前がある全員**。

## 前提・用語

- facounterの「国内FAまで」は、**一軍登録日数**ベースの残量（「年・日」または「取得済」等）として掲載される。
- 本サイト側の表示はあくまで **推定**（facounterの注意事項に従う）。表示名は **「FA取得（推定）」** とし、出典はプロフィール欄の注記またはツールチップ等で明記する。
- 現在（6月上旬）の前提として **今季残り日数=125日**（この値は毎年・時期で変わるため、コード上は設定可能にする）。

## 成果物（想定）

- **派生JSON（SSOT）**: `_data/derived/player_fa_estimates/2026/npb_fa_estimates.json`
  - `byNpbPlayerId[npbId].domesticFa` に、取得状態・残年日・`estimatedYear`（西暦整数）・UI用 `displayValue`（`"2028年"` / `"取得済"` / `"—"`）を格納
- **API**: `GET /api/players/[playerId]/fa-estimate?year=2026`（または `profile-merged` に統合）
- **UI**: 個人ページのプロフィール表に `FA取得（推定）` 行を追加

## データソース（facounter）

### 参照対象

- 各球団ページ（例: `https://facounter.net/count/cnd.html` など）
  - テーブル列に **「国内FAまで」**（年／日）または **「取得済」** が存在

### 取得方法（方針）

- HTMLを取得 → 表をパース → `team`（球団）単位の選手行へ正規化
- 更新は **年1回**（例: 開幕前〜開幕直後に 1 回）とする。取得頻度が増える場合はサイト負荷に配慮し、バックオフ・キャッシュを設ける。

## 推定ロジック（年度への変換）

facounterの残量を \(`残年`, `残日`\) とし、1年=145日として総日数に変換する。

- \(totalDays = 残年 \times 145 + 残日\)
- 今季残りを \(remainingDaysThisSeason = 125\)（設定値）
- 推定「取得年」は **シーズン単位**で計算する（“年内の暦日”ではなく“今季/来季”の概算）。

推定シーズンオフセット:

- 取得済: `status = acquired`（年度推定は不要）
- 今季可能（facounter表記が存在する場合）: `estimatedYear = 2026`
- 年日表記の場合:
  - \(totalDays \le remainingDaysThisSeason\) → `estimatedYear = 2026`
  - それ以外 → `estimatedYear = 2026 + 1 + ceil((totalDays - remainingDaysThisSeason)/145)`

注:

- これは「今季中に最大125日稼げる」「以降は各年145日稼げる」という上限モデルによる推定。
- facounter側で特例措置が未反映の場合があるため、算出ロジックは推定だが、**画面上のセル値には「推定」等の文字は出さない**（列見出しの「（推定）」はデータ源が参考である旨の注記として残す）。

### プロフィール欄の表示形式（確定）

| 内部状態 | セルに載せる文字 | 例 |
|----------|------------------|-----|
| 取得済み（`acquired`） | `取得済` | `取得済` |
| 今季取得見込み（`possible_this_season`） | **`YYYY年` 形式** | `2026年` |
| 年日から算出（`estimate`） | **`YYYY年` 形式** | `2028年` |
| 不明・突合不可 | `—` | `—` |

ルール:

- **年を示す場合は `YYYY年` 形式だけ**（`2028`・`2028（推定）` は不可）。
- `今季可能` `推定` などの括弧書きは **一切付けない**。
- 取得済み以外で年が出せない場合は `—`。

## 名簿（NPB ID）への突合

### 入力

- facounter行: `背番号` / `選手名` / `球団` / `国内FAまで（年・日 or 取得済）` / 備考
- 2026名簿: `_data/npb_roster_2026.csv`（`npb_player_id`, `name_ja`, `team` など）

### 突合キー（優先順）

1. **球団（正式名の正規化） + 選手名（日本語）**
2. 1が無い場合、**選手名のみで全12球団を横断検索**（2026名簿の移籍先と facounter 掲載球団がずれるケース。例: 井上広大＝名簿阪神／facounterロッテ）
3. 複数候補の場合、**背番号**で絞る（名簿に背番号があるとき）
4. それでも曖昧な場合は `unresolved` としてレポート出力し、手当て用に一覧化

登録名・表記ゆれ（`lib/facounterRosterAliases.ts`）:

- 名簿「拓也」↔ facounter「矢崎 拓也」（同一人物）
- 名簿「石垣 勝海」↔ facounter「石垣 雅海」（同一人物）

## Phase 計画

### Phase 0 — 仕様固定（スキーマと表示）

- `FA取得（推定）` の表示仕様を確定（**セル値は `YYYY年` 形式**／取得済みは `取得済`）
- 派生JSONスキーマを確定（`acquired|possible_this_season|estimate` 等。`estimatedYear` は整数で保持し、表示は `displayValue` に集約）
- `remainingDaysThisSeason` の設定方法を決める（定数 or `.env`）
- UI 整形関数: `estimatedYear` → `"2028年"` のような **4桁＋年の文字列**（修飾語なし）

### Phase 1 — facounter取得・HTML保存

- `scripts/phaseXX_fetch_facounter_team_pages.(ts|mjs)` を追加
- 12球団分のURLを固定（`/count/*.html`）
- `_data/scraped_external/facounter/2026/{team}.html` に保存（差分更新）
- 取得失敗時のリトライ・レート制御・ログ出力

### Phase 2 — パース・正規化

- HTMLから表を抽出し、以下を正規化:
  - `teamKey`, `playerNameJa`, `uniformNumber?`
  - `domesticFaRemainYears`, `domesticFaRemainDays`
  - `status`（取得済/今季可能/通常）
- 例外（空セル、表記揺れ、*印など）を吸収

### Phase 3 — 名簿突合・派生JSON生成

- `_data/npb_roster_2026.csv` に全行を突合し、`npb_player_id` 単位に落とす
- `estimatedYear` を計算し、SSOTとして `_data/derived/player_fa_estimates/2026/npb_fa_estimates.json` を出力
- `unresolved` レポート（例: `_data/reports/facounter_unresolved_2026.json`）も生成

### Phase 4 — API結線（profile-merged統合 or 専用API） ✅

- `GET /api/players/[playerId]/profile-merged?year=2026` の payload に `faEstimate: { seasonYear, domesticFa }` をマージ（`lib/loadPlayerFaEstimate.ts`）
- キャッシュ: 既存の `jsonDerivedResponse` / `DERIVED_API_HEADERS_NO_STORE`（`no-store`）

### Phase 5 — UI反映（プロフィール欄） ✅

- 個人ページのプロフィール表に `FA取得（推定）` 行を追加（`displayValue` のみ表示）
- 出典は見出し `title` に facounter / 通算推定の注記（セル値に修飾語なし）

### Phase 6 — （なし）

- 本計画では **運用手順の整備はスコープ外**（計画書の作成で完了）。

## テスト・検証

- 2026名簿全員に対して `faEstimate` が存在する（または `unresolved` に理由付きで載る）こと
- 取得済・今季可能・年日表記の各パターンで、セルが **`YYYY年` または取得済／—** になること
- `remainingDaysThisSeason` を変えたときに年度推定が合理的に変わること

## リスク

- facounter側の表記揺れ（取得済/今季可能/*注記）や、特例措置未反映による誤差
- HTML構造変更によるパーサ破綻（監視とフォールバックが必要）
- 名簿表記揺れ（同姓同名・旧字体・スペース）による突合失敗

