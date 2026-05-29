## データ運営ルール（サイト運営向け）

### 一括取得方針（2026以降・本番）

**方針（固定）**: 打席結果および通算打撃（安打・打数・三振など）は、**出場成績表の末尾列**（`appearancePaSlotsJa` / `statsPlayerLinkedRows[].cells[14..]`）**のみ**を正とする。一球ログの `resultSummaryJa`・最終球 `resultJa`、出場行の数値列（`line.ab` / `line.h`）による打席結果の上書きは **本番では使わない**。

| 層 | 環境変数 | 本番既定 | 効果 |
|----|----------|----------|------|
| 打席ごとの確定文言 | `TOPPAGE_PLATE_RESULT_SOURCE` | 未設定 = **`appearance_only`** | zip に載った出場文言のみ。未該当打席は空（要約・一球へフォールバックしない） |
| 通算・ランキング | `TOPPAGE_BATTING_SEASON_AGG` | 未設定 = **`appearance_slots`** | 末尾列の非空セルごとに `isAtBat` / `hitBases` で積み上げ |

実装: `lib/yahooGame/plateResultSourceFeatureFlag.ts` / `battingSeasonAggSourceFeatureFlag.ts`。日次は `run_daily_npb_pipeline.mjs` の `childEnv` で両方を明示。

**トップページ表示（指標名・上位選手・数値）**: ランキングページ用 JSON（Phase12/19/28）から **切り出した軽量スナップショット**を日次一括の末尾で再生成する。TOP タブは `top-leaders:build:2026`、今週タブは `phase28:build:weekly-rankings` のあと `top-weekly-leaders:build:2026`。指標ラベル（OPS・打率・防御率など）は `loadMetricsFromRecord()` 等の **Record 定義と同一**（手書きしない）。

### 一括取得：依存順序・完了定義・再発防止（2026-05 更新）

打席結果の正（出場末尾列）と **一球ログ（球種・ゾーン・CS）** は別レイヤー。**一球は「ファイルがある」ではなく「中身がある」まで完了**とみなす。

#### 原則（4つ）

| # | 原則 |
|---|------|
| 1 | **打席結果・通算打撃の正**は出場成績末尾列のみ（上表の環境変数）。一球の `resultSummaryJa` は球種・ゾーン・CS 用で、打席結果の正には使わない。 |
| 2 | **依存順序を固定**する。後段は前段の成果物が揃ってからだけ動かす（下記パイプライン順）。 |
| 3 | **`derived/{gameId}_phase10_restored.json` の存在 ≠ 完了**。`pitchRows.length > 0`（または試合中止）だけを Phase10 完了とする。空配列の JSON は **未完了**とみなし、restore を再実行する。 |
| 3b | **二死・走者アウトで3アウト・打者打席結果なし**の打席は、Yahoo の `score?index=` に投球詳細表が **無い仕様**。`pitchEvents` 欠損を修復対象に **含めない**（`missingOrPartial` は `runner_out_ends_half_no_ab`）。敬遠と同様に **再取得では埋まらない**。 |
| 4 | **Phase2b で canonical を作り直した試合**は、同じ日付範囲で **必ず Phase4（復元＋マージ）** を実行する。 |
| 5 | **トップページの指標名・数値**は `public/data/rankings/`（通算）と週間ランキング JSON を正とし、**Phase12/19/28 のあと**に `top-leaders` / `top-weekly-leaders` を必ず実行する（ランキングだけ更新してトップを古いままにしない）。 |

#### 推奨パイプライン順序（1試合・日次の最小セット）

| 順 | 段階 | コマンド（代表） |
|----|------|------------------|
| 1 | 日程（gameId + **球場名**） | `phase0:sportsnavi:schedule` … 同一 HTML から `stadiumByGameId` を保存。球場別打撃（Phase 13）は **score メタ不要** |
| 2 | 試合トップ raw | `phase1:sportsnavi:games` |
| 3 | 出場成績・テキスト raw | `phase2:sportsnavi:stats-text` |
| 4 | 不完全 stats/text 再取得 | `phase2:sportsnavi:stats-text:refetch-incomplete`（**日次必須**） |
| 5 | 一球 score HTML | `phase2:sportsnavi:score-raw`（**`--no-score-raw` にしない**） |
| 6 | canonical | `phase2:sportsnavi:canonical`（日次は `--only-stale`、埋め直しは `--force`） |
| 7 | 一球復元 → マージ | `phase4:yahoo:pitch-by-pitch`（`run_yahoo_phase10_restore.py` + merge） |
| 8 | 実況補完（任意） | `backfill:canonical:plate-appearances-from-text`（打席結果の正には使わない） |
| 9 | **品質ゲート** | 下記「完了の定義」 |
| 10 | 派生 | Phase11〜17/7 等（日次は `run_daily_npb_pipeline.mjs` の派生ブロック） |
| 11 | 通算ランキング JSON | `phase12:build:rankings` → `phase19:build:pitching-rankings`（各リーグに **`team-games.json`** を同梱。率系 `{指標}.json` は規定到達者のみ） |
| 12 | 週間ランキング JSON | `phase28:build:weekly-rankings`（**Phase17/7 後**。週別 **`team-games.json`** + 率系絞り込み） |
| 13 | トップ表示スナップショット | `top-leaders:build:2026` → `top-weekly-leaders:build:2026`（**2026 は率系に規定フィルタあり**） |
| 14 | 規定 SSOT 検証（任意） | `validate:ranking-qualifying-2026`（`team-games`・OPS/防御率 JSON の整合） |

