# 2026ドラフト候補ソート page phase 12 保存と再開

## 実行内容

phase 12 として、保存済みセッションの再開導線と保存データの最低限の検証を実装した。

## 更新ファイル

- `app/draft-candidate-sort/_lib/draftSortStorage.ts`
- `app/draft-candidate-sort/DraftCandidateSortStart.tsx`
- `app/draft-candidate-sort/result/DraftCandidateSortResult.tsx`

## 保存キー

localStorage の保存キーは以下。

```text
draft-candidate-sort:v1
```

## 保存内容

保存内容は以下。

- `version`
- `currentRoute`
- `targetFilter`
- `createdAt`
- `updatedAt`
- `candidateIds`
- `answers`
- `ranking`
- `unknownCounts`
- `tieGroups`
- `banzukeResult`
- `draftPredictionResult`
- `unknownResult`

## 再開導線

`/draft-candidate-sort` で保存済みセッションが見つかった場合、以下を表示する。

- 前回の続きがあります
- 対象候補
- 回答数
- 続きから再開
- 保存を消す

`続きから再開` を押すと、保存されている `currentRoute` へ遷移する。

`保存を消す` を押すと、保存済みセッションを削除する。

## 保存データ検証

`loadDraftSortSession` は以下を確認する。

- `version` が1
- `targetFilter` が存在する
- `currentRoute` が許可されたURL
- `answers` が配列
- `ranking` が配列
- `candidateIds` が配列

条件を満たさない場合は `null` を返す。

## 検証結果

2026-09-17 に以下を確認した。

- `/draft-candidate-sort`: 200
- `/draft-candidate-sort/result`: 200
- `createDraftSortSession("recommended")` が `/draft-candidate-sort/sort` を保存する
- `candidateIds` と `answers` が配列として生成される

## phase 12 完了条件

- 進行状況を localStorage に保存できる
- トップページで保存済みセッションを検出できる
- 保存済みセッションから再開できる
- 保存済みセッションを削除できる
- 壊れた保存データを最低限弾ける

phase 12 は完了とする。
