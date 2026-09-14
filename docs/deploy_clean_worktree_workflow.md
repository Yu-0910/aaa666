# Clean Deploy Workflow

UI やページ構成は変えず、`push` / 本番 deploy の安全性だけを上げるための運用メモ。

## 追加したもの

- `npm run ops:work-start`
  - 作業開始時に、deploy 一時成果物なし + clean worktree + 現在の `HEAD` を確認する。
- `npm run ops:work-finish`
  - 作業終了時に同じ確認を行い、未コミットを残していないことを確認する。
- `npm run ops:backup-dirty-worktree`
  - 未コミットを消す前に、patch / status / 未追跡一覧 / 未追跡ファイルコピーを `%TEMP%` に退避する。
- `npm run ops:cleanup-deploy-artifacts`
  - リポジトリ直下の `.codex-deploy-*` 一時成果物を dry-run 表示する。
- `npm run ops:cleanup-deploy-artifacts:apply`
  - リポジトリ直下の `.codex-deploy-*` 一時成果物だけをパス検証後に削除する。
- `npm run guard:clean-worktree`
  - 今の worktree に未コミット差分や未追跡ファイルがあると止める。`.codex-deploy-*` が残っている場合も止める。
- `npm run guard:deploy-data-worktree`
  - R2 反映後のプロキシ再デプロイなど、データ反映用途の deploy 前 gate。日次パイプラインの自動 Vercel deploy 直前にも実行される。
- `npm run worktree:deploy:init`
  - `.codex-worktrees/prod` に deploy 専用の clean worktree を作る。
- `npm run deploy:vercel:prod:clean`
  - deploy 専用 worktree を最新 `HEAD` に合わせて、本番 deploy と公開確認まで実行する。

## 普段の使い方

1. 作業開始時に `npm run ops:work-start` を実行する。
2. 通常作業は今までどおりメイン worktree で進める。
3. 本番に出したい変更を commit / push する。
4. 本番 deploy は `npm run deploy:vercel:prod:clean` を使う。
5. 作業終了時に `npm run ops:work-finish` を実行する。

## 期待する効果

- `_data` の差分が大量に残っていても、deploy は clean worktree 側から実行される。
- メイン worktree の汚れで `vercel --prod` に依頼外の変更が混ざりにくくなる。
- 間違ってメイン worktree で `npm run deploy:vercel:prod` を実行しても、dirty check で止まる。
- ignore 済みで `git status` に出ない `.codex-deploy-*` 一時成果物も検出できる。
- 日次パイプライン内の自動 Vercel deploy も、実行直前に data deploy gate を通る。

## 補足

- `.codex-worktrees/prod` には `node_modules` と `.vercel` の junction を張る。
- `.env.local` と `.env` は必要なら deploy worktree 側へコピーする。
- 既に Git 管理されている生成物は `.gitignore` 追加だけでは消えない。そういう差分が残っていても、本番 deploy 自体は clean worktree 経由で回避できるようにしている。
- 未コミット差分を消す場合は、先に `npm run ops:backup-dirty-worktree` を実行する。
