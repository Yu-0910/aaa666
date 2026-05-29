# ランキング（打撃・投手）：2026 年セ・リーグ用／パ・リーグ用 JSON の生成とセパ分離

## ゴール

**既存のランキングページ UI を大きく変えず**、**2026 年**について次を満たす。

### 打撃（野手）

- `public/data/rankings/2026/CL/` … **セ・リーグ所属の野手だけ**の JSON
- `public/data/rankings/2026/PL/` … **パ・リーグ所属の野手だけ**の JSON

### 投手

- `public/data/rankings/pitching/2026/CL/` … **セ・リーグ所属の投手だけ**の JSON
- `public/data/rankings/pitching/2026/PL/` … **パ・リーグ所属の投手だけ**の JSON

いずれも **指標ごとに数値が埋まり**、既存の **`/ranking/...`**（打撃）および **`/ranking/pitching/...`**（投手）から正しく読み込める状態にする。

---

## 背景（いま起きていること・短く）

### 打撃

- `scripts/phase12_build_rankings_from_phase11.ts` は **`CL` のみ**に出力し、打者を**リーグで絞っていない**ため、セ用 JSON にパ所属の選手が混ざる。
- **`2026/PL/` が無い**と、`lib/ranking/jsonLoader.ts` が **2025 年 PL にフォールバック**し、セ側と年・母集団がずれる。

### 投手

- `aggregatePitchingSeasonByYahooPlayer`（`lib/yahooGame/canonicalPitchingSeasonAgg.ts`）は、試合ごとに**スタメン中心**で所属を取り、**救援投手**でチームが空になりやすい。**空は CL 扱い**になり、**パ側が空・セに寄る**ことがある。

本計画は **2026 年名簿の所属**を主に据え、**打撃・投手の両方**でセパ分離を揃える。

---

## セ／パの振り分けの SSOT（本計画の方針）

**2026 年 NPB 選手名簿**（`_data/npb_roster_2026.csv`）の **`team`（所属球団）** を**第一の根拠**とする（打撃・投手**共通**）。

- シーズンランキングで欲しいのは「**その年の登録上の所属リーグ**」であり、試合ログだけより **名簿**の方が一貫しやすい。
- **共通手順**: **Yahoo ID** → **NPB `npb_player_id`**（橋渡し）→ 名簿の **`team`** → 略称（`CSV_TEAM_TO_RANKING_SHORT`）→ **`leagueBucketForTeamShort` 相当**（セ 6 球団 → `CL`、それ以外 → `PL`）。
- **打者**: `resolveNpbPlayerIdFromPublicId`、橋渡し CSV、`MANUAL_YAHOO_TO_NPB`（`lib/yahooNpbBatterIdMap.manual.ts`）を利用。
- **投手**: 投手専用の Yahoo↔NPB（`_data/scraped_games/derived/yahoo_pitcher_to_npb.json` の生成、`MANUAL` 補完など）を利用。打席マスタに載らない ID が多いため、**橋渡しの穴埋め**が野手以上に重要。
- **補完（打撃・投手共通）**: 名簿に行が無い・Yahoo↔NPB が無い場合は **canonical 由来のチーム**や **`inferPitcherTeamForNf3Line` 等の推定**（投手）をフォールバック。**それでも決められない場合は両リーグに重複掲載しない**ルールを 1 通りに決める。

---

## スコープ

| 含む | 含まない |
|------|----------|
| 打撃・投手のランキング用 JSON の CL/PL 分離（2026 年） | ランキング UI のデザイン大改修 |
| `phase12`（打撃）・`phase19` 集計ロジック（投手）の改修と再実行 | 規定打席／規定投球回の**閾値そのもの**の変更（別ドキュメント） |
| 名簿を主とした CL/PL 振り分け | 名簿 CSV の取得運用そのもの（欠損はフォールバックで扱う） |

---

## 前提（Phase 0）

