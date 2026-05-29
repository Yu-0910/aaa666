# 計画書: 打席結果の主軸を「出場成績」に寄せ、不足分を一球ログで補完する（Phase 分割）

## 1. 目的

**関連（より厳密な「打席結果＝出場のみ」運用）**: `docs/plan_plate_result_appearance_only_operation_phases.md`

各種ページの打撃関連数値の更新において、**打席ごとの結果の正として「出場成績」内の各打席結果を優先**する。  
出場成績だけでは足りない指標・状況は **一球ログ（および既存の実況・補助データ）で補完**する。

本計画の **全 Phase 完了後** に次を実施する（**一括再生成は Phase 4 のゲートを満たし、かつ Phase 5 の標準手順を完了したあと**に **Phase 6** で行う）。

1. **これまで蓄積した派生データを、新方式で一括再生成**する（**Phase 6**）。  
2. **運用方針ドキュメント**（パイプライン手順・データ優先ルール）を新方式に合わせて更新する（**Phase 6〜7**）。  
3. **日次・一括の派生生成コマンド**が、追加作業なしで **新方式がデフォルトで実行される**状態にする（**Phase 6**）。

---

## 2. 新方式の原則（データ優先順位）

| 区分 | 主に使うソース | 補足 |
|------|----------------|------|
| 打席ごとの結果（公式表に近い文言・集計の土台） | **出場成績**（打席列／関連 DOM） | 行数・順序の検算を必須とする |
| 出場成績に無い・曖昧な部分 | **一球ログ** | 下記「補完ルール」に従う |
| 得点圏など「その打席時点の走者状況」が要る指標 | **一球ログ**（および canonical 上の打席コンテキスト） | 出場成績の結果セルのみでは原則不足 |
| 球種・コース等の配球ページ | **一球ログ** | 出場成績では代替不能 |
| 対左右（投手の右投げ／左投げ別） | **第1**: 打席に紐づく投手 ID・ログ。**第2**: **投手成績表の「打者」欄** | イニングごとに「どの打者がどの投手と対戦したか」が表に並ぶ想定。ログと矛盾したときの優先順位を仕様で固定する |

### 2.1 明示する補完ルール（要件として固定）

- **足りない部分があれば、一球ログで補う。**  
- **「得点圏」のような「状況付き」指標は、ログで補う。**  
- **「球種・コース」のページは、ログで補う。**  
- **対左右の投手別成績**について、打席単位の投手特定がログで弱い場合は、**投手成績の「打者」欄**を参照し、各イニングの各打者がどの投手と対戦しているかを突き合わせて補う（投手名・ID を名簿と照合し左右を付与）。

---

## 3. スコープ

- **対象**: 打撃派生・個人ページの打撃系表示に関わる canonical 取り込み以降の処理、および関連ドキュメント・検証スクリプト。  
- **対象外（変更しない）**: 球種・コースページそのものの「データソース＝一球」という前提（表示ロジックの主材料は引き続きログ）。

---

## 4. Phase 別作業計画

### Phase 0: 現状整理と仕様固定

- 現行の「出場成績行（`battingLines`）」「打席テキスト列（`statsPlayerLinkedRows` 等）」「`plateAppearances`」の対応関係を図示し、**新方式での正の定義**（どのフィールドを第一とするか）を文書化する。  
- 投手成績「打者」欄を第2ソースに使う場合の **突合キー**（試合 ID・回・表裏・打順・打席順）と、**件数不一致時のフォールバック**（ログのみ／不明バケツ／試合除外）を決める。  
- 既存のハイブリッド集計・検算（行とログのズレ検知）との差分を列挙する。

**完了成果物（2026-05-14）**: `docs/batting_appearance_primary_phase0_spec.md`（上記3点を1ファイルに集約。投手成績表の DOM 確定は Phase 1 へ委譲）。

### Phase 1: 取り込み・canonical 拡張（必要最小限）

