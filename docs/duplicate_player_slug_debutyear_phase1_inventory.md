# 重複選手URL変更 `slug-debutyear` Phase 1 棚卸し

実施日: 2026年8月27日

目的: 現在の `-npbPlayerId` 方式で分岐している重複URL対象を棚卸しし、`slug-debutyear` へ移行する対象と論点を確定する。

## 集計結果

- 重複 `bare slug` グループ数: 98
- `current-vs-historical` グループ数: 17
- `historical-vs-historical` グループ数: 81
- 現在 `-npbPlayerId` で分岐している historical URL 件数: 187

補足:

- `current-vs-historical` の 17 グループには、別人衝突だけでなく「同一選手が 2026 名簿と historical の両方にいるだけ」のケースも含まれる
- したがって、`slug-debutyear` 化の主対象は「別人衝突」と「historical 同士の衝突」である

## 分類

### 1. 現役 vs historical だが同一選手の重複

件数: 11 グループ

対象 slug:

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

所見:

- これらは `2026 roster` と `historical` に同一 `npbPlayerId` が共存している
- URL衝突自体は発生しているが、別人区別のための suffix ではない
- `slug-debutyear` を適用する価値が低く、次フェーズで「historical 側の持ち方」を見直す余地がある

### 2. 現役 vs historical の別人衝突

件数: 6 グループ

| bare slug | 現役 | historical | 現在の historical URL |
| --- | --- | --- | --- |
| `hayato-takagi` | 髙木 快大 (`81085152`) | 高木 勇人 (`31035130`) | `/players/hayato-takagi-31035130` |
| `masahiro-tanaka` | 田中 将大 (`11215114`) | 田中 昌宏 (`71773865`) | `/players/masahiro-tanaka-71773865` |
| `naoki-matsumoto` | 松本 直樹 (`51855136`) | 松本 尚樹 (`61063882`) | `/players/naoki-matsumoto-61063882` |
| `naoya-masuda` | 益田 直也 (`71675135`) | 益田 尚哉 (`63263868`) | `/players/naoya-masuda-63263868` |
| `seiji-kobayashi` | 小林 誠司 (`91795139`) | 小林 誠二 (`21323842`) | `/players/seiji-kobayashi-21323842` |
| `yuudai-furukawa` | 古川 雄大 (`51855157`) | 古川 裕大 (`1805153`) | `/players/yuudai-furukawa-1805153` |

所見:

- `slug-debutyear` の必要性が最も高いのはこの 6 グループ
- bare slug は現役側のURLとして維持されており、historical 側だけが suffix 付きになっている
- 将来 `slug-debutyear` にする場合も、bare slug を現役へ残す方針が自然

### 3. historical vs historical の別人衝突

件数: 81 グループ

3件衝突の代表例:

- `akira-takahashi`
  - 高橋 明 (`41943823`)
  - 高橋 明 (`51953841`)
  - 高橋 輝 (`93193801`)
- `akira-tanaka`
  - 田中 彰 (`41543848`)
  - 田中 章 (`51753828`)
  - 田中 彰 (`91995110`)
- `hiroshi-ogawa`
  - 小川 史 (`21123861`)
  - 小川 博 (`41143827`)
  - 小川 博 (`81183860`)
- `hiroshi-satou`
  - 佐藤 洋 (`11513864`)
  - 佐藤 宏志 (`1505111`)
  - 佐藤 博 (`51753849`)
- `kouichi-takahashi`
  - 高橋 幸一 (`1403800`)
  - 高橋 功一 (`51053881`)
  - 高橋 功一 (`51953860`)
- `kouji-yamamoto`
  - 山本 幸二 (`11413869`)
  - 山本 功児 (`31033842`)
  - 山本 浩二 (`71273828`)
- `takashi-yoshida`
  - 吉田 孝 (`11413821`)
  - 吉田 孝司 (`71473820`)
  - 吉田 剛 (`91693860`)
- `tetsuya-yamamoto`
  - 山本 哲哉 (`11615131`)
  - 山本 徹矢 (`31835118`)
  - 山本 哲也 (`81683807`)

2件衝突の代表例:

- `akira-iwamoto`
- `atsushi-kobayashi`
- `brown-m`
- `davis-r`
- `de-kuson-burandon`
- `fumio-yamamoto`
- `gonzaresu-ruisu`

所見:

- `slug-debutyear` の主戦場はこの 81 グループ
- 3件衝突も複数存在するため、`debutYear` が同年だった場合の再フォールバック方針を先に固定する必要がある

## 代表確認ケース

### Case 1: `kouji-yamamoto`

- bare slug: `/players/kouji-yamamoto`
- 現在の分岐先:
  - 山本 幸二 (`11413869`) → `/players/kouji-yamamoto-11413869`
  - 山本 功児 (`31033842`) → `/players/kouji-yamamoto-31033842`
  - 山本 浩二 (`71273828`) → `/players/kouji-yamamoto-71273828`

採用理由:

- historical 同士の3件衝突
- ユーザーから具体例として何度も出ている
- `slug-debutyear` 設計の代表ケースとして使いやすい

### Case 2: `masahiro-tanaka`

- bare slug: `/players/masahiro-tanaka`
- 現役:
  - 田中 将大 (`11215114`) → `/players/masahiro-tanaka`
- historical:
  - 田中 昌宏 (`71773865`) → `/players/masahiro-tanaka-71773865`

採用理由:

- 現役を bare slug に残しつつ、historical だけ新形式へ移す設計検証に向く

### Case 3: `seiji-kobayashi`

- bare slug: `/players/seiji-kobayashi`
- 現役:
  - 小林 誠司 (`91795139`) → `/players/seiji-kobayashi`
- historical:
  - 小林 誠二 (`21323842`) → `/players/seiji-kobayashi-21323842`

採用理由:

- `masahiro-tanaka` と同じく現役/historical 衝突
- 漢字が近く、誤誘導検証の代表例に向く

### Case 4: `hitomi-honda`

- bare slug: `/players/hitomi-honda`
- 2026 roster:
  - 本田 仁海 (`61665136`) → `/players/hitomi-honda`
- historical:
  - 本田 仁海 (`61665136`) → `/players/hitomi-honda-61665136`

採用理由:

- 別人ではなく同一選手重複
- 次フェーズで「`debutYear` を付けるべき対象か」を見極める境界ケース

## 現段階の判断

- `slug-debutyear` 化のコア対象は、少なくとも以下
  - 現役 vs historical の別人衝突 6 グループ
  - historical vs historical の 81 グループ
- `current-vs-historical` の同一選手重複 11 グループは、別人区別の問題ではないため、同じルールで機械適用する前に扱いを分けるべき
- よって Phase 2 では、まず `debutYear` の定義と取得可能性に加え、「同一選手重複を移行対象に含めるか」を確定する必要がある

## Phase 2 へ持ち越す論点

- `debutYear` は「NPB初出場年」か「データ上の初年度」か
- 同一人物が roster と historical の両方にいるケースを `slug-debutyear` 化するか
- `slug-debutyear` が同年で再衝突した場合の再フォールバックをどうするか
- 既存 `-npbPlayerId` URL をどこまで後方互換として残すか
