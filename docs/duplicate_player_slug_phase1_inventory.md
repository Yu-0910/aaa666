# 重複選手URL Phase 1 棚卸し

対象日: 2026-08-25

目的: 選手個人ページの slug 衝突対象を抽出し、Phase 2 以降のURL分岐対象を確定する。

## 集計結果

- 衝突している base slug 総数: 87
- `roster vs historical` 衝突: 6
- `historical vs historical` 衝突: 81
- `roster vs roster` 衝突: 0

## 判定ルール

- `roster` の `entry.slug` と `historical` の base slug を同一キーで比較
- `historical` 側は一意化後 slug ではなく、元の base slug で集計
- 同一 slug に複数の `npbPlayerId` がぶら下がる場合を衝突とみなす

## 代表確認ケース

### 1. historical 3件衝突

slug: `kouji-yamamoto`

- `11413869` 山本 幸二
- `31033842` 山本 功児
- `71273828` 山本 浩二

### 2. roster と historical の衝突

slug: `masahiro-tanaka`

- `11215114` 田中 将大 `roster`
- `71773865` 田中 昌宏 `historical`

slug: `hayato-takagi`

- `81085152` 髙木 快大 `roster`
- `31035130` 高木 勇人 `historical`

slug: `naoki-matsumoto`

- `51855136` 松本 直樹 `roster`
- `61063882` 松本 尚樹 `historical`

slug: `seiji-kobayashi`

- `91795139` 小林 誠司 `roster`
- `21323842` 小林 誠二 `historical`

## 先頭20件の衝突 slug

- `akira-iwamoto`
- `akira-takahashi`
- `akira-tanaka`
- `atsushi-kobayashi`
- `brown-m`
- `davis-r`
- `de-kuson-burandon`
- `fumio-yamamoto`
- `gonzaresu-ruisu`
- `hayato-takagi`
- `hicks-j`
- `hirofumi-ogawa`
- `hiroki-kondou`
- `hiroshi-katayama`
- `hiroshi-kimura`
- `hiroshi-kobayashi`
- `hiroshi-ogawa`
- `hiroshi-satou`
- `hiroshi-shibahara`
- `hiroshi-takahashi`

## Phase 1 結論

- URL分岐対象は 87 slug に紐づく重複選手群
- 本件の代表ケースは `kouji-yamamoto`
- 実装優先度が高いのは `roster vs historical` の 6 件
- `historical vs historical` も同時に分岐対象へ含める必要がある

## Phase 2 への入力

- 非重複選手は既存 slug 維持
- 重複選手は `baseSlug-npbPlayerId` 形式で一意化する
- bare slug の後方互換方針を別途定義する
