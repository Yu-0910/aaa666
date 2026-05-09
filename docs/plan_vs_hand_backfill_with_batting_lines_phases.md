# 計画書: 対左右別（vs_hand）の「空打席」差分を出場成績表（battingLines）で埋める — フェーズ運用

## ゴール

- **対左右別（`split_type=vs_hand`）の PA/AB/BB/HBP/SH/SF などが、通算（total）と整合する**状態を運用で保証する。
- 「左右（R/L）」の精度は **`plateAppearances` で判定できた打席だけを正**とし、**不足分は `unknown` に寄せて埋める**。
- **過去試合の一括再生成**と、**今後の取得（日次/差分）の一括実行**を、同じフェーズ運用で回せるようにする。

## 背景（なぜ必要か）

- `vs_hand` は **打席ログ（`domain.plateAppearances`）から再構築**するため、`resultSummaryJa`/`pitchEvents` 欠損などで「結果が空」の打席が混ざると、
  - `vs_hand` 側だけ PA が足りない（または unknown に偏る）
  - 通算（total）は `battingLines` 等の別経路で正しく見える
  という差が出る。
- `battingLines` は「試合の合計値」であり、**R/L への分解はできない**。したがって、解決策は
  - **判定できた打席は R/L に入れる**
  - **不足分は unknown に入れて合計を合わせる**
 という設計になる。

## スコープ（今回の「埋める」対象）

- **必ず整合させる（P0）**
  - `PA`
  - `AB, BB, HBP, SH, SF`（このプロジェクトの PA 内訳）
- **可能なら整合させる（P1）**
  - `H, HR, SO` 等（`battingLines` にある整数）
  - ※不足分は unknown に寄せる（R/L への按分は禁止）
- **やらない（P2 / 後回し）**
  - 打点・得点・盗塁など、`plateAppearances` だけで確定できない項目の「左右別の再現」
  - （やるなら別の SSOT 定義が必要）

## 用語（初心者向け）

- **canonical**: `_data/scraped_games/canonical/{gameId}.json`。試合ごとの統合ログ。
- **plateAppearances (PAログ)**: canonical 内の「打席の配列」。投手 ID や打席結果（要約/一球）を持つ。
- **battingLines（出場成績表）**: canonical 内の「試合ごとの選手合計」。打席の内訳はあるが **左右は無い**。
- **空打席**: `plateAppearanceLastResultText(pa)` が空で、打席の結果確定ができない PA。

---

## 全体像（本計画のフェーズ）

この計画は「一気に実行できる単位」を 1 フェーズに詰めて、**フェーズ 1 → 2 → 3 → 4 → 5** で回す。

```
フェーズ 1（取得・更新）→ フェーズ 2（canonical 反映）→ フェーズ 3（派生一括: vs_hand 埋め含む）
                       → フェーズ 4（検証）→ フェーズ 5（定常運用: 日次/差分）
```

> 注: ここでの「フェーズ 1〜5」は **この計画書の段階（自然数）**。npm script 名の `phase10` / `phase11` 等（飛び番）とは別物。

---

## フェーズ 1 — 取得・更新（raw を揃える）

**目的**: 「空打席の原因」を後工程に持ち越さない。まず raw を最新化する。

**実行（例: 2026 年）**

- Sportsnavi: 日程・試合トップ・stats/text を取得（チーム運用のコマンドに合わせる）
  - 例（既存計画書の流れ）: `npm run phase0:sportsnavi:schedule` → `npm run phase1:sportsnavi:games` → `npm run phase2:sportsnavi:stats-text`
- Yahoo（必要な範囲）: `phase10`（一球ログ）を復元（欠損の多い試合/期間を優先）
  - 例: `python scripts/run_yahoo_phase10_restore.py --game-id <gameId>`

**完了条件**

- 対象期間について raw が更新され、少なくとも「試合前スナップショット未充足」は解消している（必要なら `docs/plan_phase2026_raw_text_completeness_and_refetch.md` の基準で診断）。

---

## フェーズ 2 — canonical 反映（一括）

**目的**: raw → canonical を揃え、さらに Yahoo `phase10` を canonical にマージする。

**実行（最小の一括単位にまとめる）**

- Sportsnavi raw → canonical
  - 例: `npm run phase2:sportsnavi:canonical`
- Yahoo `phase10` → canonical マージ
  - 例: `npm run phase4:merge:phase10`（またはチーム運用の merge 手順）

**完了条件**

- `_data/scraped_games/canonical/` が更新され、対象試合で `domain.plateAppearances` / `domain.battingLines` が入っている。

