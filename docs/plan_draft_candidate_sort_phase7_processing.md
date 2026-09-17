# 2026ドラフト候補ソート page phase 7 結果作成中ページ

## 実行内容

phase 7 として、`/draft-candidate-sort/processing` で保存済み順位から結果用データを作成し、localStorage に保存してから `/draft-candidate-sort/result` へ遷移する処理を実装した。

## 追加ファイル

- `app/draft-candidate-sort/_lib/resultBuilder.ts`

## 更新ファイル

- `app/draft-candidate-sort/_lib/draftSortStorage.ts`
- `app/draft-candidate-sort/processing/ProcessingRedirect.tsx`

## 結果作成処理

`buildDraftSortResults` で以下を作成する。

- `banzukeResult`
- `draftPredictionResult`
- `unknownResult`

## 番付表用データ

`ranking` を2人ずつ東西に配置する。

ラベルは以下。

- 1組目: 横綱
- 2組目: 大関
- 3組目: 関脇
- 4組目: 小結
- 5組目以降: 前頭1、前頭2、前頭3

## ドラフト順位予想表用データ

`ranking` の上位36人を使う。

- 1位から12位: ドラフト1位予想
- 13位から24位: ドラフト2位予想
- 25位から36位: ドラフト3位予想

球団は使わない。

## 未評価が多い候補用データ

`unknownCounts` が1以上の候補を、回数が多い順に並べる。

## 遷移

`/draft-candidate-sort/processing` では最低0.8秒の読み込み表示を出す。

結果作成後、localStorage の `currentRoute` を `/draft-candidate-sort/result` に更新し、`/draft-candidate-sort/result` へ遷移する。

保存済みセッションが存在しない場合は `/draft-candidate-sort` に戻す。

## 検証結果

2026-09-17 に以下を確認した。

- `/draft-candidate-sort/processing`: 200
- 番付表用データで `横綱`、`大関`、`関脇`、`小結`、`前頭1` が生成される
- ドラフト順位予想表用データは36人まで生成される
- 36位はドラフト3位予想になる
- `unknownCounts` は回数が多い順に並ぶ

## phase 7 完了条件

- 最終順位リストから番付表用データを作れる
- 最終順位リストからドラフト順位予想表用データを作れる
- 未評価が多い候補用データを作れる
- 結果データを localStorage に保存できる
- 最低0.8秒の読み込み表示後に `/draft-candidate-sort/result` へ進める

phase 7 は完了とする。
