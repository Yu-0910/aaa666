# 重複選手URL Phase 5 ローカル検証

対象日: 2026-08-25

目的: 本番へ出す前に、代表重複ケースと非重複ケースのURL生成・URL解決が想定どおりであることを確認する。

## 検証観点

- 重複 historical が別URLになるか
- `roster vs historical` 衝突で roster が既存URL維持になっているか
- historical 側だけ `-npbPlayerId` 付きになっているか
- bare slug が最低限の後方互換として解決するか

## 検証結果

### 1. `kouji-yamamoto` 系

リンク生成:

- `11413869` 山本 幸二 -> `kouji-yamamoto-11413869`
- `31033842` 山本 功児 -> `kouji-yamamoto-31033842`
- `71273828` 山本 浩二 -> `kouji-yamamoto-71273828`

URL解決:

- `kouji-yamamoto-11413869` -> 山本 幸二
- `kouji-yamamoto-31033842` -> 山本 功児
- `kouji-yamamoto-71273828` -> 山本 浩二
- `kouji-yamamoto` -> 山本 幸二

### 2. `masahiro-tanaka`

リンク生成:

- `11215114` 田中 将大 -> `masahiro-tanaka`
- `71773865` 田中 昌宏 -> `masahiro-tanaka-71773865`

URL解決:

- `masahiro-tanaka` -> 田中 将大
- `masahiro-tanaka-71773865` -> 田中 昌宏

### 3. `seiji-kobayashi`

リンク生成:

- `91795139` 小林 誠司 -> `seiji-kobayashi`
- `21323842` 小林 誠二 -> `seiji-kobayashi-21323842`

URL解決:

- `seiji-kobayashi` -> 小林 誠司
- `seiji-kobayashi-21323842` -> 小林 誠二

## 検証結論

- 重複ケースは ID ベースで別URLへ分岐している
- roster の既存URLは維持されている
- historical 側は分岐URLで正しく解決されている
- bare slug も最低限の後方互換として動作している

## 次の焦点

- 本番デプロイ経路が正しいか
- `short-stop.jp` で同じ結果が確認できるか
