# 2026ドラフト候補ソート page phase 13 テスト

## 実行内容

phase 13 として、ドラフト候補ソート機能に絞った検証スクリプトとページ応答確認を実行した。

## 追加ファイル

- `scripts/validate_draft_candidate_sort_phase13.mjs`

## 検証内容

検証スクリプトでは以下を確認する。

- セッション作成
- 候補者データ検証
- ソート対象絞り込み
- `unknown` 回答の記録
- 引き分け20%ルール
- 戻る操作による引き分けボタン再表示
- 番付ラベル生成
- ドラフト順位予想表の1位から3位分割
- 未評価が多い候補の並び順

## 実行コマンド

```text
node --import tsx scripts/validate_draft_candidate_sort_phase13.mjs
```

## 検証結果

2026-09-17 に以下を確認した。

- `draft candidate sort phase13 validation passed`
- `/draft-candidate-sort`: 200
- `/draft-candidate-sort/sort`: 200
- `/draft-candidate-sort/complete`: 200
- `/draft-candidate-sort/processing`: 200
- `/draft-candidate-sort/result`: 200

## 補足

全体 `tsc` は既存の別領域エラーで失敗するため、phase 13 の完了判定からは切り分ける。

phase 13 は完了とする。
