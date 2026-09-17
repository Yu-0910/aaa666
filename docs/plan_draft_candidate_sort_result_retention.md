# 2026ドラフト候補ソート 結果保存期限

## 方針

途中保存は再開のために残す。

結果作成後は24時間だけ保存する。

24時間を過ぎた結果データは、次回アクセス時に自動削除する。

## 実装

- `resultRetentionMs`: 24時間
- `/processing` で結果作成時に `resultExpiresAt` を保存する
- `loadDraftSortSession` で期限切れを検出した場合、保存データを削除して `null` を返す
- トップページの再開表示に、結果保存期限を表示する

## 検証

2026-09-17 に以下を確認した。

- `node --import tsx scripts/validate_draft_candidate_sort_phase13.mjs`: 成功
- `/draft-candidate-sort`: 200
- `/draft-candidate-sort/processing`: 200