- `_data/scraped_games/canonical/*.json` に、ランキング集計に十分な試合数がある。
- 野手派生・canonical が個人ページと整合する状態（必要なら `npm run phase3:derived:2026` 等）。
- **`_data/npb_roster_2026.csv`** が参照可能。
- **投手の Yahoo↔NPB** が実用的に埋まっている（`npm run build:yahoo-pitcher-npb-index` 等。不足は Phase 1〜3 で補う）。

---

## Phase 設計（自然数のみ）

### Phase 1: リーグ判定ルールの固定（仕様）— **名簿を主とする（野手・投手）**

目的: **各 Yahoo ID が `CL` か `PL` か**を、打撃・投手で**同じ優先順位**で決める。

**野手（打撃ランキング向け）**

1. **第 1**: Yahoo 打者 ID → NPB ID（橋渡し・`MANUAL`）→ 名簿の `team` → 略称 → `CL` / `PL`。
2. **第 2**: canonical のチーム表記から略称→リーグ。
3. **第 3**: 手動マップ・CSV 追記。
4. **例外**: 未決定は両方に出さない等。

**投手（投手ランキング向け）**

1. **第 1**: Yahoo 投手 ID → NPB ID（`yahoo_pitcher_to_npb.json`・`MANUAL`・橋渡し）→ 名簿の `team` → 略称 → `CL` / `PL`。
2. **第 2**: 名簿に無い場合、試合ログから **`inferPitcherTeamForNf3Line` / `teamNameForYahooInDoc` 等**でチームを推定し、同じく略称→リーグ。
3. **第 3**: 手動マップの拡充。
4. **例外**: 野手と同様、重複掲載を防ぐ。

出力: 仕様メモ 1 ページ以内（`docs/` またはスクリプトコメント）。

**Phase 1 成果物（実施済み）**: [`docs/ranking_league_resolution_spec_2026.md`](./ranking_league_resolution_spec_2026.md)

---

### Phase 2: 打撃 `phase12` の実装改修

目的: **Phase 1** に従い、**CL・PL 両ディレクトリ**に同じ指標セットの JSON を出力する。

**実装済み**（`scripts/phase12_build_rankings_from_phase11.ts`）: `resolveBattingRankingLeagueBucket` で名簿優先→canonical→名簿（日本名）の順に CL/PL を決定。未決定は両リーグから除外し警告ログを出す。`npm run phase12:build:rankings` で `public/data/rankings/{year}/CL` と `.../PL` の両方へ出力。

対象: `scripts/phase12_build_rankings_from_phase11.ts`

要点: 集計後の打者ごとに **Phase 1（野手）** でリーグを 1 つ付与し、配列を分割。`getRomanNameMap(year,'CL'|'PL')` をリーグ別に使用。

飛ばせる条件: **`public/data/rankings/2026/PL/`** が生成され、中身が期待どおり分かれること。

---

### Phase 3: 投手集計・`phase19` の実装改修

目的: **試合ごとのスタメン優先**ではなく、**名簿優先で投手の `CL`/`PL` を決めたうえで**、`public/data/rankings/pitching/{year}/CL/` と `.../PL/` に書き出す。

**実装済み**（`lib/yahooGame/canonicalPitchingSeasonAgg.ts`）: `resolvePitcherRankingLeagueBucket(yahooId, docs)` で名簿（`findRosterPlayerByPublicId`／`findRosterPlayerByPublicIdOrJaName`）→ 試合ドキュメント上のチーム（`teamNameForYahooInDoc`）→ `inferPitcherTeamForNf3Line` の順に CL/PL を決定。`aggregatePitchingSeasonByYahooPlayer` は全試合集計**後**にこの関数でリーグを確定（試合ループ内での上書きは廃止）。`phase19` は集計の `league` をそのまま利用。

対象（想定）:

- `lib/yahooGame/canonicalPitchingSeasonAgg.ts` の `aggregatePitchingSeasonByYahooPlayer` 内の **リーグ付与**を、**Yahoo 投手 ID ごとに名簿→`leagueBucketForTeamShort`** を主とするロジックへ変更（フォールバックは Phase 1 の投手節に従う）。
- `scripts/phase19_build_pitching_rankings_from_canonical.ts` は、上記集計の `league` をそのまま用いて CL/PL へ振り分け（既存の `byLeague` 構造と整合）。