- 出場成績の各打席結果を **正規化した形**で canonical（または中間層）に載せられるようにする。  
- 投手成績表から **打者列と対戦関係**をパースし、試合単位の構造化データとして保持できるようにする（スキーマ案・保存場所を決定）。  
- 一球ログとの **順序整合**用のユニットテスト／診断サンプルを用意する。

**完了成果物（2026-05-14）**: `docs/batting_appearance_primary_phase1_implementation.md`  
- `BattingLine.appearancePaSlotsJa` / `PitchingLine.appearanceVsBfSlotsJa`（`cells[14..]`）  
- `lib/yahooGame/appearanceStatsTrailingCells.ts`（抽出・`N`/`M` 簡易診断）  
- `buildCanonical.ts` と `sportsnaviStatsTextParse.mjs` の同期  
- `npm run validate:appearance-phase1`（`scripts/validate_appearance_phase1_unit.ts`）

### Phase 2: 派生集計ロジックの切替

- シーズン打撃派生・対左右・得点圏などの集計エントリで、**主軸を出場成績の打席結果に切り替え**、不足分のみログ（および Phase 1 で追加した投手成績由来）を参照する実装にする。  
- 既存の「二重計上防止」「試合単位検算」を **新方式用に更新**し、旧挙動との差分をログ出力できるようにする。

**完了（2026-05-14）— 第1段**  
- **打席結果の解決**: `plateAppearanceResolvedResultText`（`canonicalBattingSeasonAgg.ts`）。出場成績 `appearancePaSlotsJa` の非空セル数と dedupe 後の当該打者打席数が一致するときだけ、`paId`→スロット文言で上書き。それ以外は従来の `plateAppearanceLastResultText`。  
- **適用箇所**: `updateBattingAggFromPa`（任意 `doc`）、`updateRispFromPasInGame`、ハイブリッド内の PA 補完（`paSacFlyCountForBatterInGame` 等）、`aggregateBattingSeasonByYahooBatter`、`aggregateBattingSeasonByYahooBatterHybridForProfiles`、`seasonStatsPilot` の対左右。  
- **検証**: `npm run validate:appearance-phase1` に Phase 2 zip の assert を追加。  
- **未着手（後続）**: `N !== M` 時のフォールバック分岐・運用ログ・旧挙動との差分レポートの自動化。

### Phase 3: 検証・ロールバック準備

**準備完了（2026-05-14）** — 手順・フラグ・診断のたたき台: `docs/batting_appearance_phase3_prep.md`

- **ロールバック**: 環境変数 `TOPPAGE_APPEARANCE_PRIMARY`（`0` / `false` / `off` / `no` で zip 無効）。`lib/yahooGame/appearancePrimaryFeatureFlag.ts`。
- **自動検証（レポート生成）**: `npm run appearance:phase3` → `docs/batting_appearance_phase3_last_run.md` を上書き。

**本番タスク（未完了）**

- 代表試合・既知の難例試合（代打連打、表の欠損、投手交替直後など）で **旧方式 vs 新方式**を比較するレポートを出す。  
- ゴールデン試合・本番サンプルでの回帰のたたき台（レポート形式・差分の見方）を固める（**Phase 4（ゲート要件）・Phase 5（実施順）**に接続）。

### Phase 4: 再生成前テスト（ゲート）

**本番の一括再生成（Phase 6）に入る前に満たすべき合格基準と成果物。** 実際の作業の **標準順序は Phase 5**（canonical 整備からチェックリスト完了まで）。次の要件を満たすまで Phase **6** に進まない。

- **チェックリスト（運用）**: `docs/batting_appearance_phase4_gate_checklist.md`
- **差分許容・Go/No-Go 案（草案）**: `docs/batting_appearance_phase4_diff_thresholds_proposal.md`
- **ロールバック自動検証**: `npm run validate:appearance-rollback`