**禁止・非推奨**

- 本番日次で **`--skip-yahoo-phase10`** を既定にしない（球種・ゾーン・`pitchEvents` が空のまま残る）。
- **Phase2b より前に Phase4 だけ**回す（当時 canonical が無く、空の `pitchRows` だけ残る）。
- **Phase2b `--force` のあと Phase4 を回さない**（HTML は後から揃っても解析がスキップされる）。

#### 完了の定義（ゲート）

一括のたびに、少なくとも次を満たす。**中止試合を除き「score HTML あり & `pitchRows` 空」が 0 件**であること。

| チェック | コマンド | 合格の目安 |
|----------|----------|------------|
| 三種 raw | `npm run diag:triple-raw-gap` | 中止除き **0 試合** |
| score HTML | `npm run diag:sportsnavi-score-raw-coverage` | 実施試合は **meta_match** |
| 一球 JSON | `npm run diag:pitch-by-pitch-coverage` | **score あり & pitchRows 空 = 0**（中止除く） |
| 一球・打席 events | `npm run diag:missing-pitch-events-2026` | **修復対象の欠損打席 = 0**（仕様上の走者アウト終了は別表示） |
| 出場 canonical | `npm run validate:phase2-canonical-nonempty:fail` | 打撃皆無試合なし |
| トップ表示 JSON | `npm run top-leaders:build:2026`（日次末尾で実行） | `public/data/top-leaders/{年}/{CL\|PL}/batting.json` と `pitching.json` が書き込まれる（`skipped` のみで全滅しないこと） |

厳格モード（日次 `strictQuality` 既定）では、Phase4 のあと **`diag:pitch-by-pitch-coverage:fail`** も実行する（空 `pitchRows` が残ればパイプライン失敗）。

**トップの「今週」タブ**: 週初は試合数が少なく Phase28 が 0 件の指標を出すことがある（`top-weekly-leaders` が `skipped`）。通算 TOP タブ（`top-leaders`）は Phase12/19 が済めば更新される。週が進むと今週タブも追随する。

#### 復旧・バックフィル

| 状況 | やること |
|------|----------|
| シーズン初回・月次メンテ | `npm run daily:npb-pipeline:complete`（`--force-canonical` + `--yahoo-force`） |
| score HTML はあるが `pitchRows` 空 | **HTML の再取得は不要**。空 JSON を削除して `npm run reparse:empty-pitchrows-2026`（キャッシュ HTML から解析のみ） |
| キャッシュ疑い・欠損多 | `phase4:yahoo:pitch-by-pitch` に `--force`（HTML も取り直し・時間増） |
| Phase2b だけやり直した | **同じ `--from`/`--to` で Phase4 を必ず再実行**（マージまで） |

#### 運用カレンダー（目安）

| 頻度 | 内容 |
|------|------|
| **毎日** | `npm run daily:npb-pipeline`（`--skip-yahoo-phase10` なし、`--no-score-raw` なし） |
| **毎日（自動）** | `npm run watch:daily-pipeline` … 土日 18:00 / 平日 21:00（JST）から当日試合を監視し、全試合終了相当で `daily:npb-pipeline` を起動（§試合終了待ち監視） |
| **週1 or 月1** | `npm run diag:pitch-by-pitch-coverage` で空 `pitchRows` を監視。あれば `reparse:empty-pitchrows-2026` |
| **canonical 大量再生成後** | 必ず Phase4 + `phase14:build:pitch` + 必要な派生 |
| **球場別打撃が空・未設定** | `npm run rebuild:stadium-context:2026`（`repair:schedule-stadium-unset` で canonical から **未設定→球場名** + Phase13）。日次 Phase0 でも当日分の `stadiumByGameId` は更新される |
| **日程に無い canonical の球場** | `lib/stadiumInferFromCanonical.ts` … 2026-05-12/13 巨人–広島・2026-05-19 ヤクルト–巨人は **地方球場**。ホームは試合前情報の **後攻** → 無ければタイトル vs 左。`stadiumByGameId` が **未設定** の gameId も読込時に上書き補完 |
| **球場名の表記ゆれ** | SSOT: `lib/stadiumVenueNormalize.ts`（`normalizeStadiumSplitValue`）。**12球団本拠地以外はすべて「地方球場」**（空のみ「未設定」）。Phase0 保存・日程 map 読込・Phase13 集計・打者/投手 UI の dataKeys が同一マスタから派生。変更後は `npm run phase13:build:context` |

#### 試合終了待ち監視（`watch:daily-pipeline`）

手動で `daily:npb-pipeline` を叩く代わりに、**当日の公式戦が終了相当になるまでライブ監視**し、条件を満たしたら一括取得を起動する。

| 項目 | 内容 |
|------|------|
| コマンド | `npm run watch:daily-pipeline`（`scripts/watch_daily_pipeline.mjs`） |
| 監視開始 | **土日 18:00** / **平日 21:00**（JST）。タスク スケジューラは **毎日 18:00** に起動すれば、平日は 21:00 まで待ってからポーリング開始 |
| ポーリング | 既定 15 分間隔（`--poll-minutes`） |
| フォールバック | 翌 **02:30** まで未完了があっても `daily:npb-pipeline` を起動（`--deadline` で変更可） |
| 試合終了判定 | 各試合の index/stats/text を **ライブ fetch**（キャッシュは使わない）。`lib/yahooGame/sportsnaviGameWatchStatus.mjs` |
| 完了扱い | テキストに「試合終了」、または stats+text がパース可能、または中止・ノーゲーム |
| 未完了 | カード「試合前」、回表記（例: 9回裏）、「試合中」 |
| 二重起動防止 | `_data/scraped_games/_meta/watch_pipeline_YYYY-MM-DD.lock` |
| テスト | `node scripts/validate_sportsnavi_game_watch_status_unit.mjs` / `npm run watch:daily-pipeline:dry` |

