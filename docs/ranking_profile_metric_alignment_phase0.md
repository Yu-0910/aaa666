# Phase 0 成果物: ランキングと個人ページの「一致させる指標」一覧

**目的**: `docs/plan_unified_ranking_personal_stats_phases.md` の Phase 0 を満たす。以降の実装・検証スクリプトは本書の **優先度 P0 / P1 / 対象外** に従う。

**更新日**: 2026-04-17（リポジトリ現行コードに基づく）

---

## 1. 共通原則

| 項目 | 内容 |
|------|------|
| **野手の数値の源** | `aggregateBattingSeasonByYahooBatter` → `buildEnrichedBattingSeasonRow`（`lib/yahooGame/canonicalBattingSeasonAgg.ts`）。Phase 11 派生 JSON・Phase 12 ランキング JSON はこの行を土壌にする。 |
| **投手の数値の源** | `aggregatePitchingSeasonByYahooPlayer`（`lib/yahooGame/canonicalPitchingSeasonAgg.ts`）。Phase 19 ランキング行は Yahoo 単位の `agg` から直接計算。個人 PoC（`player_season_pitching_poc`）は **同一集計を NPB ID に畳み込んだ上で** `basic` 等に載せる（`phase_pitcher_poc1_build_from_canonical.ts` コメント: 先発/QS 等は phase19 と同一 aggregate）。 |
| **検証時の注意** | 率は **浮動小数の丸め**と **文字列（`.315`）vs 数値** の差で 1 ウLP悪化しうる。P0 は **整数コア**、P1 は **同一公式で再計算して許容誤差 ε**（例 1e-6）を推奨。 |

---

## 2. 野手: `SeasonStatsRow` ↔ Phase 12 ランキング JSON キー

Phase 12 は `scripts/phase12_build_rankings_from_phase11.ts` の `buildRankingRowBase` が `SeasonStatsRow` を JSON 列に写像する。  
`Record.csv` 1 行目の指標順が UI の並びになるが、**列の実体はこの写像**。

### 2.1 P0（必ず一致させる整数・固定派生）

| 意味 | ランキング JSON キー | `SeasonStatsRow` |
|------|----------------------|------------------|
| 試合 | `games` | `g` |
| 打席 | `pa` | `pa` |
| 打数 | `ab` | `ab` |
| 得点 | `runs` | `r` |
| 安打 | `hits` | `h` |
| 単打 | `singles` | `h1` |
| 二塁打 | `doubles` | `h2` |
| 三塁打 | `triples` | `h3` |
| 本塁打 | `hr` | `hr` |
| 打点 | `rbi` | `rbi` |
| 三振 | `so` | `so` |
| 四球 | `bb` | `bb` |
| 敬遠 | `ibb` | `ibb` |
| 死球 | `hbp` | `hbp` |
| 犠打 | `sh` | `sh` |
| 犠飛 | `sf` | `sf` |
| 盗塁 | `sb` | `sb` |
| 盗塁死 | `cs` | `cs` |
| 併殺 | `gidp` | `gidp` |
| 塁打 | `tb` | `tb` |

- **`h1`**: 集計上は `h - h2 - h3 - hr`（`battingAggToSeasonStatsRow`）。単打として P0 に含める。

### 2.2 P1（率・セイバー: 同一ロジックなら一致）

`enrichSeasonStatsRowSabermetrics`（`seasonStatsPilotShared.ts`）後の文字列と、JSON 側の `numFromSlash` / `numFromLoose` 変換後の数値を突合する。

| 意味 | JSON キー | `SeasonStatsRow` |
|------|-----------|------------------|
| 打率 | `avg` | `avg` |
| 出塁率 | `obp` | `obp` |
| 長打率 | `slg` | `slg` |
| OPS | `ops` | `ops` |
| IsoP / IsoD | `isop`, `isod` | `isop`, `isod` |
| BB% / K% | `bbPct`, `kPct` | `bb_pct`, `k_pct` |
| BB/K | `bbk` | `bbk` |
| RC, XR, BABIP, SecA, TA, NOI, GPA | `rc`, `xr`, `babip`, `seca`, `ta`, `noi`, `gpa` | 同名（文字列） |

### 2.3 得点圏（RISP）

`SeasonStatsRow` には `risp_ab` / `risp_h` / `risp_avg` がある。`Record.csv` に **得点圏系が無ければ** Phase 12 JSON にも載らない。統一検証の対象に含めるかは **Record.csv に列があるか**で決める（現状の `Record.csv` 1 行目には得点圏列は無い）。

### 2.4 対象外（本 Phase の「同一基準」から除外）

- ブロック D〜J、`pitchTypeStats`、球種・コース・`PitchDetailsPilot` 由来。
- Phase 13〜17 の**スプリット行**（通算 P0 とは別行として検証すれば可）。

---

## 3. 投手: Phase 19 ランキング行 ↔ 個人 PoC `basic`

