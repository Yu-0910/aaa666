# 選手個人ページ タブURL Phase 4 初期同期

対象日: 2026-07-03

目的:

- URL を直打ちしたとき、対応する既存タブを選択状態にする
- 既存のタブ本文、見出し、配置、文言は変えない

## 同期ルール

- `basic` -> 既存の基本成績タブ
- `pitch` -> 既存の球種情報タブ
- `situation` -> 既存の状況別タブ
- `matchup` -> 既存の対戦成績タブ
- `vs-team` -> 既存の球団別タブ
- `catcher` -> 既存の捕手成績タブ

## 実装位置

- URL section の正規化: `lib/playerPageTabUrlPhase2.ts`
- クライアント初期同期: `app/players/[playerId]/PlayerPageClient.tsx`

## legacy 互換

- `pitch-types` は `pitch` と同じ扱い
- `splits` は `situation` と同じ扱い
- `advanced` と `game-log` 系は `basic` 扱い

## 制約

- 今季タブを持つページでだけ同期を走らせる
- 通算専用シェルは強制的に今季へ戻さない
- 捕手タブは `showCatcherSeasonTab=true` のときだけ `catcher` へ同期し、それ以外は `basic` に戻す
