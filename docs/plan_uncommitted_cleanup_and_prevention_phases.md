# 未コミット混乱の掃除と再発防止計画

Date: 2026-09-15

## 目的

今回の混乱は、現在の本番が理想状態であるにもかかわらず、ローカル作業ツリーに過去の未コミット差分・未追跡ファイル・一時 deploy コピーが残り、どれが本番相当でどれが作業途中か判断しにくくなったことが原因だった。

この計画では、今ある未コミットを掃除した状態を維持し、今後も同じ混乱を起こさない運用へ固定する。

## 今回の原因

1. 本番反映を急ぐ局面で、リポジトリ直下に `.codex-deploy-*` の一時コピーや zip を作って deploy した。
2. deploy は成功しても、元の作業ツリーには別件の未コミット差分や未追跡ファイルが残った。
3. 本番 hotfix 後に、その本番相当の状態が通常の Git 履歴へすぐ固定されなかった。
4. 以前の計画書は clean deploy の考え方を持っていたが、「一時コピー deploy 後に元リポジトリへ本番状態を戻して commit する」までを必須ゲートにしていなかった。
5. そのため、次の修正時に古いローカル状態へ引きずられ、UI が本番理想状態から戻るリスクが残った。

## 現在の掃除済み状態

2026-09-15 時点で以下を実施済み。

- 現在の本番相当の状態をローカルへ戻した。
- 不要な未追跡ファイル、作業メモ、`.codex-deploy-*` 一時コピーを削除した。
- `.codex-deploy-*.zip` を `.gitignore` に追加した。
- 直近10試合 UI/API と予想投手カード分割の再発防止検証を通した。
- `Restore current production state` として commit 済み。
- `git status --short` が空であることを確認済み。

作業前バックアップ:

`C:\Users\short\AppData\Local\Temp\TopPage_cleanup_backup_20260915023301`

## 固定方針

- 本番 deploy は、原則として commit 済みの `HEAD` から行う。
- 本番 hotfix を一時コピーから出した場合でも、その本番相当状態を必ず元の作業ツリーへ戻し、検証し、commit する。
- deploy 用の一時コピーはリポジトリ直下に長期保存しない。
- 未コミット差分がある状態で、別件修正・本番反映・一括取得スクリプト修正を始めない。
- 生成物・一時ファイル・調査メモと、本番コード修正を同じ未コミット状態に混ぜない。

## Phase 1: 開始前ゲート

すべての作業開始時に、最初に以下を確認する。

```powershell
npm run ops:work-start
```

合格条件:

- `guard:no-deploy-artifacts passed.` が出る。
- dirty worktree の警告が出ない。
- 現在の `HEAD` commit が表示される。

未コミットがある場合:

- その差分が今回作業に必要か確認する。
- 必要なら先に commit する。
- 不要ならバックアップを作ってから破棄する。
- 判断不能なら作業を開始しない。

この Phase を飛ばして作業を始めない。

## Phase 2: 本番基準の明文化

ユーザーが「今の本番が理想」と言った場合、ローカルの未コミット差分ではなく、本番 deploy 済みの状態を基準にする。

実施内容:

1. 最新の本番 deploy URL / deploy id / alias を確認する。
2. その deploy に使ったソース状態を特定する。
3. ローカルがその状態とずれていれば、本番相当ファイルだけを戻す。
4. 戻した内容を検証して commit する。

禁止:

- ローカルに残った古い差分を「たぶん最新」とみなす。
- 一時コピー内の変更だけで本番反映を終え、元リポジトリを放置する。

## Phase 3: hotfix 後の必須 commit

本番 hotfix を行ったら、成功・失敗にかかわらず最後に以下を行う。

1. 本番へ出したコード差分を元リポジトリへ反映する。
2. 関連する再発防止テストを追加または更新する。
3. 不要な調査メモ・一時ファイルを削除する。
4. `git status --short` で残差分を確認する。
5. 本番相当の差分だけを commit する。
6. 再度 `git status --short` が空であることを確認する。

hotfix の完了定義:

- 本番が直っている。
- ローカルも本番相当に揃っている。
- commit が残っている。
- 未コミットが残っていない。

本番だけ直ってローカルが汚れている状態は、完了とみなさない。

## Phase 4: 一時コピーの扱い

一時コピーを使う場合は、原則としてリポジトリ外の一時ディレクトリを使う。

許容:

- `C:\Users\short\AppData\Local\Temp\...`
- 明示的な作業用 temp ディレクトリ

非推奨:

- `C:\dev\TopPage\.codex-deploy-*`

やむを得ずリポジトリ直下に作った場合:

1. deploy 後に元リポジトリへ必要差分を戻す。
2. commit する。
3. `.codex-deploy-*` を削除する。
4. `git status --short` が空であることを確認する。

機械ガード:

- `npm run guard:no-deploy-artifacts` は、リポジトリ直下の `.codex-deploy-*` ディレクトリ / zip が残っていれば失敗する。
- `guard:clean-worktree` / `guard:deploy-ui-worktree` / `guard:deploy-data-worktree` は、このガードを先頭で実行する。
- `npm run guard:deploy-worktree-health` は、`.codex-worktrees/prod` が存在する場合に dirty でなく、メイン worktree の `HEAD` と同期していることを確認し、管理中 worktree の一覧を表示する。
- `npm run ops:cleanup-deploy-artifacts` は削除対象の dry-run を表示する。
- `npm run ops:cleanup-deploy-artifacts:apply` は、リポジトリ直下の `.codex-deploy-*` だけをパス検証後に削除する。
- `npm run ops:cleanup-stale-worktrees` は、`.codex-worktrees/prod` 以外の管理 worktree 削除候補を dry-run 表示する。
- `npm run ops:cleanup-stale-worktrees:apply` は、dirty でない候補だけを `git worktree remove --force` で削除し、`git worktree prune` を実行する。
- `npm run ops:cleanup-stale-worktrees:discard` は、dirty な候補を `%TEMP%` に patch / status / 未追跡ファイル付きで退避してから削除する。

