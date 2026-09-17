# 2026ドラフト候補ソート page phase 2 ページ遷移実装

## 実行内容

phase 2 として、ドラフト候補ソート用のページ遷移骨格を実装した。

既存サイトでは `/` がトップページとして使用済みのため、既存トップページを壊さないよう、実装URLは `/draft-candidate-sort` 配下にまとめる。

## 実装URL

1. `/draft-candidate-sort`
2. `/draft-candidate-sort/sort`
3. `/draft-candidate-sort/complete`
4. `/draft-candidate-sort/processing`
5. `/draft-candidate-sort/result`

## 遷移順

```text
/draft-candidate-sort
↓
/draft-candidate-sort/sort
↓
/draft-candidate-sort/complete
↓
/draft-candidate-sort/processing
↓
/draft-candidate-sort/result
```

## 追加ファイル

- `app/draft-candidate-sort/page.tsx`
- `app/draft-candidate-sort/sort/page.tsx`
- `app/draft-candidate-sort/complete/page.tsx`
- `app/draft-candidate-sort/processing/page.tsx`
- `app/draft-candidate-sort/processing/ProcessingRedirect.tsx`
- `app/draft-candidate-sort/result/page.tsx`
- `app/draft-candidate-sort/_components/DraftSortShell.tsx`

## 現時点の範囲

phase 2 では、独立URLと画面遷移を確認できるページ骨格のみ実装した。

候補者データ、ソート処理、localStorage復元、番付表生成、ドラフト順位予想表生成は phase 3 以降で接続する。

## phase 2 完了条件

- ソート対象選択ページがある
- 比較ページがある
- 質問完了ページがある
- 結果作成中ページがある
- 結果ページがある
- 各ページが独立したURLを持つ
- 計画した順番でページ遷移できる
- 既存トップページを変更していない

## 検証結果

2026-09-17 に dev server `http://localhost:3010` で以下を確認した。

- `/draft-candidate-sort`: 200
- `/draft-candidate-sort/sort`: 200
- `/draft-candidate-sort/complete`: 200
- `/draft-candidate-sort/processing`: 200
- `/draft-candidate-sort/result`: 200

全体 `tsc` は既存の別領域エラーで失敗するため、phase 2 の完了判定からは切り分ける。

phase 2 は完了とする。