Windows タスク スケジューラ例: `powershell -File scripts/invoke_watch_daily_pipeline.ps1` を毎日 18:00 に登録（ログオン時のみ実行でも可。長時間実行になるためスリープ無効を推奨）。

#### 二段階運用（20:30 先行取得 + 終了後の続き）

| 時刻 | コマンド | 内容 |
|------|----------|------|
| **20:30** | `npm run daily:npb-pipeline:prefetch`（`--fetch-only`） | Phase0〜Phase2b まで。過去分・当日の**既に終わった試合**の raw/canonical を進める。試合中は未充足のまま（正常） |
| **全試合終了後** | `npm run watch:daily-pipeline` → 内部で `daily:npb-pipeline:finalize` | 当日の stats/text 再取得・Phase4・検証・派生・ランキング |

手動で続きだけ実行する場合: `npm run daily:npb-pipeline:finalize`（`--finalize-only`）。

タスク登録の例:

1. 毎日 **20:30** … `scripts/invoke_daily_prefetch_2030.ps1`
2. 毎日 **18:00** … `scripts/invoke_watch_daily_pipeline.ps1`（平日は 21:00 から監視開始、終了後に finalize）

#### 再発メカニズム（2026-05 調査メモ）

1. 試合当日などに Phase10 が走り、**canonical／打席一覧が未整備** → `pitchRows: []` だけ保存された。  
2. あとから score HTML・canonical が揃ったが、**derived ファイルが存在するため restore がスキップ**された（実装は「ファイルがある＝済み」だった）。  
3. 派生（球種別など）は **ディスク上の canonical に `pitchEvents` が無い**試合が大量に残った。

**コード側の要件**（方針と一致させる）: `phase4_yahoo_pitch_by_pitch_pipeline.mjs` は空 `pitchRows` をスキップしない。`run_yahoo_phase10_restore.py` は打席 0 件で空 JSON を書いたとき警告終了する。

#### 成績データの正（2026-05 以降）

| 種類 | 正（本番） | 廃止（触らない・再生成しない） |
|------|------------|--------------------------------|
| シーズン打撃通算 | `_data/derived/player_season_batting/{年}/yahoo_*.json`（**Phase11**、canonical から日次再生成） | `_data/yahoo_games_pilot/batting_stats.csv` ほか **aggregate_phase3 系 CSV** |
| 対チーム・球場・ホーム/ビジター | `_data/derived/player_season_batting_context/{年}/yahoo_*.json`（**Phase13**。**Phase11 と同一 SSOT**・試合×打者で加算） | Phase13 の PA 単位ループ（廃止） |
| 対左右・巡目・状況など | `_data/derived/player_season_batting_splits/{年}/`（**Phase15** ほか） | — |
| ランキング | `public/data/rankings/`（Phase12/19 通算、Phase28 週間） | 同上 CSV |
| トップ TOP タブ（指標名・数値・リンク先） | `public/data/top-leaders/{年}/{CL\|PL}/{batting\|pitching}.json`（**top-leaders:build**） | ランキング JSON を手編集しない |
| トップ「今週」タブ | `public/data/top-leaders/weekly/...` + `public/data/rankings/weekly/{年}/current-week.json`（**phase28 → top-weekly-leaders**） | 通算 `top-leaders` だけ更新して週間を忘れない |
| 一球・球種・ゾーン（試合単位） | canonical + Phase10/14、必要時 `_data/yahoo_games_pilot/` の JSON/HTML | `pitch_details.csv` は参照用に残っていても **本番の打撃通算には使わない** |

- **日次・本番ビルドで CSV を更新・検証しない**（`validate:batting-stats` は削除済み）。
- 個人ページ API（`mergePilotSeasonStatsWithDerived`）は **Phase11 がある選手は CSV を読まない**（ファイルが無ければ空配列）。
- 3月パイロット用に `aggregate_phase3.py` で CSV を作る運用は **再開しない**。

#### A. canonical の取り込み（取得）

スポナビ・Yahoo の **取得コマンド自体は従来どおり**。ただし **出場成績 HTML が canonical に載ること**が、上記方針の前提になる。

