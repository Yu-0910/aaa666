# 2026ドラフト候補ソート page phase 3 候補者データ設計

## 実行内容

phase 3 として、候補者データの型、読み込み口、絞り込み用の内部判定データを実装した。

表示用データと内部判定用データは分離する。

## 追加ファイル

- `app/draft-candidate-sort/_lib/candidateData.ts`

## 接続した画面

- `app/draft-candidate-sort/page.tsx`

トップページのソート対象ラベルは、固定文字列ではなく `getCandidateFilterLabel` から取得する。

## 表示用データ

ページ上に表示してよい候補者情報は `CandidateDisplayData` に限定する。

```ts
type CandidateDisplayData = {
  id: string
  name: string
  category: CandidateCategory
  positionGroup: CandidatePositionGroup
  schoolOrTeam: string
  throwBat: string
  heightWeight: string
}
```

表示用データには、外部リンク、参照元、評価、判定根拠、各紙情報を持たせない。

## 内部判定用データ

中位以上候補の絞り込みには `CandidateInternalData` を使う。

```ts
type CandidateInternalData = {
  id: string
  priorityGroup: "recommended" | "normal"
}
```

`priorityGroup` は画面に直接表示しない。

## 絞り込み

実装済みの絞り込みは以下。

- `all`: 全候補
- `highSchool`: 高校生のみ
- `university`: 大学生のみ
- `universityCorporate`: 大学、社会人のみ
- `recommended`: 中位以上候補

## 検証

`validateCandidateDataSet` で以下を確認できる。

- 表示用候補者IDが重複していない
- 内部判定用データのIDが表示用候補者データに存在する

2026-09-17 に以下を確認した。

- `/draft-candidate-sort`: 200
- `validateCandidateDataSet(getCandidateDataSet())`: エラーなし
- `getCandidateFilterLabel("recommended")`: `中位以上候補`

## 現時点の範囲

phase 3 ではデータ構造と読み込み口のみを作成した。

実候補者データの投入、ソート対象選択画面との接続、localStorage保存は phase 4 以降で行う。

## phase 3 完了条件

- 表示用データ型がある
- 内部判定用データ型がある
- 表示用データに評価や取得元が含まれていない
- 内部判定用データを使って中位以上候補を絞り込める
- データセットの基本検証関数がある

phase 3 は完了とする。