- **自動テスト**: 新方式前提の `validate:*`／ユニット／§6.3 のゴールデン試合（`N`/`M`/zip）を **CI または手動チェックリストで必須化**し、失敗時は修正ループに戻す。  
- **限定再生成（スモーク）**: 全試合ではなく **少数試合・少数選手**、または `_data/derived` のコピー／ステージング出力先で派生を再生成し、**個人ページ・API・ランキング相当 JSON** のスモークを実施する。  
- **差分の閾値と Go/No-Go**: 旧 vs 新の差分レポートに対し、**許容差分**（例: 衆知の難例を除く試合数、指標ごとの最大差）を文書化し、**プロダクトオーナーまたは運用責任者の承認**を得てから Phase **6** へ移行する。  
- **ロールバック確認**: Phase 3 の旧フラグで **1 試合分以上**戻せることを再現テストで確認する。

### Phase 5: canonical 再ビルドとゲート実施の標準順序

**ボトルネック解消と Phase 4 ゲートの実施を、この順で行う（コード変更より先にデータを揃える）。** 完了後に Phase **6**（一括再生成）へ進む。

**一括エントリ**: `npm run appearance:phase5`（①②を連続実行し、③④の手順を標準出力に表示。`--skip-canonical` で②のみ。`--game-ids` で対象試合を変更可）

1. **canonical の再ビルド** … 対象年度・試合について、出場成績末尾列（`appearancePaSlotsJa` 等）が JSON に載るよう **sportsnavi 系の canonical 再生成**を行う（例: `npm run phase2:sportsnavi:canonical`、または `node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year … --game-ids … --force`）。  
2. **`npm run appearance:phase3`** … `docs/batting_appearance_phase3_last_run.md` で N/M・zip が意味のある状態か確認する。  
3. **旧 vs 新のスモーク** … `TOPPAGE_APPEARANCE_PRIMARY=0` と通常（zip 有効）で、**同一の限定範囲**の派生を再生成し差分をレビューする（閾値案: `batting_appearance_phase4_diff_thresholds_proposal.md`）。  
4. **Phase 4 チェックリストの完了** … `docs/batting_appearance_phase4_gate_checklist.md` の A〜F を埋め、Go/No-Go を確定する。

### Phase 6: 過去データの再生成と運用接続

- **全対象年度・全試合の派生データを新方式で一括再生成**する手順を確定し、`README.md` または `docs/data_operation_rules.md` に **正式手順**として追記・更新する。  
- `npm run` 系の日次・一括パイプラインで、**デフォルトが新方式**になるようスクリプト入口を差し替える（旧方式は明示フラグ時のみ）。  
- `validate:*` 等の既存検証を新方式前提に更新し、CI／手動のどちらで必ず通すかを明記する（Phase 4 で定めたゲートを **本番パイプラインでも維持**する）。

### Phase 7: クローズ

- 運用ドキュメントの最終レビュー、フラグ撤去の是非判断、関係者への周知を完了し、本計画をクローズとする。

---

## 5. 完了条件（受け入れ基準）

- **Phase 4（再生成前テスト）**の要件を満たし、**Phase 5（標準順序）**を完了したうえで **CI／手動ゲートがすべて緑**であること（承認記録またはチェックリストの保管）。  
- 一括・日次の派生生成を **追加オプションなしで実行したとき、新方式のみが走る**（**Phase 6** 完了時）。  
- `docs/data_operation_rules.md`（および必要なら `README.md`）に、**データの正の優先順位**と**再生成手順**が記載されている。  
- 得点圏・球種・コースは **ログ由来**であることがコードまたはドキュメントで追跡可能。  
- 対左右は **ログ＋投手成績「打者」欄のフォールバック**が仕様化され、欠損時の挙動が文書化されている。  
- **出場成績の打席列と、canonical 上の打席一覧**について、下記「6.」の検算・不一致時フォールバックが実装・文書化されている。

---

