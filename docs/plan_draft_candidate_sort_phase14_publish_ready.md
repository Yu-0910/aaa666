# 2026ドラフト候補ソート page phase 14 公開準備

## 実行内容

phase 14 として、公開準備用の表示文言と noindex 方針を確認した。

## 更新ファイル

- `app/draft-candidate-sort/_components/DraftSortShell.tsx`

## 免責文

ページ下部に以下の免責文を表示する。

```text
候補者情報は公開されている情報をもとに作成しています。
最新情報は各公式・関連情報をご確認ください。
本ページの順位はユーザーの選択結果に基づく個人的な予想・好み表です。
```

## リンク方針

初期版では外部リンクを張らない。

`app/draft-candidate-sort` 配下に外部URLは含めない。

## 検索エンジン方針

各ページの metadata は以下にする。

- `index: false`
- `follow: false`

現時点ではローカル確認・非公開確認用の完成形とする。

## 検証結果

2026-09-17 に以下を確認した。

- `/draft-candidate-sort`: 200
- draft candidate sort phase13 validation passed
- `app/draft-candidate-sort` 配下に外部URLなし
- `未評価` という文言はユーザー操作の `両方知らない` に由来する機能名であり、外部データ上の評価ではない

## phase 14 完了条件

- 免責文を表示する
- 外部リンクを張らない
- noindex / nofollow にする
- ローカルURLから対象選択、比較、完了確認、作成中、結果画面へ進める

phase 14 は完了とする。
