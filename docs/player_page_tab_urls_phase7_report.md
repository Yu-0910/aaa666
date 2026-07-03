# 選手個人ページ タブURL Phase 7 確認結果

対象日: 2026-07-03

確認環境:

- ローカル開発環境 `http://127.0.0.1:3000`
- 代表 3 系統で確認
  - 投手: `/players/hiroto-takahashi`
  - 野手: `/players/teruaki-sato`
  - 捕手: `/players/seiya-hashimoto`

## 確認した URL

### 投手

- `/players/hiroto-takahashi`
- `/players/hiroto-takahashi/pitch`
- `/players/hiroto-takahashi/situation`
- `/players/hiroto-takahashi/matchup`

### 野手

- `/players/teruaki-sato`
- `/players/teruaki-sato/matchup`
- `/players/teruaki-sato/vs-team`

### 捕手

- `/players/seiya-hashimoto`
- `/players/seiya-hashimoto/catcher`

## 確認結果

- 選手名見出しは base URL とタブ URL で同一
- 上段タブは全ケースで `今季の成績 / 通算成績` の 2 件、位置も同一
- 今季サブタブの文言・順番・横位置は base URL とタブ URL で同一
- URL 直打ち時のみ、対象の既存サブタブが選択状態になった
- base URL では各系統とも `基本成績` が初期表示になった

## 確認中に見つかった不具合

- `/players/hiroto-takahashi/situation` で `ORDERED_PITCH_COUNT_KEYS is not defined` が発生
- 原因: `PlayerPagePitcherSeasonBody.tsx` で定数 import が欠落
- 対応: `@/lib/yahooGame/pitchCountSim` から `ORDERED_PITCH_COUNT_KEYS` を import
- 修正後、投手 `situation` URL でも既存 UI が正常表示されることを再確認済み

## 補足

- 投手 `situation` URL では既存挙動として `?yahooGameId=...` が自動付与される
- これは既存の試合 ID 同期挙動であり、見出し・タブ UI の差分ではない
