# 重複選手URL Phase 4 固定データ化

対象日: 2026-08-25

目的: 重複選手URLの分岐結果を実行時計算ではなく固定データとして管理する状態を確定する。

## 実施内容

- 重複対象の `npbPlayerId -> disambiguated slug` 対応表を生成済みファイルへ切り出した
- 生成済みファイルは [lib/historicalPlayerSlugDisambiguation.generated.ts](/abs/path/C:/dev/TopPage/lib/historicalPlayerSlugDisambiguation.generated.ts:1)
- 参照側は [lib/historicalPlayerSlugOverrides.ts](/abs/path/C:/dev/TopPage/lib/historicalPlayerSlugOverrides.ts:1)

## 現在の実装

### 1. 固定マップ

- エクスポート名: `HISTORICAL_PLAYER_DISAMBIGUATED_SLUGS`
- キー: `npbPlayerId`
- 値: `baseSlug-npbPlayerId`

確認結果:

- 固定マップ登録件数: 187

代表値:

- `11413869` -> `kouji-yamamoto-11413869`
- `31033842` -> `kouji-yamamoto-31033842`
- `71273828` -> `kouji-yamamoto-71273828`
- `71773865` -> `masahiro-tanaka-71773865`
- `21323842` -> `seiji-kobayashi-21323842`

### 2. override 適用

- `historicalPlayerSlugOverrides.generated.json` の base slug を読み込む
- `HISTORICAL_PLAYER_DISAMBIGUATED_SLUGS[npbPlayerId]` がある場合だけ上書きする
- 存在しない historical 選手は元 slug を維持する

## 実行時負荷

- アクセス時に roster / historical 全件を比較していない
- 実行時に重複件数を再集計していない
- 実行時は生成済みマップ参照のみ

## Phase 4 結論

- 重複選手URLの分岐結果は固定データ化済み
- 実行時の全件比較は解消済み
- 今後の論点は、再生成手順の整備と本番反映経路の確認