| 順 | 用途 | コマンド |
|----|------|----------|
| 1 | 日次一括（推奨） | `npm run daily:npb-pipeline`（Phase0〜2a-b → **Phase2b canonical → Phase4 一球** → ゲート → Phase11 派生 → Phase12/19/28 ランキング → **top-leaders / top-weekly-leaders**（トップの指標名・数値）。§「依存順序・完了定義」参照。**pilot CSV は使わない**） |
| 2 | 出場表が薄い・空の試合の再取得 | `npm run appearance:stats-refetch-incomplete` |
| 3 | 指定試合の raw 再取得 → canonical 再生成 | `npm run appearance:replay-plate-canonical -- --year 2026 --game-ids <id>` |
| 4 | 品質ゲート（派生前） | `npm run validate:phase2-canonical-nonempty`（NG なら 2 を繰り返す） |
| 5 | 一球速報（`score?index=` 記録文・球種等） | 日次は **Phase4 既定で実行**。打席結果の正には使わない。**盗塁死（CS）の正**はここ由来の `domain.runnerEvents`（`sourceTier: score`）のみ。CS だけなら **§「score raw 一括取得」** の軽量経路 |
| 6 | **対左右別（vs_hand）の投手 ID** | 各打席の `yahooPitcherId` は **一球ログ → 実況タイムライン** で補完（`resolvePitcherIdByPaId.ts`）。**carry-forward / BF 割当は使わない**。欠損試合は Phase10 再取得 → Phase15 再生成。診断: `npx tsx scripts/diag_vs_hand_one_game.ts <yahooId> <gameId>` |

**注意**: stats 行が空の canonical では、出場のみ運用ではその試合の打撃が **0 扱い**になり得る。派生の前に **2・4 で潰す**。

#### 一球速報（Phase4／Phase10）— 詳細

##### `paId` の末尾は打順ではない（必読）

| 項目 | 内容 |
|------|------|
| **形式** | `{gameId}-{inning}-{表\|裏}-{paSeqInHalf}` |
| **paSeqInHalf** | その半回における **打席の通し番号**（1 始まり）。Yahoo `score?index=` のキー・Phase10 の `bat_order`・実況 `textPlayByPlay` の行頭 **`N：`** の **N** と一致 |
| **打順（1〜9番）ではない** | 例: `2021038681-4-表-6` = 4回表の **6番目の打席**（桑原・1番打者のけん制盗塁死）。外崎 **6番打者** の HR は **`4-表-2`**（2番目の打席）に一球あり |
| **SSOT** | `lib/yahooGame/paIdFormat.ts`（`parsePaId` / `buildPaId`）。Python: `scripts/pa_id_format.py` |
| **診断・実況突合** | `N番` 打者表記で paId を解釈しない（`pitchByPitchRunnerOutNoAb.ts`） |

一球ログは **`run_yahoo_phase10_restore.py`**（打席一覧 → 各打席の `score?index=` を **キャッシュ HTML 優先**で解析）で `_data/scraped_games/derived/{gameId}_phase10_restored.json` を組み立て、**`phase4:yahoo:pitch-by-pitch` 経由で canonical にマージ**する。

**一括方針の要約**は上記 §「一括取得：依存順序・完了定義・再発防止」に集約。以下は欠損パターン別の対応表。

| 欠損要因 | 一括での対応 |
|----------|--------------|
| **二死・走者アウトで3アウト・打者結果なし**（盗塁失敗・けん制タッチアウト等） | **修復しない**。Phase10 は `score:{index}:runner_out_ends_half_no_ab` を付与。判定: `lib/yahooGame/pitchByPitchRunnerOutNoAb.ts`（実況 `textPlayByPlay` 優先）。打席結果の正は出場末尾列（当該打席は **スロット空** になり得る） |
| Phase4 未実行（`--skip-yahoo-phase10` 等） | 本番日次では **スキップしない** |
| canonical が無い | **Phase2b のあと**に Phase4。`validate:phase2-canonical-nonempty` |
| 打席一覧がテキストから取れない | Phase2b 済み + **`appearance:stats-refetch-incomplete`**。canonical の `paId` でフォールバック |
| score 取得失敗 | `missingOrPartial` を確認。`--force` または `reparse:empty-pitchrows-2026` |
| **空 `pitchRows` の derived が残り restore スキップ** | **空 JSON は未完了**。削除して再 restore（`reparse:empty-pitchrows-2026`）。Phase4 は **pitchRows>0 のときだけスキップ** |
| Phase2b `--force` のみ実施 | **同範囲で Phase4 必須** |
| 並列実行 | 同一試合の canonical／derived を同時に触らない |

**診断コマンド**: `npm run diag:pitch-by-pitch-coverage`（`--fail` でゲート）。打席単位の欠損は `npm run diag:missing-pitch-events-2026`（**修復対象**と**仕様上**を分離）。他: `diag:triple-raw-gap` / `diag:sportsnavi-score-raw-coverage` / `diag:phase2-raw-completeness`。

**2026 調査メモ（5打席欠損）**: **5打席とも**「走者アウト終了・打者結果なし」。`2021038681` の外崎 2ランHR は **`4-表-2` に `pitchEvents` あり**（欠損の `4-表-6` は4回表・打席通し6番目＝桑原のけん制盗塁死でチェンジ）。`repair:partial-pitch-2026` は5件とも **対象外**。

球種・ゾーン派生はゲート通過後に **`npm run phase14:build:pitch`**。**CS のみ**は `pipeline:runner-events-from-score-only`（Phase10 不要）。

#### Phase14 球種別打撃 — 球種ラベル（`normalizePitchTypeFromCanonical`）

Yahoo 個人ページの球種別表に合わせ、**ツーシーム・ワンシームはストレート行に含めない**。実装の正は `lib/pitchDetailsPilot.ts`。

| 統合先「ストレート」 | 別行のまま（代表） |
|----------------------|-------------------|
| ストレート、直球、フォーシーム、ファースト、速球 | ツーシーム、2シーム、**ワンシーム**、スライダー、カット、チェンジ、カーブ、フォーク、スプリット、シュート、シンカー 等 |

