# ランキング成績と個人ページ成績の統一（野手・投手）— Phase 計画

## ゴール

- **野手・投手とも**、サイト上でユーザーが見る「シーズン成績」の**数値の根拠（ソース・集計関数・入力 canonical）をランキングと個人ページで一致**させる。
- 運用負担を抑えるため、**手入力を正としない**・**更新手順は既存の `phase` パイプラインに乗せる**・**検証は自動化**する。

## 前提（単一の正: SSOT）

| 区分 | 入力 | 集計の中核 | 個人向け派生 | ランキング JSON |
|------|------|------------|--------------|-----------------|
| **野手** | `_data/scraped_games/canonical/*.json` | `lib/yahooGame/canonicalBattingSeasonAgg.ts` | Phase 11 → `_data/derived/player_season_batting/{年}/` | Phase 12 → `public/data/rankings/{年}/CL|PL/*.json` |
| **投手** | 同上 | `lib/yahooGame/canonicalPitchingSeasonAgg.ts` | Phase PoC1 → `_data/derived/player_season_pitching_poc/{年}/` | Phase 19 → `public/data/rankings/pitching/{年}/CL|PL/*.json` |

- Phase 11 と Phase 12 は**同一の aggregate + `buildEnrichedBattingSeasonRow`**（`phase11_build_season_stats_from_canonical.ts` 冒頭コメントどおり）。
- Phase PoC1 はコメント上、先発/QS 等で **Phase 19 と同じ `aggregatePitchingSeasonByYahooPlayer`** を参照する。

## 現状のずれの主因（本計画で潰す対象）

1. **野手**: `_data/yahoo_games_pilot/batting_stats.csv` が `mergePilotSeasonStatsWithDerived`（`lib/seasonStatsPilot.ts`）で**先に読まれ、CSV と Phase 11 が二系統**になる。`validate:batting-stats`（`scripts/validate_batting_stats_phase11.mjs`）がこの不整合を検知する理由になっている。
2. **投手**: 個人は **NPB ID キーの PoC JSON**（＋ nf3 等のマージ）／ランキングは **Yahoo 集計 → リーグ・指標 JSON**。ID 橋渡し・付加指標の有無で**見かけがズレる**余地がある。
3. **共通**: canonical を増やしたあと **Phase 11/PoC1 を通したが `rankings:rebuild`（Phase 12・19）を未実行**など、**生成順のずれ**。

---

## Phase 0 — 棚卸しと「比較対象指標」の定義（完了）

**目的**: 何を「一致させるか」をブレなく決める。

- **野手**: 少なくとも通算行の **PA / 打数 / 安打 / 本塁打 / 四死球・死球・三振 / 併殺** など、ランキング JSON に載る整数ベース指標。率は派生計算で一致させる。
- **投手**: Phase 19 が出力する**コア実績**（投球回、被打安打、奪三振、防御率の分子分母に効く枠など）と、個人 PoC の**同名列**を一覧化する（ドキュメントに表を残す）。
- **やらない（別 Issue）**: 球種・ゾーン・捕手別スプリット等は「ランキングに無い指標」として、統一の対象外にできる。

**成果物（実行済み）**: [`docs/ranking_profile_metric_alignment_phase0.md`](ranking_profile_metric_alignment_phase0.md) — 優先度 P0 / P1、野手の JSON キー対応、`SeasonStatsRow` 対照、投手 Phase 19 ↔ PoC `basic` の列対応、対象外と次フェーズ接続を記載。

---

## Phase 1 — 野手: 個人ページの通算を Phase 11 に一本化（完了）

**目的**: ランキング（Phase 12）と**同じ canonical 由来の通算**だけを見せる。

**実装（2026-04-17）**

- `mergePilotSeasonStatsWithDerived`（`lib/seasonStatsPilot.ts`）を変更した。
- **通算行**（`split_type === 'total'`）は **Phase 11 派生があれば常にそれを採用**。CSV の通算行は**参照しない**。
- **Phase 11 が無い選手**だけ、従来どおりパイロット CSV の通算をフォールバック（canonical に無い試合のみ CSV があるケース）。
- CSV からは通算行を**初期マージから除外**し、Phase 13〜17 用の補助行のみ引き回す。

**方針 A（推奨・負担最小）**

- **シーズン通算の表示**では `_data/yahoo_games_pilot/batting_stats.csv` を**正としない**。
- 上記のとおり **案 1 に相当**（通算は canonical 派生のみ。CSV はスプリット用の残存があれば可）。

**依存 npm**: `npm run phase11:build:batting` → 続けて Phase 2 のあと `npm run phase12:build:rankings`。

---

## Phase 2 — 野手: API 層で「Phase 12 と同じ行」を参照する（完了）

**目的**: コードの重複とドリフトを防ぐ。

- `buildEnrichedBattingSeasonRow`（および Phase 11 が書き込む JSON 構造）を、個人 API（`/api/players/.../season-stats`）の**通算・基本指標の単一ソース**にする。
- 既存の Phase 13〜17 行（コンテキスト・巡目・月間等）は、**Phase 11 通算と矛盾しない**ことを前提にマージ継続。

**実装**: `resolveBattingTotalRowForProfileApi`（`lib/seasonStatsPilot.ts`）で通算行は Phase 11 JSON を採用。`mergePilotSeasonStatsWithDerived` に Phase 2 の方針コメントを記載。

---

## Phase 3 — 投手: Phase 19 の行と PoC のコア指標を同一定義に固定（完了）

**目的**: `aggregatePitchingSeasonByYahooPlayer` を**どちらのパスでも同じ解釈**で使う。

