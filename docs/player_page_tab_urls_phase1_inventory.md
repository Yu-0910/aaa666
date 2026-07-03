# 選手個人ページ タブURL Phase 1 棚卸し

対象日: 2026-07-03

目的:

- 現行の個人ページで正として扱う今季サブタブを固定する
- URL 側の責務と、既存 UI state の責務を分離して把握する
- 旧 `tab` クエリや既存の暫定 URL を一覧化する

## 現行 UI state

- 投手: `pitcherSeasonSubTab`
- 野手: `kikuchiSeasonDetailTab`
- 捕手: 野手系 UI のうち `kikuchiSeasonDetailTab=catcher` を使用
- 上段タブの今季 / 通算: `statsTab`

## URL と既存タブ状態の対応表

### 投手

| URL役割 | 既存タブ文言 | 現行 state | 将来URL |
| --- | --- | --- | --- |
| 基本 | 基本成績 | `pitcherSeasonSubTab=basic` | `/players/{slug}` |
| 球種 | 球種情報 | `pitcherSeasonSubTab=pitch` | `/players/{slug}/pitch` |
| 状況別 | 状況別 | `pitcherSeasonSubTab=situation` | `/players/{slug}/situation` |
| 対戦 | 対戦成績 | `pitcherSeasonSubTab=matchup` | `/players/{slug}/matchup` |

### 野手

| URL役割 | 既存タブ文言 | 現行 state | 将来URL |
| --- | --- | --- | --- |
| 基本 | 基本成績 | `kikuchiSeasonDetailTab=basic` | `/players/{slug}` |
| 球種 | 球種情報 | `kikuchiSeasonDetailTab=pitch` | `/players/{slug}/pitch` |
| 状況別 | 状況別 | `kikuchiSeasonDetailTab=situation` | `/players/{slug}/situation` |
| 対戦 | 対戦成績 | `kikuchiSeasonDetailTab=matchup` | `/players/{slug}/matchup` |
| 球団別 | 球団別 | `kikuchiSeasonDetailTab=vs_team_pitch` | `/players/{slug}/vs-team` |

### 捕手

| URL役割 | 既存タブ文言 | 現行 state | 将来URL |
| --- | --- | --- | --- |
| 基本 | 基本成績 | `kikuchiSeasonDetailTab=basic` | `/players/{slug}` |
| 球種 | 球種情報 | `kikuchiSeasonDetailTab=pitch` | `/players/{slug}/pitch` |
| 状況別 | 状況別 | `kikuchiSeasonDetailTab=situation` | `/players/{slug}/situation` |
| 対戦 | 対戦成績 | `kikuchiSeasonDetailTab=matchup` | `/players/{slug}/matchup` |
| 球団別 | 球団別 | `kikuchiSeasonDetailTab=vs_team_pitch` | `/players/{slug}/vs-team` |
| 捕手 | 捕手成績 | `kikuchiSeasonDetailTab=catcher` | `/players/{slug}/catcher` |

## 現在のサーバー側 URL 解決

- ベース: `/players/[playerId]`
- 追加受理: `/players/[playerId]/[...rest]`
- 現在読める `rest` は `advanced`, `splits`, `game-log`, `pitch-types`
- 無効な `rest` は `basic` 扱い

## 旧 `tab` クエリ読み替え

`playerRouteServer.ts` で現在読んでいる互換クエリ:

| 旧クエリ値 | 現在の内部 section |
| --- | --- |
| `advanced` | `advanced` |
| `splits` | `splits` |
| `situation` | `splits` |
| `game-log` / `gamelog` / `game_log` | `game-log` |
| `pitch-types` / `pitch` | `pitch-types` |
| その他 | `basic` |

## Phase 1 の結論

- 投手 4、野手 5、捕手 6 のタブ URL 対応表は確定
- 将来 URL セグメントは `pitch`, `situation`, `matchup`, `vs-team`, `catcher`
- 現在の暫定 section 名 `advanced`, `splits`, `game-log`, `pitch-types` は互換読み替え対象として残っている
- 次の Phase 2 では、上記の将来 URL セグメントと既存 UI state の対応だけを追加し、見出しや本文分岐は変えない
