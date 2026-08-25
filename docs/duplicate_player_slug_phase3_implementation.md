# 重複選手URL Phase 3 実装結果

対象日: 2026-08-25

目的: Phase 2 で固定したURL分岐仕様が、コード上でどう実装されているかを記録する。

## 実装対象

- [lib/historicalPlayerSlugOverrides.ts](/abs/path/C:/dev/TopPage/lib/historicalPlayerSlugOverrides.ts:1)
- [lib/historicalPlayerSlugDisambiguation.generated.ts](/abs/path/C:/dev/TopPage/lib/historicalPlayerSlugDisambiguation.generated.ts:1)
- [lib/playerSlug.ts](/abs/path/C:/dev/TopPage/lib/playerSlug.ts:1)
- [lib/playerSlug.server.ts](/abs/path/C:/dev/TopPage/lib/playerSlug.server.ts:1)

## 実装内容

### 1. historical slug の一意化

- `historicalPlayerSlugOverrides.generated.json` の base slug を元にしつつ、
- 重複対象だけ `HISTORICAL_PLAYER_DISAMBIGUATED_SLUGS` で上書きする

結果:

- historical 選手は必要なものだけ `baseSlug-npbPlayerId` になる
- 非重複 historical は元 slug のまま維持される

### 2. サイト内リンク生成

- `playerPagePathSegmentKnown()` は historical ID を先に見る
- `historicalSlugOverrideById(npbId)?.slug` があれば、それをそのまま返す
- その後に roster slug fallback を見る

結果:

- historical の重複選手リンクは、ローマ字一致ではなく ID ベースで正しいURLに分岐する
- roster は既存 slug を維持する

### 3. URL解決

- `resolvePlayerSlugEntry()` は新しい disambiguated slug を解決できる
- `historicalSlugOverrideBySlug()` は `-npbPlayerId` 付き slug を受けられる
- bare slug も、後方互換として `bySlug` に残している

結果:

- 新URL直打ちで正しい選手に到達する
- 旧 bare slug も最低限は生きる

## 代表ケース確認

### リンク生成

- `11413869` 山本 幸二 -> `kouji-yamamoto-11413869`
- `31033842` 山本 功児 -> `kouji-yamamoto-31033842`
- `71273828` 山本 浩二 -> `kouji-yamamoto-71273828`
- `11215114` 田中 将大 -> `masahiro-tanaka`
- `71773865` 田中 昌宏 -> `masahiro-tanaka-71773865`
- `91795139` 小林 誠司 -> `seiji-kobayashi`
- `21323842` 小林 誠二 -> `seiji-kobayashi-21323842`

### URL解決

- `kouji-yamamoto-11413869` -> 山本 幸二
- `kouji-yamamoto-31033842` -> 山本 功児
- `kouji-yamamoto-71273828` -> 山本 浩二
- `masahiro-tanaka` -> 田中 将大
- `masahiro-tanaka-71773865` -> 田中 昌宏
- `seiji-kobayashi` -> 小林 誠司
- `seiji-kobayashi-21323842` -> 小林 誠二

## Phase 3 結論

- Phase 2 の分岐仕様はコードへ反映済み
- 重複選手は ID ベースで別URLへ分岐する
- roster URL は維持される
- bare slug の最低限の後方互換も残っている