飛ばせる条件: **`PL` にパ所属投手が十分入り**、空配列に近い異常が解消されること（`assertPitchingRankingRosterComplete` も通ることを目標）。ビルドは **`npm run phase19:build:pitching-rankings`** で再生成する。

---

### Phase 4: ビルド実行と成果物の配置

目的: **2026 年**の打撃・投手ランキング JSON を再生成する。

```bash
npm run rankings:rebuild
```

または個別に:

```bash
npm run phase12:build:rankings
npm run phase19:build:pitching-rankings
```

確認:

- `public/data/rankings/2026/CL/`・`PL/`（打撃）
- `public/data/rankings/pitching/2026/CL/`・`PL/`（投手）  
  が揃い、**指標ファイル名が打撃・投手それぞれで一貫**していること。

---

### Phase 5: データ読み込み・フォールバックの検証

目的: **2026 / PL** を開いたとき、**意図しない年へのフォールバック**が残っていないこと。

- **打撃**: `loadRankingJson` で 2026 PL が存在すれば **2025 打撃へフォールバックしない**（開発時の警告が出ない）。
- **投手**: `loadPitchingRankingJson` は **2025 フォールバック無し**（`jsonLoader.ts` コメント参照）。**404 が出ない**こと。

---

### Phase 6: UI での受け入れ確認（ゴールの最終確認）

目的: **既存 UI** でセ／パを切り替えたとき、**それぞれのリーグの選手だけ**が並び、数値が埋まること。

実施（最小）:

1. `npm run dev`（1 インスタンス）。
2. **打撃**: `/ranking/2026/CL` と `/ranking/2026/PL` — 球団名がリーグに沿うこと、Network で `data/rankings/2026/{CL|PL}/...` を確認。
3. **投手**: `/ranking/pitching/2026/CL` と `/ranking/pitching/2026/PL`（実際のルートは `app/ranking/pitching/...` に準拠）— 同様に確認。

成功条件: 打撃・投手の両方で、**セ用・パ用の 2026 データが UI に反映**され、既知の欠損のみ説明可能であること。

---

## 一括実行メモ（参考）

```bash
npm run rankings:rebuild
```

---

## 関連ドキュメント・コード

| 領域 | パス |
|------|------|
| 打撃ランキング生成 | `scripts/phase12_build_rankings_from_phase11.ts` |
| 投手ランキング生成 | `scripts/phase19_build_pitching_rankings_from_canonical.ts` |
| 投手シーズン集計・現行リーグ付与 | `lib/yahooGame/canonicalPitchingSeasonAgg.ts`（`aggregatePitchingSeasonByYahooPlayer`） |
| 投手チーム推定（フォールバック） | `lib/yahooGame/pitcherPocHelpers.ts`（`inferPitcherTeamForNf3Line` 等） |
| 2026 年名簿 | `_data/npb_roster_2026.csv`、`lib/npbRoster.ts` |
| Yahoo↔NPB（打者） | `lib/yahooNpbBatterIdMap.ts`、`lib/yahooNpbBatterIdMap.manual.ts` |
| Yahoo↔NPB（投手インデックス） | `_data/scraped_games/derived/yahoo_pitcher_to_npb.json`（`build:yahoo-pitcher-npb-index`） |
| 略称・セ6/パ6 | `CSV_TEAM_TO_RANKING_SHORT`、`leagueBucketForTeamShort`（同上 `canonicalPitchingSeasonAgg.ts`） |
| JSON 取得 | `lib/ranking/jsonLoader.ts` |
| UI（打撃） | `app/ranking/[year]/[league]/` |
| UI（投手） | `app/ranking/pitching/[year]/[league]/` |

---

## 進め方（最短）

1. Phase 0（前提）
2. Phase 1（仕様：名簿主・野手・投手）
3. Phase 2（`phase12`）
4. Phase 3（投手集計 + `phase19`）
5. Phase 4（ビルド）
6. Phase 5（フォールバック検証）
7. Phase 6（UI 受け入れ）