## Phase 5: 削除前バックアップ

未コミット差分を消す場合、削除前に必ずバックアップを作る。

```powershell
npm run ops:backup-dirty-worktree
```

最低限残すもの:

- `git diff` の patch
- staged diff の patch
- `git status --short` の結果
- 未追跡ファイル一覧
- 未追跡ファイルのコピー

バックアップ後にのみ、`git restore` や未追跡削除を行う。

禁止:

- バックアップなしの `git clean -fd`
- バックアップなしの広範囲削除
- `git reset --hard` の安易な使用

## Phase 6: deploy 前ゲート

コードを含む本番 deploy 前には、次を必須にする。

```powershell
npm run guard:deploy-ui-worktree
```

データ反映だけの場合は、次を使う。

```powershell
npm run guard:deploy-data-worktree
```

合格条件:

- 許可された差分以外がない。
- deploy 対象が意図した commit / 差分だけである。

このゲートで止まった場合は、deploy せず Phase 1 に戻る。

clean deploy の標準導線:

```powershell
npm run deploy:vercel:prod:clean
```

このコマンドは `scripts/deploy_vercel_prod_from_worktree.ps1` を通り、`.codex-worktrees/prod` の clean worktree を `HEAD` に合わせてから本番 deploy と公開確認を行う。通常の `deploy:vercel:prod` は直接 deploy 用であり、日常運用では `deploy:vercel:prod:clean` を優先する。

日次パイプライン内の自動 Vercel deploy も、実行直前に `npm run guard:deploy-data-worktree` を通す。これにより、R2 反映後のプロキシ再デプロイでも UI / script の未コミット差分が混ざる経路を塞ぐ。

## Phase 7: 検証と commit の分離

検証用スクリプト・再発防止テストは commit 対象に含める。

ただし、以下は commit しない。

- 実行ログ
- 調査メモ
- 一時 zip
- deploy 用コピー
- ローカル生成データ
- R2 へ upload 済みの表示 JSON のローカル残骸

コード修正と大量生成物が同時に `git status` に出た場合:

1. コード修正を先に commit する。
2. 生成物は ignore / R2 / ローカル工場出力として扱う。
3. 生成物を Git 管理に戻さない。

## Phase 8: 一括取得スクリプト修正時の追加ルール

一括取得スクリプトを修正した場合は、修正完了後に以下を必ず行う。

1. 該当スクリプトの単体検証を実行する。
2. 可能なら本番で起きた失敗ケースを fixture / unit test に追加する。
3. `_data/scraped_games/_meta/bulk_issue_fix.log` に原因と修正内容を追記する。
4. 本番反映が必要なら、R2 upload / Vercel deploy のどちらが必要かを分けて実行する。
5. 最後に commit する。

重要:

- スクリプトだけ直して未コミットに置かない。
- 本番データだけ直してスクリプト修正を未コミットに残さない。
- 再発防止テストなしで同じ系統の修正を終えない。

## Phase 9: 終了前ゲート

作業終了前に必ず以下を確認する。

```powershell
npm run ops:work-finish
```

合格条件:

- `guard:no-deploy-artifacts passed.` が出る。
- dirty worktree の警告が出ない。
- 最終 commit が表示される。

空でない場合:

- 残すものは commit する。
- 消すものはバックアップ後に削除する。
- 判断保留のものがある場合は、最終報告で「未コミットとして残した理由」を明記する。

終了報告には以下を含める。

- commit hash
- 実行した検証
- 本番反映の有無
- 未コミットが空かどうか

## Phase 10: 運用の固定化

今後の標準手順を以下に固定する。

通常修正:

1. Phase 1
2. 修正
3. 検証
4. commit
5. 必要なら deploy
6. Phase 9

本番 hotfix:

1. Phase 1
2. 本番基準確認
3. hotfix
4. 本番反映
5. 元リポジトリへ本番相当を反映
6. 検証
7. commit
8. 一時コピー削除
9. Phase 9

一括取得スクリプト修正:

1. Phase 1
2. 原因究明
3. スクリプト修正
4. 失敗ケースの検証追加
5. 実データ再生成 / R2 upload / deploy の必要性を分離判断
6. commit
7. Phase 9

運用 script の配線確認:

- `npm run validate:pipeline-output-guards` は、`guard:clean-worktree` が deploy artifact guard を含むこと、`ops:work-start` / `ops:work-finish` が clean gate を通ること、`deploy:vercel:prod:clean` が deploy worktree スクリプトを使うことを検証する。
- この検証が落ちた場合は、未コミット混乱防止の運用が壊れたものとして扱う。

## 今回の失敗を防ぐための合格条件

この計画が効いている状態とは、次を満たす状態である。

- 本番 deploy 後にローカル未コミットが残らない。
- 一時コピー deploy の結果が元リポジトリの commit として残る。
- `git status --short` が作業開始前・終了前に空である。
- 生成物や deploy 一時ファイルが Git 状態に混ざらない。
- 同じ失敗ケースが検証スクリプトで落ちる。
- 「今の本番が理想」と言われたとき、ローカル差分ではなく本番相当 commit を基準に復元できる。