---

## フェーズ 3 — 派生一括（vs_hand 埋め込みを含めて一気に生成）

**目的**: canonical から派生 JSON を一括生成し、`vs_hand` は「battingLines で差分補完」までを SSOT とする。

### 3-A: 既存の派生（そのまま）

- 通算（`phase11`）: `_data/derived/player_season_batting/{year}/`
  - 例: `npm run phase11:build:batting` または `npx tsx scripts/phase11_build_season_stats_from_canonical.ts --year 2026`
- コンテキスト（`phase13`）, 巡目/状況（`phase15`）, カウント（`phase16`）, 期間（`phase17`）など
  - 例: `npm run phase3:derived:2026`

### 3-B: **新設（または `phase15` に統合）: vs_hand 派生を生成**

**成果物（案）**

- `_data/derived/player_season_batting_vs_hand/{year}/yahoo_{yahooBatterId}.json`
  - `rows`: `vs_hand` の `R/L/unknown` 行
  - `reconciliation`: 差分補完のログ（機械可読）

**集計ルール（仕様）**

- 入力:
  - `plateAppearances`（R/L 判定できた分）
  - `battingLines`（試合の合計を正）
- 手順（試合単位でやるのが安全）:
  1. 試合内の当該打者について、`plateAppearances` から `R/L/unknown` の暫定集計（既存の `updateBattingAggFromPa` と同じ略称解釈）。
  2. 同じ試合の `battingLines` から、その打者の **試合合計（AB/BB/HBP/SH と、可能なら H/HR/SO、さらに SF は PAログ優先 or text補完）**を取得。
  3. `delta = battingLinesTotal - (R+L+unknown from PAログ)` を計算。
  4. `delta` のうち **P0 指標（PA/AB/BB/HBP/SH/SF）と H/HR**（Phase 27 で追加）を、符号別に整合的に処理する:
     - **正の Δ（取りこぼし）**: `unknown` バケツに加算する（Phase 25=P0、Phase 27=H/HR）。
     - **負の Δ（二重計上）**: 当該試合の `unknown` → 多い方の R/L → もう片方の順でバケツから減算する（Phase 26=P0、Phase 27=H/HR）。
     - `R` と `L` への按分は禁止（推測になるため、正の Δ は必ず `unknown` 側のみ）。
     - 負の Δ を R/L から削るのは「対右/対左の打席を 1 件消す」ことになるが、`battingLines` が知らない過剰打席を残すよりは合計整合性を優先する。実際にどの打席を消したかは個別追跡せず、集計値だけ引く。
     - 在庫が足りず吸収しきれなかった分は `reconciliation.negativeUnabsorbedDelta` に残量として記録する（>0 のとき R/L 側に超過が残る）。

**「空打席」をどう扱うか（このフェーズの結論）**

- 空打席は「PAログの欠損」であり、左右は分からない。
- したがって **空打席ぶんは unknown に寄せる**。これが「出場成績表で埋める」の中身。

### 3-C: ランキング再ビルド（既存の一括に詰める）

- 例: `npm run rankings:rebuild`（または `npm run phase3:derived:2026:and-rankings`）

**完了条件**

- `vs_hand` の `R+L+unknown` が、通算（total）の P0 指標と一致する。
- `unknown` に「補完された差分」が入っていることを `reconciliation` で追える。

---

## フェーズ 4 — 検証（自動ゲート）

**目的**: “合ってそう”を禁止し、機械的に OK/NG を出す。

**追加/強化したい検証（案）**

- 1選手について:
  - `total.PA == vs_hand(R).PA + vs_hand(L).PA + vs_hand(unknown).PA`
  - 同様に `AB/BB/HBP/SH/SF` も一致
- 試合単位の検証（可能なら）:
  - `battingLines` 合計と `vs_hand` 合計が一致（P0）

**完了条件**

- 検証が “0 件エラー” で終わる（または既知の例外がリスト化されている）。

---

## フェーズ 5 — 定常運用（今後の取得ルール: 日次/差分）

**目的**: 将来も同じ手順で回せるようにし、手戻りを防ぐ。

### 5-1 日次（当日分が揃ったら一気に）

その日の試合が「試合終了」相当になったら、次を **まとめて 1 回**回す。

- フェーズ 1（当日分の raw 更新）
- フェーズ 2（canonical 更新 + `phase10` マージ）
- フェーズ 3（派生一括 + vs_hand 埋め + rankings）
- フェーズ 4（検証）

> 実務では 1 コマンドに束ねるのが理想（例: `npm run pipeline:daily:2026` のような別名を用意）。