- 打席成績の付与は **最終球の球種**（決着テキストは `plateAppearanceResolvedResultText` / `isAtBat`+`hitBases`）。
- ラベル方針を変えたあとは **`npm run phase14:build:pitch`** で `_data/derived/player_pitch_from_canonical/{年}/` を再生成する。
- **球速帯（ストレート限定）**は `isStraightPitchKind`＝正規化後 **`pitch_type === 'ストレート'`** の球のみ（ツーシーム・ワンシームは含めない）。球種別打撃表の「ストレート」行と同じ母集団。
- API は Phase14 JSON の `speedBandStats` を優先し、空なら canonical から `aggregateSpeedBandsStraightOnly` で再計算する（球種別と同様のフォールバック）。

#### score raw 一括取得（`fetch_sportsnavi_score_raw_snapshot.py`・2026〜）

**目的**: `_data/scraped_games/raw_sportsnavi_score/{gameId}/` に一球 HTML を溜め、CS 用 `merge:sportsnavi-score-runner-events` の入力にする。

| 方針 | 内容 |
|------|------|
| **取得済み試合** | `_meta/{gameId}.json` と全 `scoreIndexes` の HTML が揃い、失敗打席 0 なら **試合単位でスキップ**（`already_complete`）。Yahoo へ取り直さない |
| **未取得・不完全** | 打席ループで **足りない index だけ**ネット取得（ページ単位キャッシュ） |
| **上書き再取得** | `--force`（試合スキップも無効） |
| **取得済みでも打席ループだけ回す** | `--rescan-complete-games`（通常不要） |
| **待機** | ネット取得があった打席のあとだけ `--sleep`（既定 1.2 秒） |

**PowerShell（プロジェクト直下）**

```powershell
cd "C:\Users\short\OneDrive\ドキュメント\デスクトップ\TopPage"
# 通常（済み試合は skip、進捗は画面に表示）
npm run phase2:sportsnavi:score-raw
# 進捗をファイルにも出す（別窓: Get-Content _data\reports\score_raw_progress.log -Wait -Tail 25）
npm run phase2:sportsnavi:score-raw:with-progress-log
# 引数を足す例
npm run phase2:sportsnavi:score-raw -- --log-append _data/reports/score_raw_progress.log --progress-pa-interval 10
```

**score raw だけ済んでいるとき**（マージ以降は下記「盗塁死」節）:

```powershell
npm run merge:sportsnavi-score-runner-events
```

#### B. 派生・ランキング・トップ表示（集計）

| 順 | 用途 | コマンド |
|----|------|----------|
| 1 | 本番一括（退避・検証付き） | `npm run appearance-slots:phase5:rebuild-2026` |
| 2 | 最小コア（退避なし） | `npm run rebuild:batting-profile-and-rankings-2026` |
| 3 | 広い派生（野手以外含む） | `npm run phase3:derived:2026` → 必要なら `npm run rankings:rebuild` |
| 4 | ランキング＋トップだけ再生成 | `npm run rankings:rebuild`（Phase12/19/28 → top-leaders → top-weekly-leaders） |
| 5 | Phase11 とランキングの一致確認 | `npm run validate:batting-phase11-vs-phase12` |

いずれも **A のあと**に実行する。生成 JSON の `battingSeasonAggSource` は **`appearance_slots`**、`plateResultAppearanceOnly` は **true** であること。

#### C. トップページ表示用 JSON（指標名・数値）

トップの各カードは **静的 JSON を fetch** する（`TopPageLeadersClient` / `TopPageWeeklyLeadersClient`）。指標ラベル・並び・上位選手名・数値はすべてビルド成果物に含める。

| タブ | 入力（SSOT） | ビルド | 出力 |
|------|--------------|--------|------|
| TOP（通算） | `public/data/rankings/{年}/{CL\|PL}/` | `npm run top-leaders:build:2026` | `public/data/top-leaders/{年}/{CL\|PL}/batting.json`, `pitching.json` |
| 今週 | Phase17/7 派生 + `public/data/rankings/weekly/` | `npm run phase28:build:weekly-rankings` → `npm run top-weekly-leaders:build:2026` | `public/data/top-leaders/weekly/{年}/{weekKey}/...` |

**日次**: `npm run daily:npb-pipeline` の派生ブロック末尾で **11〜13（Phase12/19/28 → top-leaders → top-weekly-leaders）** を `rankings:rebuild` と同順で実行する。`--derive-only` でも同ブロックが走る。

**手動（ランキングだけ直したあと）**: `npm run rankings:rebuild` 1 本で通算・週間・トップをまとめて更新できる。

詳細: `docs/plan_top_weekly_tab_and_rankings_phases.md`。

#### ロールバック（開発・比較のみ）

| 目的 | 設定 |
|------|------|
| 旧ハイブリッド通算（`line.ab` 優先） | `TOPPAGE_BATTING_SEASON_AGG=hybrid` のうえ Phase11/12 再実行 |
| 打席文言に要約・一球を混ぜる | `TOPPAGE_PLATE_RESULT_SOURCE=hybrid` |
| zip 無効の緊急時 | `TOPPAGE_APPEARANCE_PRIMARY=0` |

本番サイトの既定運用では **上記ロールバックは使わない**。

---

### 打撃派生: 出場成績を打席結果の第一とする方針

