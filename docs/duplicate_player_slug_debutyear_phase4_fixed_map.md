# 重複選手URL変更 `slug-debutyear` Phase 4 固定マップ設計

実施日: 2026年8月27日

目的: `slug-debutyear` 方式へ移行するため、実行時の探索をやめて、最終URLと互換 alias を固定データとして管理できる構造を定める。

## 結論

- 固定すべきものは `final slug` だけでは足りない
- 少なくとも次の 3 種類を分けて持つ
  - 正式URL
  - bare slug alias
  - 旧 `-npbPlayerId` alias

推奨方針:

- `npbPlayerId -> finalSlug` を主マップにする
- `incomingSlug -> npbPlayerId` を alias マップとして別管理する
- historical override の `legacySlugs` は「補助 alias 群」として使う

## 現行実装から見える制約

現状:

- `lib/historicalPlayerSlugOverrides.ts` は `HISTORICAL_PLAYER_DISAMBIGUATED_SLUGS[npbPlayerId] ?? override.slug` で historical の `slug` を差し替えている
- 同ファイルで `legacySlugs`、`romanFull` 由来 slug、元の bare slug をすべて `bySlug` index に流し込んでいる
- `lib/playerSlug.server.ts` も `bySlug` と `byNpbId` を使って canonical entry を解決している

含意:

- 「どれが canonical で、どれが後方互換 alias か」の境界がデータ上で曖昧
- `slug-debutyear` へ移行するなら、canonical slug と alias 群を分離したほうが安全

## 固定データで持つべき情報

### 1. canonical slug map

目的:

- サイト内リンク生成の単一真実源にする

形式:

- `Record<npbPlayerId, finalSlug>`

役割:

- `playerPagePathSegmentKnown`
- `historicalSlugOverrideForLink`
- metadata canonical URL

例:

- `11413869 -> kouji-yamamoto-1984`
- `31033842 -> kouji-yamamoto-1976`
- `71273828 -> kouji-yamamoto-1969`
- `71773865 -> masahiro-tanaka-1982`
- `21323842 -> seiji-kobayashi-1976`
- `23125114 -> gonzaresu-ruisu-2005-23125114`

### 2. alias slug map

目的:

- 旧URLや bare slug から正しい `npbPlayerId` へ着地させる

形式:

- `Record<incomingSlug, npbPlayerId>`

役割:

- 直接URLアクセスの解決
- 旧検索インデックスや外部リンクの後方互換
- `permanentRedirect` 先の canonical 化

含める候補:

- bare slug
- 旧 `slug-npbPlayerId`
- 既存 `legacySlugs`
- 必要なら `romanFull` 由来 slug

### 3. optional metadata map

目的:

- 再生成や監査をしやすくする

形式:

- `Record<npbPlayerId, { baseSlug, debutYear, finalSlug, aliasSlugs[] }>`

役割:

- 生成結果レビュー
- 例外2件の説明
- 将来の再生成差分確認

## 推奨データモデル

最小構成:

```ts
export const HISTORICAL_PLAYER_CANONICAL_SLUGS: Record<string, string> = {
  "11413869": "kouji-yamamoto-1984",
}

export const HISTORICAL_PLAYER_SLUG_ALIASES: Record<string, string> = {
  "kouji-yamamoto": "11413869",
  "kouji-yamamoto-11413869": "11413869",
  "kouji-yamamoto-1984": "11413869",
}
```

監査しやすい構成:

```ts
export const HISTORICAL_PLAYER_SLUG_RECORDS: Record<string, {
  baseSlug: string
  debutYear: number
  finalSlug: string
  aliasSlugs: string[]
}> = {
  "11413869": {
    baseSlug: "kouji-yamamoto",
    debutYear: 1984,
    finalSlug: "kouji-yamamoto-1984",
    aliasSlugs: ["kouji-yamamoto", "kouji-yamamoto-11413869"],
  },
}
```
 
判断:

- 実装利用は `canonical slug map` と `alias slug map`
- 人間確認用には `record map` があると安心

## bare slug alias の扱い

### current-vs-historical の別人衝突

方針:

- bare slug は現役側を優先
- historical 側は `slug-debutyear` を canonical にする
- bare slug を historical alias に加えない

例:

- `masahiro-tanaka` → 田中 将大
- `masahiro-tanaka-1982` → 田中 昌宏
- `masahiro-tanaka-71773865` → 田中 昌宏 に redirect

### historical-vs-historical

方針:

- bare slug は既存互換のため 1 人だけに紐づける
- どの 1 人へ向けるかは現行互換をなるべく維持する

推奨:

- 現在 bare slug が解決している historical をそのまま維持

理由:

- 既存リンクや検索結果の変化を最小にできる

### roster / historical same-id

方針:

- bare slug は roster 側 canonical のまま
- historical 側は `slug-debutyear` を canonical として保持
- 旧 `slug-npbPlayerId` も alias として残す

## 旧 `-npbPlayerId` URL の扱い

方針:

- 旧 `slug-npbPlayerId` は削除しない
- すべて alias として残し、canonical `slug-debutyear` へ redirect する

理由:

- すでに本番公開済み
- 検索結果や外部共有URLに残っている可能性が高い
- いきなり切るとユーザー体験が悪い

例:

- `/players/kouji-yamamoto-11413869`
  - 解決先: `11413869`
  - redirect 先: `/players/kouji-yamamoto-1984`

## 例外2件の表現

対象:

- `gonzaresu-ruisu`
- `tetsuya-yamamoto`

方針:

- canonical slug 自体に例外フォールバック結果を入れる

例:

- `23125114 -> gonzaresu-ruisu-2005-23125114`
- `53755133 -> gonzaresu-ruisu-2005-53755133`
- `11615131 -> tetsuya-yamamoto-2011-11615131`
- `31835118 -> tetsuya-yamamoto-2011-31835118`

## 実装反映イメージ

### `historicalPlayerSlugOverrides`

- `slug` は固定 canonical slug を参照
- `legacySlugs` は生成済み alias 群を読む

### `playerPagePathSegmentKnown`

- `npbPlayerId` が分かる場合、固定 canonical slug map を最優先
- これによりサイト内リンクは常に新URLを出す

### `resolvePlayerSlugEntry`

- `incoming slug` を受け取ったら
  - canonical slug
  - old `slug-npbPlayerId`
  - bare slug
  - legacy slug
  の順で alias map / entry map から `npbPlayerId` を引く
- 最後に canonical slug へ redirect する

## 再生成責務

固定マップ生成時に確定させる項目:

- `baseSlug`
- `debutYear`
- `finalSlug`
- `oldIdSlug`
- `aliasSlugs`
- `isSameIdAsRoster`
- `needsFallbackId`

この責務を生成側に寄せる理由:

- 実行時ロジックを薄くできる
- 本番差異の原因切り分けが容易になる
- 例外 2 件をコード上で手打ちしなくて済む

## Phase 5 へ持ち越す論点

- 生成ファイルを 1 つにまとめるか、canonical / alias で分けるか
- current コードへの差し込み位置
- redirect 動作を `permanentRedirect` でどう統一するか
