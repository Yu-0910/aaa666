# 2026ドラフト候補ソート page phase 4 ソート対象の選択

## 実行内容

phase 4 として、トップページでソート対象を選択し、開始時に選択内容を保存して `/draft-candidate-sort/sort` へ進む処理を実装した。

## 追加ファイル

- `app/draft-candidate-sort/DraftCandidateSortStart.tsx`
- `app/draft-candidate-sort/_lib/draftSortStorage.ts`

## 更新ファイル

- `app/draft-candidate-sort/page.tsx`

## 選択肢

トップページで選べる対象は以下。

1. 全候補
2. 高校生のみ
3. 大学生のみ
4. 大学、社会人のみ
5. 中位以上候補

初期選択は `中位以上候補` とする。

## 中位以上候補の表示

`中位以上候補` は以下の表示にする。

- 黄色い四角で囲む
- `オススメ` と表示する
- `迷ったらここから` と表示する
- 判定根拠は表示しない

## 全候補の注意文

`全候補` を選んだ場合だけ、以下を表示する。

```text
全候補を対象にすると比較回数が多くなります。
時間をかけてじっくり作成したい場合におすすめです。
```

## 保存仕様

開始ボタンを押すと、localStorage に以下の形式で保存する。

保存キーは以下。

```text
draft-candidate-sort:v1
```

保存される主な内容は以下。

- `version`
- `currentRoute`
- `targetFilter`
- `createdAt`
- `updatedAt`
- `answers`
- `ranking`
- `banzukeResult`
- `draftPredictionResult`

`currentRoute` は `/draft-candidate-sort/sort` として保存する。

## 検証結果

2026-09-17 に以下を確認した。

- `/draft-candidate-sort`: 200
- `createDraftSortSession("recommended")` の `currentRoute`: `/draft-candidate-sort/sort`
- `createDraftSortSession("recommended")` の `targetFilter`: `recommended`
- 初期回答数: 0

## 現時点の範囲

phase 4 では、対象選択と保存、次ページへの遷移までを実装した。

`/sort` 側で保存済み対象を読み込んで実際の候補者リストを作る処理は phase 5 以降で行う。

## phase 4 完了条件

- 5つの対象から選択できる
- `中位以上候補` が黄色いおすすめ表示になっている
- 判定根拠が画面に出ていない
- `全候補` 選択時だけ注意文が出る
- 開始時に `targetFilter` が localStorage に保存される
- 開始後に `/draft-candidate-sort/sort` へ進む

phase 4 は完了とする。
