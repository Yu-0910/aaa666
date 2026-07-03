# 選手個人ページ タブURL Phase 3 ルーティング

対象日: 2026-07-03

目的:

- `/players/[playerId]/[[...rest]]` で canonical セグメントを受理する
- 旧 URL は新 URL へ正規化する
- 表示コンポーネントは既存のまま維持する

## 受理する canonical URL

- `/players/{slug}`
- `/players/{slug}/pitch`
- `/players/{slug}/situation`
- `/players/{slug}/matchup`
- `/players/{slug}/vs-team`
- `/players/{slug}/catcher`

## 旧 URL からの正規化

- `/players/{slug}/pitch-types` -> `/players/{slug}/pitch`
- `/players/{slug}/splits` -> `/players/{slug}/situation`
- `/players/{slug}/advanced` -> `/players/{slug}`
- `/players/{slug}/game-log` -> `/players/{slug}`
- `?tab=pitch-types` / `?tab=pitch` -> `/players/{slug}/pitch`
- `?tab=splits` / `?tab=situation` -> `/players/{slug}/situation`
- `?tab=advanced` / `?tab=game-log` 系 -> `/players/{slug}`

## 無効セグメント

- 投手で `vs-team` や `catcher` を開いた場合は `/players/{slug}` へ戻す
- 捕手以外で `catcher` を開いた場合も `/players/{slug}` へ戻す
- 未定義セグメントは `/players/{slug}` へ戻す

## この phase で変えていないもの

- 個人ページの見出し UI
- 今季 / 通算 の上段タブ
- 今季サブタブの文言・順番・位置
- 本文の描画分岐

初期表示でどの既存タブを選ぶかは、次の Phase 4 でクライアント同期として実装する。