### 5-2 差分（欠損試合だけやり直す）

- “空打席”や “中間表記で終わる” などの疑いがある `gameId` を特定し、対象だけ
  - raw 再取得 → canonical 再生成 → `phase10` 再取得/再マージ → フェーズ 3 再生成
  を回す（過去の計画書と同じ考え方）。

---

## 過去試合を「今後と同じ運用」に揃える（リトロ運用）

過去分は「期間を区切って」次を繰り返す（1 年・1 月など）。

- フェーズ 1: 期間の raw を（必要なら）再取得
- フェーズ 2: canonical を更新し、`phase10` を再マージ
- フェーズ 3: 派生を全再生成（vs_hand 埋め込み含む）
- フェーズ 4: 検証で OK を確認

**完了条件**

- 対象期間の `vs_hand` 合計が通算と一致し、unknown 補完の量が想定範囲に収まる（急増していれば `phase10` 欠損や取得漏れの疑い）。

---

## リスクと方針（重要）

- **unknown が増えるのは仕様**: `battingLines` で埋めた分は左右が不明なので unknown に入る。これは「嘘のR/L」を作らないための必要悪。
- **R/L を通算に合わせて按分してはいけない**: 見た目は綺麗になるが、分析として破綻する。
- **根本改善は別**: 可能なら `phase10` 取得・マージ改善で「空打席を減らす」ほど unknown 補完は減る。

---

## 参照（既存ドキュメント/実装）

- `docs/vs_hand_generation_notes.md`（対左右の設計メモ）
- `docs/yahoo_plate_appearance_batting_rules.md`（略称解釈の正）
- `docs/plan_unified_ranking_personal_stats_phases.md`（派生 `phase11` / `phase12` の SSOT）
- `docs/plan_phase2026_raw_text_completeness_and_refetch.md`（raw 未充足の診断と再取得）
- `lib/yahooGame/canonicalBattingSeasonAgg.ts`（通算の集計核）
- `lib/seasonStatsPilot.ts`（対左右の再構築・デバッグ）

---

## 付録: 実装の現状（Phase 25 / Phase 26 / Phase 27 / Phase 28 / Phase 29）

> 上記「フェーズ 1〜5」は本計画書の段階。下記の **Phase 25 / 26 / 27 / 28 / 29** は実装側の「対左右正常化」サブ Phase 番号で、**npm script の `phase25:` / `phase26:`（捕手系）とは別物**。

### Phase 25 — P0 取りこぼしを `unknown` へ加算

- 対象: `PA / AB / BB / HBP / SH / SF`。
- 実装: `loadVsHandRowsFromCanonicalWithDebug` が試合ごとに `target = computeBattingTargetForGameAndBatter`（出場成績ベースのハイブリッド集計）と PA 経路の `R+L+unknown` を比較し、**正の Δ を `unknown` バケツに加算**。
- 旧 `phase15b_build_vs_hand_backfilled_from_canonical.ts` は **DEPRECATED**（機能は phase15 = `loadVsHand` に統合済み）。

### Phase 26 — P0 二重計上を試合バケツから減算

- 対象: 同上 P0。
- 実装:
  - `applyNegativeP0DeltaFromGameBuckets`: 当該試合の `unknown` → 多い方の R/L → もう片方の順で減算。
  - 実況フォールバック（`buildTextFallbackPlateAppearances`）の **二重計上ガード**:
    - `paMap.size > 0` のときは実況で打席を足さない（既存の重複防止）。
    - **投手成績（`pitchingLines`）に当該 ID があるのに打席ログが無い試合は実況フォールバックを行わない**（中川 颯のように、投手として実況に出るだけで幽霊打席が積まれるのを防ぐ）。
- 出力: `reconciliation.negativeAppliedDelta` / `negativeUnabsorbedDelta` で吸収量・残量を機械可読に保存。

### Phase 27 — H/HR の Δ 整合 + battingLines のみ打者の出力 + 検証ロジック整理

