# Clean Deploy Workflow

UI やページ構成は変えず、`push` / 本番 deploy の安全性だけを上げるための運用メモ。

## 追加したもの

- `npm run guard:clean-worktree`
  - 今の worktree に未コミット差分や未追跡ファイルがあると、通常の `deploy:vercel:prod` を止める。
- `npm run worktree:deploy:init`
  - `.codex-worktrees/prod` に deploy 専用の clean worktree を作る。
- `npm run deploy:vercel:prod:clean`
  - deploy 専用 worktree を最新 `HEAD` に合わせて、本番 deploy と公開確認まで実行する。

## 普段の使い方

1. 通常作業は今までどおりメイン worktree で進める。
2. 本番に出したい変更を commit / push する。
3. 本番 deploy は `npm run deploy:vercel:prod:clean` を使う。

## 期待する効果

- `_data` の差分が大量に残っていても、deploy は clean worktree 側から実行される。
- メイン worktree の汚れで `vercel --prod` に依頼外の変更が混ざりにくくなる。
- 間違ってメイン worktree で `npm run deploy:vercel:prod` を実行しても、dirty check で止まる。

## 補足

- `.codex-worktrees/prod` には `node_modules` と `.vercel` の junction を張る。
- `.env.local` と `.env` は必要なら deploy worktree 側へコピーする。
- 既に Git 管理されている生成物は `.gitignore` 追加だけでは消えない。そういう差分が残っていても、本番 deploy 自体は clean worktree 経由で回避できるようにしている。
