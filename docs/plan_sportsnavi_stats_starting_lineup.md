# 出場成績 HTML からスタメン打順を組み立てる（方針）

## 目的

- 個人ページの **打順別打撃成績**（Phase15 `split_type: bat_order`）と、将来の **スタメン守備位置別** 集計の入力に、`game.teams[].startingLineup` を載せる。
- **新規 URL 取得はしない**。既に Phase2 で取っている `raw_sportsnavi_stats/{gameId}.html` のみを正とする。

## データ源（スポーツナビ出場成績）

| 列 | 内容 |
|----|------|
| 位置 | スタメンは `(右)` `(二)` `(捕)` `(投)` など **括弧付き**。救援・代打は `投` `打` `打一` など **括弧なし**。 |
| 選手名 | `/npb/player/{yahooId}/` |
| 1〜9回列 | 打席結果（打順の直接ソースではない） |

**打順の復元ルール**: チーム別打撃成績テーブル（`bb-statsTable--npbTeam{N}`）内で、括弧付き「位置」の行を **上から順に** 1〜9 番として `battingOrder` を付与する。

実装: `lib/yahooGame/sportsnaviStatsStartingLineup.mjs`  
`parseTeamsFromSportsnaviStatsHtml(html)` → `game.teams[]`

## canonical への載せ方（Phase2b）

`scripts/phase2_build_canonical_from_raw_sportsnavi.mjs` が stats HTML をパースし、`game.teams` に永続化する（従来は常に `[]`）。

再生成トリガー（`lib/yahooGame/phase2RawCanonicalSync.mjs`）に **`stale_empty_teams`** を追加:

- 出場成績からスタメン枠が **14 以上**（両軍おおよそ 7 人以上）取れるのに、既存 canonical の `teams` が空 → `--only-stale` で再ビルド対象。

## 派生パイプライン（メモリ注入）

ディスク上の古い canonical（`teams: []`）向けに、読み込み時に raw stats を再パースして注入:

- `lib/yahooGame/injectTeamsFromSportsnaviStats.mjs`
- `loadCanonicalGamesMergedForDerivedPipeline` … Phase11 / Phase15 等の共通入口

**ディスクを更新したいとき**は Phase2b を走らせる（推奨）。

## 過去データの再生成（手順）

取得を増やさず、既存 raw から canonical と派生を直す。

```bash
# 1) 出場成績 raw が既にある前提。不足のみ再取得する場合:
npm run phase2:sportsnavi:stats-text:refetch-incomplete

# 2) canonical に teams を載せ直す（指紋不一致・stale_empty_teams・thin のみ）
npm run phase2:sportsnavi:canonical:stale

# 全試合を上書き（月次メンテ・初回埋め直し）
node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year 2026 --force

# 3) 打順別など派生（日次と同じブロックでよい）
npm run phase15:build:batting-splits
# または
npm run phase3:derived:2026
```

検証:

```bash
npm run validate:sportsnavi-stats-starting-lineup
```

固定試合 `2021038624` で両軍 9 人・菊池 6 番 `(二)` を assert。

## 今後の一括取得（日次パイプライン）

`scripts/run_daily_npb_pipeline.mjs` の流れは **変更なし**でよい。

1. Phase1 試合トップ raw  
2. Phase2a `phase2_fetch_sportsnavi_stats_text`（出場成績 + テキスト）  
3. Phase2b `phase2_build_canonical_from_raw_sportsnavi` → **この時点で `teams` が入る**  
4. Phase10 一球（任意）  
5. Phase11 / Phase15 … `loadCanonicalGamesMergedForDerivedPipeline` 経由で打順別が有効  

**注意**: 出場成績は CSR のため、試合直後は空テーブルのことがある。従来どおり `refetch-incomplete` と `canonical:stale` で追いつける。

## テキスト速報スタメンとの関係

- **正（打順）**: 出場成績 HTML の括弧付きスタメン行（Yahoo ID 直結）  
- **補助**: `injectTeamsFromTextPbpIfMissing`（試合前情報・苗字照合）は、stats で teams が取れない試合向け。Phase13 / 対左右ランタイムでは従来どおり利用可。

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `lib/yahooGame/sportsnaviStatsStartingLineup.mjs` | パース本体 |
| `lib/yahooGame/injectTeamsFromSportsnaviStats.mjs` | 古い canonical への注入 |
| `scripts/phase2_build_canonical_from_raw_sportsnavi.mjs` | 永続化 |
| `scripts/phase15_build_pa_round_and_situation_from_canonical.ts` | `bat_order` / `starter_field` 集計 |
| `lib/yahooGame/starterFieldPositionFromStats.ts` | 守備略号 → 表行キー |
| `lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline.ts` | 派生共通入口 |
