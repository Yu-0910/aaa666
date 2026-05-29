# Phase 3 準備メモ: 検証・ロールバック・ゴールデン試合

親計画: `docs/plan_batting_derived_appearance_stats_primary_phases.md`（Phase 3）

Phase 3 の本実行（旧 vs 新レポートの本番比較・承認）はこのドキュメントとフラグ・診断が揃ったうえで行う。

---

## 1. ロールバック（出場成績 zip を切る）

**環境変数** `TOPPAGE_APPEARANCE_PRIMARY` を無効値にする。

| 値 | 挙動 |
|----|------|
| （未設定） | zip **有効**（既定） |
| `1` / `true` / `on` / `yes` | zip **有効** |
| `0` / `false` / `off` / `no` | zip **無効**（`plateAppearanceResolvedResultText` ≒ `plateAppearanceLastResultText`） |

**例（PowerShell）**

```powershell
$env:TOPPAGE_APPEARANCE_PRIMARY = "0"
npm run dev
```

```powershell
$env:TOPPAGE_APPEARANCE_PRIMARY = "0"
npm run phase11:build:batting
```

本番で戻すときは変数を外すか `1` にする。

**Phase 4 ゲート**（要件は Phase 4 文書、実施順は計画 **Phase 5**）: ロールバック挙動の自動検証は `npm run validate:appearance-rollback`。運用手順のチェックは `docs/batting_appearance_phase4_gate_checklist.md` §E。

実装: `lib/yahooGame/appearancePrimaryFeatureFlag.ts` の `isAppearancePrimaryZipEnabled()`。

---

## 2. 診断スナップショット（zip 適用状況）

```bash
npm run diag:appearance-primary-zip -- --game-ids 2021038624,2021038735
```

- 各試合について: `appearancePaSlotsJa` を持つ打者数、zip 上書き件数（`buildAppearanceZipResultOverrides` のサイズ）、`diagnoseBattingAppearanceSlotsVsPlateAppearances` の `ok: false` 件数を標準出力に出す。
- `--game-ids` 省略時は canonical 先頭から最大 20 試合（負荷防止）。

**一括レポート（Phase 3 自動検証）**

```bash
npm run appearance:phase3
```

- ゴールデン 2 試合の N/M 詳細と、canonical 先頭 120 試合の N≠M 傾向を `docs/batting_appearance_phase3_last_run.md` に書き出す。
- 調整: `npm run appearance:phase3 -- --game-ids 2021038624 --scan-first 200`

Phase 4 のゲート（および計画 **Phase 5** の手順③④）に回す「許容差分」の材料として使う。

---

## 3. ゴールデン／難例試合（候補リスト・追記用）

| gameId | メモ |
|--------|------|
| `2021038624` | Yahoo 連携 PoC で使った例（計画書 Phase 0） |
| `2021038735` | `yahoo_plate_appearance_batting_rules.md` §6c で言及（桑原打席・一ゴロ欠落検証） |

代打連打・表欠損・投手交替直後など、**実データで難例が判明したらこの表に追記**する。Phase 3 の「旧 vs 新」は原則として **この表の試合＋ランダム N 試合**で実施する。

---

## 4. 旧 vs 新レポート（手順の型）

1. **ベースライン JSON**（zip 無効）  
   `TOPPAGE_APPEARANCE_PRIMARY=0` で対象バッチ（例 Phase 11）を出力し、成果物を別ディレクトリにコピーする。
2. **新方式 JSON**（zip 有効）  
   変数を外して同じバッチを再実行する。
3. **差分**  
   同一選手・同一指標で `diff` または小さな比較スクリプト。差分が大きい gameId / yahooId をリスト化する。
4. **判断**  
   計画 Phase 4（閾値案）・Phase 5（ゲート完了）の Go/No-Go に回す。

（自動 diff スクリプトは Phase 3 本番タスクで追加してよい。）

---

## 5. Phase 3 完了の定義（チェックリスト）

- [ ] 上記ゴールデン表に、運用で合意した試合 ID が載っている  
- [ ] `TOPPAGE_APPEARANCE_PRIMARY=0` で **少なくとも 1 試合分**派生を再生成し、有効時と数値が意図どおり変わることを確認した  
- [ ] `diag:appearance-primary-zip` を難例試合で実行し、出力を保管した  
- [ ] Phase 4／Phase 5 に渡す「差分の見方」をチームで共有した（計画書 **Phase 5** の旧新スモークに接続）

---

## 関連

- `docs/batting_appearance_primary_phase1_implementation.md` … Phase 1/2 実装の正  
- `docs/data_operation_rules.md` … 運用ルールへのリンク追加予定  
- `npm run validate:appearance-phase1` … 合成データの回帰（zip 有効時のユニット）
