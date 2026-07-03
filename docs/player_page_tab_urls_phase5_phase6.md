# 選手個人ページ タブURL Phase 5-6

対象日: 2026-07-03

## Phase 5

目的:

- 既存タブをクリックしたときに URL も同期する
- 既存 UI の色、位置、文言、本文は変えない

実装:

- `PlayerPageClient.tsx` の今季サブタブ click handler で URL を更新
- 更新方法は History API の `pushState`
- `basic` に戻ると `/players/{slug}` に戻る
- クエリ文字列は保持する

## Phase 6

目的:

- サイト内で「そのタブを直接開きたい」リンクだけ新 URL に切り替える
- 通常の選手名リンクはベース URL を維持する

今回の反映先:

- `app/site-map/page.tsx`
- `app/sitemap.ts`

方針:

- サイトマップ上の明示的なタブリンクは `pitch / situation / matchup / vs-team / catcher` を使う
- 通常の `playerPageHref(...)` や選手名リンクは変更しない