## 6. 「表の並び」と「裏の打席の並び」がズレる問題：要因と対策

### 6.1 初心者向けの説明

出場成績は **「打席が終わったあとの結果」が横に並んだリスト**、一球ログは **「一球ずつのメモ」が積み上がったもの**です。  
ここで **「1打席＝表のマス1つ」** と **「ログ側で数える打席」** の数え方が少しでも違うと、**上から順にくっつける**やり方では **途中から全部ずれた別打席**として解釈されてしまいます。

### 6.2 「ボール」「妨害」などはズレの要因になり得るか

**なり得ますが、単体の言葉というより「打席の数え方の違い」が本体です。**

- **ボール**のように、**打席の最終結果ではない**中間の行や表現は、一球ログ側に **「打席そのもの」ではない行**として現れます。これを誤って **打席1つ分**として数えたり、表のマスと **1対1で機械的に並べたり**すると、表よりログ側の「打席候補」が **多すぎる／少なすぎる** になり、**並びのズレや件数不一致**の原因になります。  
  → 対策としては、ログ側で **「打席の区切り」と「最終結果だけを1打席とみなす」** ルールを仕様に明記し、**表のマス数とログ由来の打席数が一致するか**を試合単位で検算する。

- **妨害**（審判の妨害、走者の妨害など）のような **レアな表記**は、表とログで **文言や省略形が違う**ことがあります。パース上「これは打席の結果として数える／数えない」が片方だけズレると、同様に **対応付けが壊れる**ことがあります。  
  → 正規化ルール（同義語・除外語）と、**一致しない試合のフォールバック**（下記 6.3）が必要。

つまり、「ボールを飛ばす」こと自体がズレを **作る** のではなく、**表は「終わった打席」だけ並ぶのに対し、ログは途中経過や特記が混ざり得る**ため、**除外・正規化のルールが表側と噛み合わない**とズレの要因になります。

### 6.3 対策（計画に含める実装・運用要件）

1. **「1打席」の定義を表側で固定する**  
   出場成績の **結果セル1マス＝公式上の打席スロット1つ** を正とし、その個数を `N` とする。

2. **ログ側の「打席リスト」の定義を固定し、件数 `M` と `N` を必ず比較する**  
   - `N === M` のときだけ、**順序どおりの zip（対応付け）** をデフォルトとする。  
   - `N !== M` のときは **機械的な zip を禁止**し、仕様で決めたフォールバックへ進む（例: ログのみで左右・状況を補い、表との打席対応は行わない／試合を検証キューに送る／既知アルゴリズムでギャップ推定 など）。フォールバックの優先順位は Phase 0 で文書化する。

3. **突合キーを「順番だけ」にしない**  
   可能な範囲で **試合 ID・回・表裏・打順（および同一打順内の連番）** など、表とログの両方に載るキーで **スロットを識別**し、順番がズレても **局所再同期**できるようにする（実装コストと効果のトレードオフは Phase 1 で評価）。

4. **診断・監視**  
   件数不一致・zip 失敗の試合 ID を **ログまたはレポートに集計**し、再発パターン（欠損 HTML、幽霊打席、表記ゆれ）を運用で追えるようにする。

5. **ゴールデン試合（既知の難例）の回帰テスト**  
   ボール進行のみの行・妨害表記・犠打と併殺などが混ざる代表試合を固定し、**`N` と `M` と zip 結果**が期待どおりかを自動検証する。

### 6.4 Phase への反映