Phase 19 は `scripts/phase19_build_pitching_rankings_from_canonical.ts` の `buildPitchingRow`。  
個人は `PitcherSeasonPocPayload.basic`（`lib/pitcherSeasonPocTypes.ts`）。

**ID**: ランキングは **Yahoo 投手 ID**（`playerId`）。個人 API は **NPB ID** で PoC JSON を引く。検証時は **同一投手の Yahoo↔NPB**（`build:yahoo-pitcher-npb-index` 等）で対応付けてから数値比較する。

### 3.1 P0（コア実績: 1 Yahoo ID の aggregate と PoC の畳み込み後が一致すべき集合）

| 意味 | Phase 19 (`buildPitchingRow`) | PoC `basic` | 備考 |
|------|------------------------------|-------------|------|
| 防御率 | `era`（数値） | `era`（null 可） | 計算式どちらも `(er × 27) / ipOuts` 系。`outs≤0` の扱いに注意 |
| 投球回（表記） | `ip`（**小数イニング、数値**） | `ip`（**文字列**）・`ipOuts` | 一致判定は **`ipOuts` 優先**（同じ canonical なら同一のはず） |
| 打者 | `bf` | 対応する合算 BF（`merged`） | PoC は PA マージ由来で、集計経路が二段のため **Phase 3 で突合仕様を固定** |
| 被安打 | `ha` | `h` | 名前のみ異なる |
| 被本 | `hra` | `hr` | |
| 三振 | `so` | `so` | |
| 四球 | `bb` | `bb` | |
| 被死球 | （`buildPitchingRow` に明示列なし） | `hbp` | Phase 19 行は WHIP・率に内包。突合は **aggregate 生**または **派生式で再計算** |
| 試合 | `g` | `gamesAppeared`（あれば） | PoC が `gameIds` 相当で埋める |
| 先発 | `gs` | `gamesStarted` | |
| 勝/負/セ/ホールド | `w`, `l`, `sv`, `hld` | `winCount`, `lossCount`, `saveCount`, `holds` | 名前対応 |
| 完投・完封 | `cg`, `sho` | `completeGames`, `shutouts` | |
| 投球数 | `np` | `pitches` | |
| QS 率系 | `qs_rate`, `hqs_rate`, `sqs_rate` | `qsRate` 等 | 先発分母の定義を揃える |

※ PoC の **被打者・被安** は `merged`（pitchingLines + PA）由来、`aggregatePitchingSeasonByYahooPlayer` の **`agg` との厳密一致**は Phase 計画の「Phase 3」でコードレベル確認が前提。本 Phase 0 では **比較候補の列名だけ**を固定する。

### 3.2 P1（率・推定）

| 意味 | Phase 19 | PoC |
|------|----------|-----|
| WHIP | `whip` | `whip` |
| K% / BB% / K-BB% | `k_pct`, `bb_pct`, `k_bb_pct` | 表示用に同名の派生がある場合は突合 |
| 被打率・被出塁率・被長打率・被BABIP | `avg_against`, `obp_against`, `slg_against`, `babip_against` | `avgAgainstApprox` 等 | 定義差あり得る → **P1** |
| P/IP | `p_ip` | 派生で可 |

### 3.3 対象外

- `nf3Metrics`（`build_pitcher_nf3_metrics` マージ）、捕手別 `splits.byCatcher`、状況別・球種別。
- Phase 19 の **`hp`** は現状 **`0` 固定**（`buildPitchingRow`）。個人側の死球数とは **突合しない**（未実装のプレースホルダ）。

---

## 4. 参照（コード）

| 内容 | パス |
|------|------|
| 野手 JSON 化 | `scripts/phase12_build_rankings_from_phase11.ts` → `buildRankingRowBase` |
| 野手通算行 | `lib/yahooGame/canonicalBattingSeasonAgg.ts` → `battingAggToSeasonStatsRow`, `buildEnrichedBattingSeasonRow` |
| 投手 JSON 化 | `scripts/phase19_build_pitching_rankings_from_canonical.ts` → `buildPitchingRow` |
| 投手 PoC 生成 | `scripts/phase_pitcher_poc1_build_from_canonical.ts` |
| 投手型 | `lib/pitcherSeasonPocTypes.ts` |
| 打撃 Record 列 | リポジトリ直下 `Record.csv`（1 行目） |
| 投手 Record 列 | `_data/master_csv/Record_pitching.csv`（1 行目） |

---

## 5. 次のアクション（Phase 1 以降への接続）

- 野手: **`mergePilotSeasonStatsWithDerived` が返す通算**が、上記 **§2.1 P0** と一致することを検証する（CSV 優先の撤廃は Phase 1）。
- 投手: Yahoo 単位 `agg` と PoC `basic` の **定義差（bf, merged）** を Phase 3 で解消するか、検証対象から外すかを決める。