- **打席結果を出場成績のみに固定する計画（Phase 0〜6）**: `docs/plan_plate_result_appearance_only_operation_phases.md`（**Phase 6 クローズ済・2026-05-15** → §10）。再取得・canonical: `npm run appearance:stats-refetch-incomplete` / `npm run appearance:replay-plate-canonical`
- **ランキング・個人ページを出場末尾列だけで数える計画（Phase 0〜7）**: `docs/plan_ranking_profile_appearance_slots_only_phases.md`（**Phase 5 本番一括済・Phase 7 既定切替済**）
- **計画（出場主軸＋一球補完・従来）**: `docs/plan_batting_derived_appearance_stats_primary_phases.md`
- **Phase 0 仕様（canonical 内の対応・正の定義）**: `docs/batting_appearance_primary_phase0_spec.md`
- **Phase 1 実装（出場成績末尾列・検証）**: `docs/batting_appearance_primary_phase1_implementation.md`
- **Phase 3 準備（旧 vs 新・ロールバック・診断）**: `docs/batting_appearance_phase3_prep.md`
- **Phase 4 ゲート（再生成前チェックリスト）**: `docs/batting_appearance_phase4_gate_checklist.md`
- **Phase 4 差分許容案（草案）**: `docs/batting_appearance_phase4_diff_thresholds_proposal.md`
- **計画 Phase 5（`npm run appearance:phase5` ほか）**: `docs/plan_batting_derived_appearance_stats_primary_phases.md` §4
- **Yahoo 連携全体のソース優先（Phase 1 表 #6）**: `docs/yahoo_npb_game_data_integration_plan.md`

#### 本番既定（打席確定・`appearance_only`）

`plan_plate_result_appearance_only_operation_phases.md` **§10** に従う。

- **`TOPPAGE_PLATE_RESULT_SOURCE`**: **未設定** = `appearance_only`（出場末尾列の zip のみ。未該当打席は空文字）。
- **旧挙動の比較**: `TOPPAGE_PLATE_RESULT_SOURCE=hybrid`
- **緊急ロールバック**: `TOPPAGE_APPEARANCE_PRIMARY=0`（要約／一球のみ）

#### 一括再生成（打撃・2026）

**親計画**（`plan_batting_derived_appearance_stats_primary_phases.md`）の Phase 4 ゲートを厳密に踏む場合は、**Phase 4 チェックリスト**（`docs/batting_appearance_phase4_gate_checklist.md`）と **D4 承認**を先に完了する。差分許容案: `docs/batting_appearance_phase4_diff_thresholds_proposal.md` **§6**。

**直前の機械チェック（再実行可）**

1. `npm run validate:appearance-phase1`  
2. `npm run validate:appearance-rollback`  
3. `npm run validate:sportsnavi-stats-data-detail`（`dataDetail` 1打席1スロット・同一 `<td>` 複数打席の回帰）  
4. `npm run validate:appearance-slots-vs-line-ab:fail`（canonical 全試合・全打者の打数列突合）  
5. `npm run verify:cs-runner-events-appearance-slots`（CS は score runnerEvents のみ）  
6. `npm run validate:batting-stats`（対象年度はスクリプト既定、現状 2026）  
7. `npm run appearance:phase3` → `docs/batting_appearance_phase3_last_run.md` を確認  

**退避（推奨）**: 一括で上書きする前に `npm run backup:player-season-batting:2026` で `player_season_batting/2026` を退避する（OneDrive 等では逐次コピーの実装）。

**環境変数（派生ビルド）**: 通常は上記 **`appearance_only` 既定**のまま `TOPPAGE_APPEARANCE_PRIMARY` **未設定または有効値**（zip マップを構築する）。旧 zip＋要約比較は `TOPPAGE_PLATE_RESULT_SOURCE=hybrid`。要約／一球のみの緊急時は `TOPPAGE_APPEARANCE_PRIMARY=0` / `off`。

**本番一括の最小コア（野手 Phase11 → 検算 → コンテキスト → 派生スプリット → ランキング）**  
`npm run rebuild:batting-profile-and-rankings-2026`  
（中身は `phase11:build:batting` → `validate:appearance-slots-vs-line-ab:fail` → **`phase13:build:context`** → **`validate:phase13-context-vs-phase11:fail`** → `phase15:build:batting-splits` → `phase12:build:rankings`。Phase11/12/13 は **既定で appearance_slots**。）

**Phase13（対チーム・球場・ホーム/ビジター）の SSOT**  
- 通算（Phase11）と同じ `aggregateBattingForBatterInGameForProfiles`（`lib/yahooGame/canonicalBattingSeasonAgg.ts`）。  
- **試合×打者**の成績を 1 回だけ対戦相手キーに足す。**`plateAppearances` を打席ごとに足す方式は使わない**（安打過大・打点欠落の原因だった）。  
- 再生成: `npm run phase13:build:context`（単体可）。個人ページ向け最小コアには `rebuild:batting-profile-and-rankings-2026` に含まれる。  
- 検算: `npm run validate:phase13-context-vs-phase11:fail` … 各 `vs_team` 行の pa/ab/h が、同一選手・同一対戦相手試合を Phase11 ロジックで足した値と一致すること。

**率・OPS の丸め（`lib/battingRateFormat.ts`・Phase11/13/15 共通）**

