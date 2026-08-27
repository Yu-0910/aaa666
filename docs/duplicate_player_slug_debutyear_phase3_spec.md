# 重複選手URL変更 `slug-debutyear` Phase 3 衝突再判定仕様

実施日: 2026年8月27日

目的: `slug-debutyear` を全重複対象へ適用したときに再衝突が残るかを確認し、必要最小限のフォールバック規則を固定する。

## 結論

- `slug-debutyear` は大半の重複をそのまま解消できる
- 対象 187 件のうち、`slug-debutyear` でも再衝突するのは **2 グループのみ**
- したがって基本規則は `slug-debutyear` でよい
- ただし再衝突 2 グループに限り、追加フォールバックが必要

## 集計結果

- 現在の historical 分岐対象: 187 件
- うち「別人区別のための分岐」対象: 176 件
- うち roster / historical 同一 `npbPlayerId` 重複: 11 件
- `debutYear` 欠損: 0 件
- `slug-debutyear` 再衝突グループ: 2

補足:

- 11 件の same-id ケースは、別人区別ではなく同一選手が `2026 roster` と `historical` に共存しているもの
- コア設計上の論点は 176 件の true disambiguation target

## 基本規則

- 非重複選手: bare slug 維持
- 現役選手: bare slug 維持
- historical の重複選手: `slug-debutyear`

例:

- `kouji-yamamoto-1984`
- `kouji-yamamoto-1976`
- `kouji-yamamoto-1969`
- `masahiro-tanaka-1982`
- `seiji-kobayashi-1976`

## 再衝突が残るケース

### 1. `gonzaresu-ruisu-2005`

対象:

- `23125114` / L.ゴンザレス / `gonzaresu-ruisu-2005`
- `53755133` / L.ゴンザレス / `gonzaresu-ruisu-2005`

所見:

- 同一ローマ字
- 同一年デビュー
- `slug-debutyear` だけでは一意にならない

### 2. `tetsuya-yamamoto-2011`

対象:

- `11615131` / 山本 哲哉 / `tetsuya-yamamoto-2011`
- `31835118` / 山本 徹矢 / `tetsuya-yamamoto-2011`

所見:

- 同一ローマ字
- 同一年デビュー
- `slug-debutyear` だけでは一意にならない

## フォールバック規則

基本方針:

- まず `slug-debutyear`
- 同一 `slug-debutyear` が複数件ある場合のみ、さらに `npbPlayerId` を末尾追加する

最終規則:

- 第1候補: `{baseSlug}-{debutYear}`
- 第2候補: `{baseSlug}-{debutYear}-{npbPlayerId}`

例:

- 通常ケース: `kouji-yamamoto-1984`
- 再衝突ケース: `gonzaresu-ruisu-2005-23125114`
- 再衝突ケース: `tetsuya-yamamoto-2011-11615131`

この規則を採る理由:

- ほとんどの URL は人間に読みやすい `slug-debutyear` で済む
- 例外 2 グループだけを追加 suffix で処理できる
- 全件に ID を見せる設計へ戻らずに済む

## bare slug の扱い

- bare slug は従来どおり後方互換 alias として残す
- `current-vs-historical` の別人衝突では、bare slug は現役側を優先
- `historical-vs-historical` では、既存の後方互換方針を維持する

補足:

- bare slug をどの historical へ向けるかは Phase 4 の固定マップ設計で明示する
- 今回 Phase 3 では、命名規則だけを確定する

## same-id ケースの扱い

対象 11 件:

- `hiroto-mori`
- `hitomi-honda`
- `kotarou-seimiya`
- `kousuke-baba`
- `masumi-hamachi`
- `misaki-sasahara`
- `shinnosuke-ogasawara`
- `tatsuto-kobayashi`
- `tsuyoshi-yamasaki`
- `yamato-shiroki`
- `yuuma-fukumoto`

判断:

- これらは別人区別の問題ではない
- ただし現行実装では historical 側に suffix が付いているため、移行時も互換を壊さない設計が必要
- よって一旦は `historical 側 URL の置換対象` に含めるが、優先度は true disambiguation target より下げて扱う

## 代表ケース

### `kouji-yamamoto`

- 山本 幸二 (`11413869`) → `kouji-yamamoto-1984`
- 山本 功児 (`31033842`) → `kouji-yamamoto-1976`
- 山本 浩二 (`71273828`) → `kouji-yamamoto-1969`

### `masahiro-tanaka`

- 現役 田中 将大 (`11215114`) → `masahiro-tanaka`
- historical 田中 昌宏 (`71773865`) → `masahiro-tanaka-1982`

### `seiji-kobayashi`

- 現役 小林 誠司 (`91795139`) → `seiji-kobayashi`
- historical 小林 誠二 (`21323842`) → `seiji-kobayashi-1976`

### `hitomi-honda`

- roster 本田 仁海 (`61665136`) → `hitomi-honda`
- historical 本田 仁海 (`61665136`) → `hitomi-honda-2020`

## Phase 4 へ持ち越す論点

- `npbPlayerId -> finalSlug` と alias 群の固定データ構造
- old `-npbPlayerId` URL をどの形式で受け続けるか
- bare slug の historical alias をどの選手へ向けるか