- **H/HR の Δ 吸収**: `applyNegativeHGapFromGameBuckets`（過剰計上の減算: HR は `h-1, tb-4`、単打仮定は `tb-1` を連動）と `applyPositiveHGapToAggUnknown`（不足分は `unknown` に整合加算: HR は `h+1, tb+4`、単打仮定は `tb+1`）。
- **行出力条件の緩和**: `aggToVsHandRow` を呼ぶ判定を `agg.pa > 0 || agg.h > 0 || agg.hr > 0` に拡張（`pa=0` だが H/HR が補完されたケースも `unknown` 行として出る）。
- **phase15 の出力対象**: `domain.plateAppearances` だけでなく `domain.battingLines` のみに登場する打者（投手のエラー出塁のみ等）も対象にし、phase11 と件数を揃える（2026 で 320→327）。
- **`scripts/validate_vs_hand_totals_vs_phase11.ts`**: `negativeReconPlayers > 0` は **info 表示**に変更。`exit 1` の判定材料は `mismatches` と `missingSplits` のみ（`--fail-on-negative-recon` を付けたときだけ厳密化）。
- **`scripts/run_daily_npb_pipeline.mjs`**: DEPRECATED な `phase15b:build:vs-hand-backfill` の呼び出しを廃止し、validate も `validate:vs-hand-vs-phase11` をデフォルトで使うように修正。

### Phase 28 — 不明 PA を出場成績テーブルから R/L へ振り分け

- 動機: Phase 25 で `unknown` バケツへ寄せた PA は、`battingLines` には記録があるが
  `plateAppearances` に対応エントリが無い「薄い PA」。これらを **そのまま不明にせず、
  通算成績側の素材（出場成績テーブル）からチームと相手投手を逆引きして R/L へ振り分ける**。
- 仕組み:
  1. `cells[14..]`（回ごとの打席結果テキスト列）から「不明 PA の発生回 N」を特定
     （既存 PA がその回に存在しない／cells に非空テキストがある イニングが該当）。
  2. `pitchingLines` の `ip` を **三分の一イニング単位 (thirds)** で累積し、
     回 N に登板していた**防御側投手**を逆引き（`pitcherIntervalsFromPitchingLines`）。
     - 半回内に複数投手が登板（thirds 区間が重なる）した場合は、**全員の利き腕が
       一致するときだけ採用**。混在は不明にフォールバック（R/L 按分禁止の精神を維持）。
  3. cells のテキストを `parseCellResultToContribution` で `PA/AB/BB/HBP/SH/SF/H/HR/TB`
     に変換し、解決した `aggR` または `aggL` に直接加算。
- 実装ファイル:
  - 新規: `lib/yahooGame/cellResultToContribution.ts`,
    `lib/yahooGame/pitcherIntervalsFromPitchingLines.ts`,
    `lib/yahooGame/inferTeamsFromTextPbp.ts`（canonical の `scoreboard`/`teams` が空の試合で
    試合前情報テキスト → roster 集計の順にチーム情報を補強）。
  - 変更: `lib/seasonStatsPilot.ts`（Phase 28 ブロックを `applyPositiveP0DeltaToAggUnknown`
    の手前に挿入）、`scripts/phase15_build_pa_round_and_situation_from_canonical.ts`、
    `scripts/audit_vs_hand_full.ts`（reconciliation 内訳を出力／集計）。
- 出力フィールド（`reconciliation` に追加）:
  - `cellResolvedR`, `cellResolvedL` — R/L へ振り分けた `PA/AB/BB/HBP/SH/SF/H/HR/TB`。
  - `cellAmbiguousPas` — 半回内に複数投手登板で利き腕が混在し採用できなかった PA 数。
  - `cellPitcherHandUnknownPas` — 投手 ID は取れたが roster.throw_hand 未登録の PA 数。
  - `cellMissingTextPas` — cells のテキストが空／解釈不能の PA 数。
  - `cellTeamUnresolvedPas` — 打者のチームを判定できず投手区間を引けなかった PA 数。
- 結果（2026 シーズン audit; `audit:vs-hand-full`）:
  - `battersWithUnknown`: 86 → 78
  - `totalUnknownPa`: 133 → 118（−15、−11.3%）
  - 内訳: `cellResolved R=9 / L=6`、`cellTeamUnresolved=114`、`cellPitcherHandUnknown=4`。

### Phase 29 — canonical の `scoreboard`/`teams` 充足 + roster 整備（並行進行）

- 動機: Phase 28 の `cellTeamUnresolvedPas=114` のうち、ほとんどは
  「scoreboard は埋まっているが **中継ぎ投手の所属チームが startingLineup から
  引けない**ため `buildPitcherIntervalsByTeam` が intervals を返せない」ケースで
  あることが、`scripts/diag_phase29_one_batter.ts` の宮本丈サンプルで判明した。
  27 試合の `preParseFailed` の正体は **試合中止 (`canceled`)** で domain 全体が
  空のため Phase 28 の対象外。