| 指標 | ルール |
|------|--------|
| 打率・出塁率・長打率 | `round(分子×1000/分母)/1000` → `.xxx` 表示 |
| **OPS** | **未丸め**の `OBP実数 + SLG実数` を足してから **1 回だけ** 第4位四捨五入（`.xxx`）。表示済み OBP+SLG の足し算は **しない**（例: 近藤対オリックス `.389+.462`→`.851` ではなく **`.850`**） |

検算: `npm run validate:batting-rate-round`（打率・対右・対オリックス OPS のスモーク）。

派生 JSON を直したあとは **Phase11 → Phase13 → Phase15**（または `rebuild:batting-profile-and-rankings-2026`）を再実行する。API の `enrichSeasonStatsRowSabermetrics` も同関数で OPS を上書きするため、**phase13/15 だけ**では OPS 行が古いまま残る場合がある。

**日次パイプライン**（`scripts/run_daily_npb_pipeline.mjs`）の派生ブロックでは、上記に加え先頭で `validate:sportsnavi-stats-data-detail` を実行する。Phase11 直後の打数整合は `rebuild` / `appearance-slots:phase5:rebuild-2026` と同じ。末尾は Phase12/19 → Phase28 → top-leaders → top-weekly-leaders（§ C）。

#### appearance_slots 集計（ランキング・個人ページの通算）

`docs/plan_ranking_profile_appearance_slots_only_phases.md` に従う。

| 段階 | コマンド |
|------|----------|
| 退避 | `npm run appearance-slots:phase2:backup`（Phase11 + `public/data/rankings/2026/PL`） |
| パイロット（レイエス `1860140`） | `npm run appearance-slots:phase4:pilot` |
| 本番一括（2026・退避＋検証付き） | `npm run appearance-slots:phase5:rebuild-2026` |

**詳細手順**: 上記 §「一括取得方針（2026以降・本番）」を正とする。

**サイト派生を広く揃える場合**: `package.json` の `phase3:derived:2026` は野手以外のフェーズも含む。**必要なフェーズだけ**選んで実行してよい。

**Phase11 全件時の挙動**: `--only-yahoo-ids` を付けない全件実行では、`_data/derived/player_season_batting/{年}/yahoo_*.json` を **削除してから**再生成する（誤生成残骸の混入防止）。上記 Phase10 節と併せて参照。

#### 出場成績 HTML のパースと打数整合（2026-05）

スポナビ出場成績表は **列＝イニング** で、同一イニングに2打席あると **1つの `<td>` 内に複数の `bb-statsTable__dataDetail`** が並ぶ。パーサ（`lib/yahooGame/sportsnaviStatsRowCells.mjs`）は **`dataDetail` 1つ＝末尾列スロット1つ** に展開する。展開しないと2打席が1セルに結合され、通算 `appearance_slots` の打数が成績表の打数列とずれる（例: 渡部聖弥・試合 `2021038741`）。

| 検証 | コマンド | 内容 |
|------|----------|------|
| パーサ回帰 | `npm run validate:sportsnavi-stats-data-detail` | 固定 raw スニペット（複数 `dataDetail`・打妨など） |
| 打数突合 | `npm run validate:appearance-slots-vs-line-ab:fail` | canonical 全試合で `battingLines[].ab` と末尾スロットの `isAtBat` 数を比較 |

**打席結果の打数カウント**: `isAtBat` は `打妨`・`妨害` 等の **打撃妨害** を打数に含めない（`lib/yahooGame/paSettlementStatsFromResultJa.ts` の `isInterferenceResultText`）。成績表の打数列は妨害を除いた公式打数に合わせる。

#### 盗塁死（CS）— 一球 score 記録文 → runnerEvents（本番方針）

| 項目 | 内容 |
|------|------|
| **正** | 一球速報 `score?index=` HTML の記録文 → `runnerEventsFromSportsnaviScoreSnapshots` → `domain.runnerEvents`（**`sourceTier: "score"` のみ**） |
| **使わない** | スポナビ `textPlayByPlay` 行パース、Yahoo `/text` DOM 由来の runnerEvents（canonical マージ時も載せない） |
| **盗塁成功（SB）** | 出場成績 `battingLines.sb`（従来どおり） |
| **Phase11** | `csCountForBatterFromRunnerEvents`（score tier の CS のみ加算） |
| **canonical 更新** | **軽量**: `npm run pipeline:runner-events-from-score-only`（`raw_sportsnavi_score` 取得のみ → runnerEvents を上書き、**Phase10 不要**）／ **従来**: Phase4（`phase4:yahoo:pitch-by-pitch` + `phase4:merge`、球種・打席ログも更新） |

**再生成（2026・CS を score に揃える）**

**流れ（score raw 取得済みのとき）** — この順で実行する。

| 順 | やること | コマンド |
|----|----------|----------|
| 1 | canonical に runnerEvents を書く | `npm run merge:sportsnavi-score-runner-events` |
| 2 | CS が score のみか検証 | `npm run verify:cs-runner-events-appearance-slots` |
| 3 | 個人シーズン打撃（CS 込み）再生成 | `npm run phase11:build:batting` |
| 4 | 打数整合 | `npm run validate:appearance-slots-vs-line-ab:fail` |
| 5 | ランキング反映 | `npm run phase12:build:rankings` |

**まだ score raw を取っていないとき**（1 から一気に）:

```powershell
npm run pipeline:runner-events-from-score-only
npm run rebuild:batting-cs-from-score-2026
```

（`pipeline:runner-events-from-score-only` = score raw 取得 + マージ。`rebuild:batting-cs-from-score-2026` = 上表の 2〜5）