- **Phase 0**: 上記「1打席の定義」「ログから除外する行の一覧（ボール等）」「表記ゆれの正規化方針」を仕様に書く。  
- **Phase 1**: `BattingLine.appearancePaSlotsJa` による **N** の材料、`diagnoseBattingAppearanceSlotsVsPlateAppearances` による **M** との試合単位比較、ユニット `validate:appearance-phase1`。  
- **Phase 2（第1段）**: `buildAppearanceZipResultOverrides` / `plateAppearanceResolvedResultText` により **N===M のときだけ** 集計・RISP・対左右の打席結果を出場成績スロットに合わせる。`N!==M` のフォールバック・ログは継続タスク。  
- **Phase 3**: 旧 vs 新レポート、ロールバックスイッチ、難例の手動レビュー方針。  
- **Phase 4**: ゴールデン試合・`validate:*`・限定再生成スモークを **再生成前の必須ゲート要件**として定義し、不一致試合の許容率・Go/No-Go を確定する。  
- **Phase 5**: **canonical 再ビルド** → **`appearance:phase3`** → **旧新スモーク** → **Phase 4 チェックリスト完了**の標準順序でゲートを実施する。  
- **Phase 6 以降**: 一括再生成後も、Phase 4 と同一の検証を **本番パイプラインで継続**する。

---

## 7. 主要リスク（計画段階のメモ）

- 出場成績のセル数と打席数の不一致による **順序ズレ**。  
- 投手成績表と一球ログの **矛盾**（優先順位の不備による左右別の誤分類）。  
- 再生成のコスト（全試合・全選手の再計算時間とストレージ）。

---

## 8. 関連ドキュメント（更新予定）

- `docs/data_operation_rules.md` … 運用方針・再発防止・パイプライン順序の更新  
- `docs/batting_appearance_primary_phase0_spec.md` … Phase 0 仕様（canonical 内の対応）  
- `docs/batting_appearance_primary_phase1_implementation.md` … Phase 1 実装（末尾列 canonical・検証コマンド）  
- `docs/batting_appearance_phase3_prep.md` … Phase 3 準備（旧 vs 新・ロールバック・診断）  
- `docs/batting_appearance_phase4_gate_checklist.md` … Phase 4 再生成前ゲート（チェックリスト）  
- `docs/batting_appearance_phase4_diff_thresholds_proposal.md` … Phase 4 差分許容・Go/No-Go 案（草案）  
- `README.md` … 一括生成コマンドのデフォルト挙動の記載（必要なら）  
- `lib/yahooGame/canonicalBattingSeasonAgg.ts` 周辺のコメント・仕様と整合させる

---

## 9. 改訂履歴

| 日付 | 内容 |
|------|------|
| 2026-05-14 | 初版作成 |
| 2026-05-14 | §6 追加（表とログの並びズレ：要因・ボール/妨害等・対策・Phase 反映）。§5 完了条件に §6 への言及を追加。節番号整理 |
| 2026-05-14 | Phase 0 完了: `docs/batting_appearance_primary_phase0_spec.md` を追加。`docs/yahoo_npb_game_data_integration_plan.md` Phase1表#6（ソース優先）を出場成績主軸に更新し整合 |
| 2026-05-14 | **Phase 4「再生成前テスト（ゲート）」を新設**。旧 Phase 4〜5 を Phase 5〜6 に繰り下げ。§1・§5・§6.4 を整合 |
| 2026-05-14 | **Phase 1 完了（canonical 拡張）**: `appearancePaSlotsJa` / `appearanceVsBfSlotsJa`、`appearanceStatsTrailingCells.ts`、`npm run validate:appearance-phase1`。`docs/batting_appearance_primary_phase1_implementation.md` |
| 2026-05-14 | Phase 4 ゲート文書: `batting_appearance_phase4_gate_checklist.md`、`batting_appearance_phase4_diff_thresholds_proposal.md`、`npm run validate:appearance-rollback` |
| 2026-05-14 | **計画 Phase 5 新設**（標準順序: canonical → `appearance:phase3` → 旧新スモーク → Phase 4 チェック）。旧一括再生成・クローズを **Phase 6〜7** に繰り下げ |
| 2026-05-14 | **Phase 5 実行エントリ**: `npm run appearance:phase5`（`scripts/run_appearance_phase5_pipeline.mjs`）。計画 §4 Phase 5 に追記 |