- 実装:
  - `lib/yahooGame/pitcherIntervalsFromPitchingLines.ts`: 投手の所属チーム解決に
    **roster fallback** を追加。`teamForYahooPlayerId` → `inferPitcherTeamForNf3Line`
    → `roster.team が scoreboard.visitor/home と一致するなら採用` の 3 段。
  - `lib/seasonStatsPilot.ts`: 投手の利き腕解決を **Yahoo ID → roster.throw_hand**
    に切替（外国籍投手の表記揺れで `playerName` 一致が失敗するケースを吸収）。
  - `lib/seasonStatsPilot.ts`: `cellTeamUnresolvedSamples`（最大 10 件）を出力に
    加え、原因切り分けを容易にした。
  - `scripts/diag_phase29_canonical_and_roster_gaps.ts`: scoreboard 空のままの試合・
    未登録 Yahoo ID・throw_hand 未登録投手をまとめて棚卸し。
  - `scripts/diag_phase29_one_batter.ts`: 1 batter 単位で reconciliation サンプルを
    確認するスポットチェッカー。
- 結果（2026 シーズン audit; Phase 29 後）:
  - `battersWithUnknown`: 78 → 27（Phase 28 直後比）
  - `totalUnknownPa`: 118 → **29**（Phase 25 当初比 133 → 29 で **78% 削減**）
  - 内訳: `cellResolved R=66 / L=38`、`cellTeamUnresolved=17`、`cellAmbiguous=12`、
    `cellPitcherHandUnknown=0`（完全解消）。

#### Phase 29 追加修正（攻撃側 fallback + サマリ行補完 + 末尾延長）

宮本丈の最後の 1 PA を起点に追加調査した結果、`cellTeamUnresolved` と
`resolvePitchersForBatterInning=null` の双方を進められる 3 種の補完が見つかった:

1. **`lib/seasonStatsPilot.ts` 攻撃側 fallback (4 段目)**:
   `roster.team` が `visitor`/`home` と不一致でも、cells に打席結果がある全
   target inning について試合全体の `plateAppearances` から半回が一意に決まれば、
   その attack side を batter team として採用。
2. **`lib/yahooGame/pitcherIntervalsFromPitchingLines.ts` サマリ行補完**:
   出場成績テーブルが「サマリ行（IP 空）」と「詳細行（IP あり）」の 2 段構造で
   生成される試合があり、最終回担当の救援投手が詳細行に出ない試合が存在する
   （試合 2021038765 の松山晋也 [中日 9 回担当] など）。サマリ行に居て詳細に
   居ない投手を、末尾に「未確定区間 (FALLBACK_PITCHER_TAIL_THIRDS=999)」として
   補完。
3. **`lib/yahooGame/pitcherIntervalsFromPitchingLines.ts` 末尾延長**:
   サヨナラ等で Sportsnavi の出場成績側に 9 回裏の救援投手が 1 行も載らない
   試合（試合 2021038802 西武 9 回裏など）がある。「最後の投手の `endThirds` を
   末尾まで延長する」ことで、最終回もその投手の続きと仮定して利き腕を解決。

- 結果（2026 シーズン audit; Phase 29 追加修正後）:
  - `battersWithUnknown`: 27 → **14**
  - `totalUnknownPa`: 29 → **15**（Phase 25 当初比 133 → 15 で **89% 削減**）
  - 内訳: `cellResolved R=78 / L=40`、`cellTeamUnresolved=3`、`cellAmbiguous=12`、
    `cellPitcherHandUnknown=0`、`cellMissingText=0`。
- 残（運用上の許容範囲、これ以上はコスパが悪いので固定化）:
  - **12 PA = `cellAmbiguous`**: 半回内に右投手と左投手が同時登板する救援ローテで、
    thirds 単位では片方に確定できないケース（推測禁止の方針で `unknown` のまま）。
  - **3 PA = `cellTeamUnresolved`**: rosterTeam が visitor/home と不一致 or roster
    未登録の batter (1900045 / 1800008 など)。canonical の `statsPlayerLinkedRows`
    のチーム別 2 表構造をビルダー側で復元すれば解消する余地がある。

### 残課題（メモ）

- `audit:vs-hand-full` で `battersWithGap` が 数件残る（柳田・桑原など、`u.h` が ±1 で trade-off）。`totalGap` は全列ゼロのため運用上は許容。気になるなら個別調査。
- 「投手のみ試合」打者など、`phase15` の splits は出るが `vs_hand` 行が全部空になるケースがある（`hasAnyAgg` で行が出ないだけで合計には影響しない）。
- npm `phase25:` / `phase26:` は **捕手系の派生**で、ここで言う Phase 25/26/27/28/29（対左右の正常化）とは別ライン。混同に注意。