- Phase 19（`scripts/phase19_build_pitching_rankings_from_canonical.ts`）が並べる指標と、PoC1（`scripts/phase_pitcher_poc1_build_from_canonical.ts`）が JSON に書く**同種の値**について、**同じ関数・同じ丸め**から取ることをコードレビューで確認する（必要なら薄い共有モジュールに寄せる）。
- **リーグ振り分け**（CL/PL）は `docs/plan_batting_rankings_cl_pl_2026.md` 系の名簿 SSOT に揃えつつ、**数値の母数は「全 canonical 試合の集計」で個人もランキングも同じ**であることを明文化する（ランキング画面はリーグでフィルタするが、選手 1 人の総投球回は同一であるべき）。

**実装**: `lib/yahooGame/pitchingRowMetricsFromAgg.ts` の `pitchingSeasonRowStatsFromAgg` を Phase 19 / PoC の `basic` で共有。PoC の NPB コアは `sumPitchingSeasonAggYahoo`（`canonicalPitchingSeasonAgg.ts`）で canonical 集計に合わせる。

**依存 npm**: `npm run phase:pitcher-poc1` → `npm run phase19:build:pitching-rankings`（既存 `rankings:rebuild` に含まれる投手部分）。

---

## Phase 4 — 投手: 個人ページ表示とランキング JSON の突合（ID 橋渡し）（完了）

**目的**: NPB ID（個人 API）と Yahoo ID（ランキング JSON）のギャップで数字がずれないようにする。

- `yahoo_pitcher_to_npb`（`build:yahoo-pitcher-npb-index`）の欠損を、**ランキングに出る投手**について優先的に埋める（既存計画どおり）。
- **検証スクリプト**（新規または `validate:pitching-rankings` 拡張）で、代表数選手について **PoC JSON の総計と Phase 19 が出力した JSON の同一選手行**を比較する。

**実装**: `scripts/build_yahoo_pitcher_npb_index.ts` が PoC 由来マップに加え、`public/data/rankings/pitching/{年}/CL|PL/防御率.json` の全 `playerId` を走査し、未登録の Yahoo ID を `findRosterPlayerByPublicId` で補完。`npm run validate:profile-vs-ranking-pitching` が NPB ごとに PoC `basic` とランキング行の合算（bf / 被安 / 奪三 / 投球数 / アウト数など）を突合。

---

## Phase 5 — 一括更新手順（運用の「いつもの」）（完了）

**目的**: 人的ミスによるズレを防ぐ。

- `package.json` に既にある **`npm run rankings:rebuild`**（Phase 12 + Phase 19）を、canonical 拡張後の**必須ステップ**として README または `docs/DATA_PATHS.md` 系に**一文で固定**する。
- `phase3:derived:2026`（または相当の派生一括）の**直後**に `rankings:rebuild` を続けること、を手順として書く（新規スクリプト名は任意。例: `pipeline:after-canonical` のようなエイリアスを足すのは Phase 5 の成果物候補）。

**実装**: `docs/DATA_PATHS.md` に「Yahoo canonical 派生とランキング再ビルド」節を追加。`package.json` に **`npm run phase3:derived:2026:and-rankings`**（`phase3:derived:2026` → `rankings:rebuild`）を追加。

---

## Phase 6 — 自動検証（回帰テスト）（完了）

**目的**: 将来の集計ルール変更でもランキングと個人が同時に壊れるようにする。

- **野手**: 既存 `validate:batting-stats` を維持。Phase 1 完了後は「CSV 不要」ならスクリプトを**Phase 11 単体検証**に差し替え可能。
- **投手**: Phase 4 の突合を `npm run validate:profile-vs-ranking-pitching` のような名前で追加（対象は数手に限定で可）。
- 任意: CI で canonical が変わったときだけ実行（重い場合は手動）。

**実装**: `npm run validate:profile-vs-ranking-pitching` → `scripts/validate_profile_vs_ranking_pitching.ts`（全 `npb_*.json` を対象）。

---

## 成功基準（受け入れ条件）

- 同一選手・同一シーズンで、**ランキング JSON に載るコア整数指標**と、**個人ページ API が返す通算（および投手シーズン PoC の対応フィールド）**が一致する（ID 変換経路を経ても同値）。
- 更新作業者は **「canonical 更新 → 派生 phase（既存）→ `rankings:rebuild`」** のみを覚えればよい。
- `batting_stats.csv` 由来の**手修正**に依存しない。

---

## 参照ファイル（実装時の入口）

| 内容 | パス |
|------|------|
| 野手マージ（CSV + Phase 11） | `lib/seasonStatsPilot.ts` |
| 野手個人 API | `app/api/players/[playerId]/season-stats/route.ts` |
| 野手ランキング生成 | `scripts/phase12_build_rankings_from_phase11.ts` |
| 投手個人 API | `app/api/players/[playerId]/season-pitching/route.ts`、`lib/pitcherSeasonPocLoad.ts` |
| 投手ランキング生成 | `scripts/phase19_build_pitching_rankings_from_canonical.ts` |
| CSV と Phase 11 検証 | `scripts/validate_batting_stats_phase11.mjs` |
| ランキング再ビルド npm | `package.json` の `rankings:rebuild` |
| セパ分離・名簿 SSOT（関連） | `docs/plan_batting_rankings_cl_pl_2026.md`、`docs/ranking_league_resolution_spec_2026.md` |

---

## 変更履歴（手動）

- 初版: ランキングと個人の統一を Phase 0〜6 で整理。既存 Phase 11 / 12 / 19 / PoC1 名と整合。
- 2026-04-18: Phase 2〜6 を完了として整理（投手インデックス拡張・突合 npm・DATA_PATHS・`phase3:derived:2026:and-rankings`）。