**PowerShell 例（raw 済み・マージから）**

```powershell
cd "C:\Users\short\OneDrive\ドキュメント\デスクトップ\TopPage"
npm run merge:sportsnavi-score-runner-events
npm run rebuild:batting-cs-from-score-2026
```

単試合: `npx tsx scripts/merge_score_runner_events_into_canonical.ts --game-id <試合ID>` のあと、同選手・同年度なら **Phase11 全件**（`phase11:build:batting`）を推奨。

**score / テキスト速報 raw の充足度**: `npm run diag:sportsnavi-score-raw-coverage`（一球 score HTML） / `npm run diag:sportsnavi-text-raw-coverage`（実況 `bb-liveText` の目安・index 対比）。**三種同時欠損**（出場 stats・実況 text・score がいずれも使えない／中止除く）: `npm run diag:triple-raw-gap`（`--json`）

一球の打席ログ・球種まで揃える（従来日次と同種）場合:

```bash
npm run phase4:yahoo:pitch-by-pitch
npm run phase4:merge:phase10:all
```

その後 Phase11〜12 と上と同様。

**一括 npm**: `npm run rebuild:batting-cs-from-score-2026` … Phase11〜12 と検証のみ（canonical の書き換えは手前で `pipeline:runner-events-from-score-only` または Phase4）。

**打数・出場スロット**: Phase2b 変更時は `phase2:sportsnavi:canonical` のあと、`pipeline:runner-events-from-score-only` または Phase4 → Phase11。派生だけ古いまま残さない。

**Phase11 で CS が極端に少ないとき**: ディスク上の canonical には score 由来 `runnerEvents` があっても、Phase11 は **Phase10 マージ（メモリ上）** を通す。以前はここで **text 実況由来の runnerEvents に上書き**され CS が落ちていた。**2026-05 修正**: Phase10 マージ後も **`sourceTier: "score"` を優先保持**。canonical の再マージは不要で **`npm run rebuild:batting-cs-from-score-2026` の再実行**でよい。

### 既知の不具合と運用上の対策（重要）

#### Phase10: 投手/打者IDの取り違え（例: 森浦・勝野が「打席に立った」扱いになる）

- **問題概要**: 2026年の打撃派生（Phase11/Phase12）で、投手（例: 森浦 `2000061`、勝野 `1800061`）が打者として集計・ランキング表示されることがあった。
- **影響**:
  - 打者ランキングに投手が混入する
  - チーム別の「打者人数」が極端に少なく見える等、派生集計が大きく歪む
- **根本原因（1）**: Yahoo 一球ページの `table#gm_rslt` は回・表示状態により **見出し順が揺れる**（「投手｜打者」と「打者｜投手」が混在）。  
  そのため、DOM上のリンク順だけで「先頭=打者」等の決め打ちをすると、回によって投手/打者が入れ替わり、誤った `batter_id` が Phase10 の pitch rows に混入する。
- **根本原因（2）**: Phase11 が `player_season_batting/{year}/` の既存ファイルを削除せず上書きするだけだと、過去に誤生成された `yahoo_{投手ID}.json` が残り続け、Phase12 がそれを拾って「状況が変わらない」ように見える。

- **解決策（実装）**:
  - Phase10 のパーサは `#gm_rslt` の **見出し（投手/打者）を読み取って割り当て**し、リンク順の決め打ちをしない。
  - Phase11 は派生生成前に `_data/derived/player_season_batting/{year}/yahoo_*.json` を **クリーンアップしてから再生成**する（派生=再計算可能な生成物なので、残骸混入を防ぐ）。

- **運用手順（復旧）**:
  - 取り込みをやり直すときは、少なくとも **Phase10 → Phase11 → Phase12** の順に再実行し、派生を作り直す。

- **再発防止チェック（簡易）**:
  - `canonical/{game_id}.json` で `plateAppearances[].yahooBatterId` に **勝敗投手IDなど投手っぽいIDが大量に出ない**ことを確認。
  - もし表示が変わらない場合は、Phase11 の出力ディレクトリに **古い `yahoo_*.json` が残っていないか**を確認（残っていればクリーンアップして再生成）。

### 規定打席（打者ランキング）

- **規定打席の基本式**: **その時点の所属球団の試合数 × 3.1**
- **端数処理**: 小数は **切り上げ**（例: \(1 \times 3.1 = 3.1\) → 4）
- **所属球団**: その行に表示されている **球団**（トレード等があるため、表示上の球団単位で判定）
- **「その時点」**: ランキングJSONが生成された時点で観測できる **チーム試合数**（実装上は、同一球団の行の `試合` の最大値をチーム試合数とみなす）

#### 指標ごとの扱い

- **規定打席が必要（= 規定フィルタ適用）**:
  - 率・割合・指標系（例: OPS, 打率, 出塁率, 長打率, BB%, K%, BB/K, BABIP, RC, XR, SecA, TA, NOI, GPA など）
- **規定打席が不要（= 全員表示）**:
  - カウント系（例: 安打, 本塁打, 打点, 得点, 打席, 打数, 四球, 三振, 盗塁, 犠打, 併殺打 など）

#### 目的（なぜこのルールか）

- 少サンプルの上振れ（例: 1試合だけ高OPS）を、率系ランキングから除外して **公平性**を保つため。
- 一方で、カウント系（安打数など）は “積み上げ” の性質が強いため、規定フィルタを適用しない。

