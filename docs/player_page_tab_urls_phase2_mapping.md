# 選手個人ページ タブURL Phase 2 定義

対象日: 2026-07-03

目的:

- URL セグメントと既存タブ state の対応だけを定義する
- 新規 canonical 名は `pitch`, `situation`, `matchup`, `vs-team`, `catcher` に限定する
- 旧名は互換読み替え専用にする

## canonical URL セグメント

| セグメント | 意味 | ベースURL |
| --- | --- | --- |
| `basic` | 基本成績 | `/players/{slug}` |
| `pitch` | 球種情報 | `/players/{slug}/pitch` |
| `situation` | 状況別 | `/players/{slug}/situation` |
| `matchup` | 対戦成績 | `/players/{slug}/matchup` |
| `vs-team` | 球団別 | `/players/{slug}/vs-team` |
| `catcher` | 捕手成績 | `/players/{slug}/catcher` |

## 既存 UI state への対応

### 投手

- `basic` -> `pitcherSeasonSubTab=basic`
- `pitch` -> `pitcherSeasonSubTab=pitch`
- `situation` -> `pitcherSeasonSubTab=situation`
- `matchup` -> `pitcherSeasonSubTab=matchup`

### 野手

- `basic` -> `kikuchiSeasonDetailTab=basic`
- `pitch` -> `kikuchiSeasonDetailTab=pitch`
- `situation` -> `kikuchiSeasonDetailTab=situation`
- `matchup` -> `kikuchiSeasonDetailTab=matchup`
- `vs-team` -> `kikuchiSeasonDetailTab=vs_team_pitch`

### 捕手

- `basic` -> `kikuchiSeasonDetailTab=basic`
- `pitch` -> `kikuchiSeasonDetailTab=pitch`
- `situation` -> `kikuchiSeasonDetailTab=situation`
- `matchup` -> `kikuchiSeasonDetailTab=matchup`
- `vs-team` -> `kikuchiSeasonDetailTab=vs_team_pitch`
- `catcher` -> `kikuchiSeasonDetailTab=catcher`

## 互換読み替え

旧名は canonical には残さず、読み替え専用とする。

- `pitch-types` -> `pitch`
- `splits` -> `situation`
- `advanced` -> `basic`
- `game-log` / `gamelog` / `game_log` -> `basic`
- `vs_team` / `vsteam` -> `vs-team`

## 無効セグメント

- 未定義のセグメントは `basic` 扱い
- つまり canonical URL はベースURLへ戻す前提の値だけを持つ
