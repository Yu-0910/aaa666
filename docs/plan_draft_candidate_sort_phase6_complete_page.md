# 2026ドラフト候補ソート page phase 6 質問完了ページ

## 実行内容

phase 6 として、`/draft-candidate-sort/complete` で保存済みセッションを読み込み、結果作成前の確認画面を実装した。

## 追加ファイル

- `app/draft-candidate-sort/complete/DraftCandidateSortComplete.tsx`

## 更新ファイル

- `app/draft-candidate-sort/complete/page.tsx`

## 表示内容

`/draft-candidate-sort/complete` では以下を表示する。

- 回答した比較数
- 選択したソート対象
- 引き分け回答数
- 両方知らない回答数
- `少し戻って修正する` ボタン
- `結果を作成する` ボタン

## 遷移

`少し戻って修正する` を押した場合は、localStorage の `currentRoute` を `/draft-candidate-sort/sort` に更新し、`/draft-candidate-sort/sort` へ進む。

`結果を作成する` を押した場合は、localStorage の `currentRoute` を `/draft-candidate-sort/processing` に更新し、`/draft-candidate-sort/processing` へ進む。

保存済みセッションが存在しない場合は `/draft-candidate-sort` に戻す。

## 検証結果

2026-09-17 に以下を確認した。

- `/draft-candidate-sort/complete`: 200
- 回答数、引き分け数、両方知らない数をセッションから集計できる
- `recommended` の対象選択が保持される

## phase 6 完了条件

- 保存済みセッションを読み込める
- 回答した比較数を表示できる
- 選択したソート対象を表示できる
- 引き分け数を表示できる
- 両方知らない数を表示できる
- `少し戻って修正する` で `/draft-candidate-sort/sort` に戻れる
- `結果を作成する` で `/draft-candidate-sort/processing` に進める

phase 6 は完了とする。
