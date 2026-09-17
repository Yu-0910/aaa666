# 2026ドラフト候補ソート 候補者データ投入

## 実行内容

候補者データの取得、整形、アプリへの接続を実施した。

## 追加ファイル

- `scripts/build_draft_candidate_sort_data_2026.mjs`
- `app/draft-candidate-sort/_data/candidates2026.ts`

## 更新ファイル

- `app/draft-candidate-sort/_lib/candidateData.ts`
- `app/draft-candidate-sort/DraftCandidateSortStart.tsx`
- `scripts/validate_draft_candidate_sort_phase13.mjs`

## データ件数

2026-09-17 に生成したデータ件数は以下。

- 全候補: 238人
- 高校生のみ: 78人
- 大学生のみ: 77人
- 大学、社会人のみ: 160人
- 中位以上候補: 94人

## 表示用データ

画面に表示するデータは以下に限定する。

- 氏名
- 所属
- 区分
- ポジション
- 投打
- 身長体重

## 内部判定用データ

中位以上候補の絞り込みには `priorityGroup` のみを使う。

画面には判定根拠を表示しない。

## 表示しない情報

以下は表示用データに含めない。

- 評価
- 各紙情報
- 判定根拠
- 参照元URL
- 候補者詳細URL

## 検証結果

2026-09-17 に以下を確認した。

- `node scripts/build_draft_candidate_sort_data_2026.mjs`: 成功
- `node --import tsx scripts/validate_draft_candidate_sort_phase13.mjs`: 成功
- `/draft-candidate-sort`: 200
- 候補者データ: 238人
- 中位以上候補: 94人
