# 2026ドラフト候補ソート page phase 5 二者択一ソート

## 実行内容

phase 5 として、二者択一ソートの状態管理、回答記録、引き分け制御、「両方知らない」の扱いを実装した。

## 追加ファイル

- `app/draft-candidate-sort/_lib/sortEngine.ts`
- `app/draft-candidate-sort/sort/DraftCandidateSortQuestion.tsx`

## 更新ファイル

- `app/draft-candidate-sort/_lib/draftSortStorage.ts`
- `app/draft-candidate-sort/sort/page.tsx`

## ソート状態

`DraftSortState` に以下を保持する。

- `candidateIds`
- `comparisonQueue`
- `currentIndex`
- `answers`
- `ranking`
- `unknownCounts`
- `tieGroups`
- `completed`

## 回答

回答値は以下に固定する。

- `left`
- `right`
- `tie`
- `unknown`

`left` と `right` は順位リストを更新する。

`tie` は同順位グループに記録する。

`unknown` は左右両方の `unknownCount` を増やし、その比較では順位を入れ替えない。

## 引き分けボタン制御

「どちらも同じくらい」ボタンの制御は以下。

- 全回答数が10件未満の場合は表示する
- 全回答数が10件以上で、引き分け回答数 ÷ 全回答数 が20%以上の場合は非表示にする
- 戻る操作で条件を下回った場合は再表示する

## 戻る操作

戻る操作は直前の回答を取り消す。

取り消し後は、残った回答を初期状態から再適用して状態を復元する。

## `/sort` 画面

`/draft-candidate-sort/sort` は localStorage のセッションを読み込む。

セッションがない場合は `/draft-candidate-sort` に戻す。

候補者データがまだ空の場合は、候補者データ投入後に質問を表示する旨を出す。

候補者データ投入後は、現在の比較、回答ボタン、進行数を表示する。

## 検証結果

2026-09-17 に以下を確認した。

- `/draft-candidate-sort/sort`: 200
- `unknown` 回答で左右両方の `unknownCount` が1増える
- 全回答数10件、引き分け2件の場合、引き分けボタンは非表示判定になる
- 戻る操作で全回答数9件に戻ると、引き分けボタンは再表示判定になる

## 現時点の範囲

phase 5 ではソートエンジンと `/sort` 画面の接続を実装した。

実候補者データがまだ空のため、画面上では質問カードの本運用表示は始まらない。

候補者データ投入後、同じエンジンを使って二者択一を進める。

## phase 5 完了条件

- 二者択一の回答を保存できる
- `left` と `right` で順位を更新できる
- `tie` を同順位として記録できる
- `unknown` で未評価回数を記録できる
- 引き分けボタンを20%ルールで自動制御できる
- 戻る操作で直前回答を取り消せる
- `/sort` が localStorage のセッションを読み込める

phase 5 は完了とする。
