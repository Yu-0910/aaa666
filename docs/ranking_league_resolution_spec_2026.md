# ランキング用リーグ判定（CL / PL）仕様 — 2026

親計画: [`plan_batting_rankings_cl_pl_2026.md`](./plan_batting_rankings_cl_pl_2026.md) の **Phase 1** 成果物。実装（Phase 2〜3）は本書に従う。

## 目的

シーズンランキングで、各 **Yahoo 選手 ID**（打者・投手）について **1 つだけ** `CL` または `PL` を付与し、**セ用 JSON とパ用 JSON のどちらに載せるか**を決める。

## リーグの定義（略称 → CL / PL）

- **名簿・canonical から得た球団名**を、既存の略称に正規化する（`CSV_TEAM_TO_RANKING_SHORT`、例: `中日ドラゴンズ` → `中日`）。
- **略称が次の 6 つなら `CL`**、それ以外なら `PL`（`leagueBucketForTeamShort` と同一）。

セ・リーグ 6 球団の略称: `巨人`, `阪神`, `中日`, `広島`, `DeNA`, `ヤクルト`

## 野手（打撃ランキング）

| 順位 | 手順 |
|------|------|
| 1（主） | Yahoo **打者** ID → `resolveNpbPlayerIdFromPublicId` および `_data/scraped_games/derived/2021038624_batting_master_bridge.csv` / `MANUAL_YAHOO_TO_NPB`（`lib/yahooNpbBatterIdMap.manual.ts`）で **NPB `npb_player_id`** を得る。`_data/npb_roster_2026.csv` で当該 ID の **`team`** を読み、略称化 → `CL`/`PL`。 |
| 2 | NPB ID が取れない・名簿に行が無い: **canonical** の当該選手のチーム表記（スタメン／`battingLines` 等）からフル名または略称を得て、略称化 → `CL`/`PL`。 |
| 3 | まだ無い: **橋渡し CSV 追記**または **`MANUAL_YAHOO_TO_NPB` 追記**後に 1 に戻す。 |
| 例外 | **`CL`/`PL` が決まらない**選手は、**両方のランキング JSON に載せない**（行を出さない）。重複掲載は禁止。 |

## 投手（投手ランキング）

| 順位 | 手順 |
|------|------|
| 1（主） | Yahoo **投手** ID → `_data/scraped_games/derived/yahoo_pitcher_to_npb.json` / 橋渡し / `MANUAL_YAHOO_TO_NPB` で **NPB ID** → 名簿 **`team`** → 略称 → `CL`/`PL`。 |
| 2 | 名簿に行が無い、または Yahoo↔NPB が無い: **試合 canonical** から `inferPitcherTeamForNf3Line` または `teamForYahooPlayerId` / `teamNameForYahooInDoc`（`lib/yahooGame/pitcherPocHelpers.ts` / `canonicalPitchingSeasonAgg.ts`）で **所属チーム名**を推定し、略称化 → `CL`/`PL`。 |
| 3 | まだ無い: **手動マップ・投手インデックス再生成**（`npm run build:yahoo-pitcher-npb-index`）・`MANUAL` 追記。 |
| 例外 | 野手と同様。**未決定は両リーグに出さない**。 |

## 実装上の参照

- 名簿: `lib/npbRoster.ts`（`getNpbRoster2026`, `findRosterPlayerByPublicId`）
- Yahoo↔NPB: `lib/yahooNpbBatterIdMap.ts`
- 略称・CL/PL 判定: `lib/yahooGame/canonicalPitchingSeasonAgg.ts`（`CSV_TEAM_TO_RANKING_SHORT`, `leagueBucketForTeamShort`）

## 変更履歴

- 2026-04-17: Phase 1 として初版（名簿主・フォールバック・重複禁止を明文化）。
