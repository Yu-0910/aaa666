# 重複選手URL Phase 2 仕様確定

対象日: 2026-08-25

目的: 重複選手URLの分岐仕様を固定し、Phase 3 の実装基準を明文化する。

## 仕様

### 1. 非重複選手

- 既存 slug を維持する
- URLは変更しない

例:

- `teruaki-sato`
- `hiroto-takahashi`

### 2. 重複選手

- URL形式は `baseSlug-npbPlayerId` を採用する
- `npbPlayerId` が一意性の最終キーになる

例:

- `kouji-yamamoto-11413869`
- `kouji-yamamoto-31033842`
- `kouji-yamamoto-71273828`

### 3. roster と historical の衝突

- roster 側は既存 slug を優先維持する
- historical 側だけ `-npbPlayerId` 付きへ分岐する

例:

- `masahiro-tanaka` は田中 将大
- `masahiro-tanaka-71773865` は田中 昌宏

### 4. historical 同士の衝突

- 全員 `-npbPlayerId` 付きへ分岐する
- bare slug は後方互換用の入口としてのみ扱う

例:

- `kouji-yamamoto-11413869`
- `kouji-yamamoto-31033842`
- `kouji-yamamoto-71273828`

### 5. bare slug の後方互換

- bare slug は完全廃止しない
- 既存リンク保護のため、1件だけ解決先を残す
- どの選手に向けるかは historical override の先勝ちとする

現時点の例:

- `kouji-yamamoto` は `11413869` へ解決

### 6. サイト内リンク生成

- `npbPlayerId` がある場合は、それを最優先に使用する
- historical ID は roster fallback より先に評価する
- 同一ローマ字でも、ID が異なれば別URLを返す

## 代表ケース

### historical 3件衝突

- `kouji-yamamoto-11413869` 山本 幸二
- `kouji-yamamoto-31033842` 山本 功児
- `kouji-yamamoto-71273828` 山本 浩二

### roster / historical 衝突

- `masahiro-tanaka` 田中 将大
- `masahiro-tanaka-71773865` 田中 昌宏

- `seiji-kobayashi` 小林 誠司
- `seiji-kobayashi-21323842` 小林 誠二

## Phase 2 結論

- 非重複選手は変更しない
- 重複選手のみ `-npbPlayerId` で一意化する
- roster を壊さず、historical を分岐させる
- bare slug は互換入口として最低限残す
