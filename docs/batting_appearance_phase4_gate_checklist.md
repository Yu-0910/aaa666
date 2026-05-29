# Phase 4 ゲート: 再生成前チェックリスト

親計画: `docs/plan_batting_derived_appearance_stats_primary_phases.md`（Phase 4）

**Phase 6（本番一括再生成）に入る前に、本リストをすべて満たすこと。** 作業は計画書 **Phase 5** の標準順序（`npm run appearance:phase5` で①②＋手順表示、その後③④を手動）で進め、未チェックの項目がある状態で Phase **6** に進まない。

記入例: 日付・実施者・ログの保管先（PR／Issue／コメント）。

---

## A. 前提データ（出場成績スロット）

| # | 項目 | 確認 | 日付・メモ |
|---|------|------|------------|
| A1 | ゴールデン試合（`docs/batting_appearance_phase3_prep.md` §3）の canonical に **`appearancePaSlotsJa` が存在**する（再ビルド済み） | [ ] | |
| A2 | `npm run appearance:phase3` で、ゴールデンに **zip>0 または N=M が期待どおり**（少なくとも「全打者 N=0」でない）と判断できる | [ ] | |
| A3 | `N !== M` の試合を **許容リストまたは修正キュー**に分類した（閾値案: `batting_appearance_phase4_diff_thresholds_proposal.md` **§6**） | [ ] | |

※ A3: スキャンコホートで N≠M が多数でも **§6 の一括 G2 許容**で足りる。**ゴールデン・難例・プロダクト指定**のみ gameId 単位で G3 扱いを追記する。

---

## B. 自動テスト（新方式前提）

| # | コマンド / 内容 | 確認 | 日付・メモ |
|---|-----------------|------|------------|
| B1 | `npm run validate:appearance-phase1` | [ ] | |
| B2 | `npm run validate:appearance-rollback`（ロールバック相当の挙動） | [ ] | |
| B3 | 対象年度の `npm run validate:batting-stats`（既存派生との整合） | [ ] | |
| B4 | **本ゲートで必須とする追加の `validate:*` はない**（B1〜B3 をもって自動検証ゲートとする）。将来ほかを必須化する場合は **本行の下の表に列挙**し、本行の文言を改訂する。 | [ ] | |

**ゲート対象外（チーム方針 C）**

| コマンド | 扱い |
|----------|------|
| `npm run validate:vs-hand` | 出場成績主軸 Phase 4 ゲートの **合否には含めない**。対左右派生の内部整合は **別 Issue／別チェック**で緑化を追う。 |
| `npm run validate:batting-phase11-vs-batting-lines` | **合否に含めない**。Phase11（打席列集計）と出場表行の合算は **別定義**のため不一致は参考。趣旨・理由は `batting_appearance_phase4_diff_thresholds_proposal.md` **§6**。 |

---

## C. 限定再生成（スモーク）

| # | 項目 | 確認 | 日付・メモ |
|---|------|------|------------|
| C1 | **全試合ではない**単位で派生を再生成した（少数試合・少数選手、または `_data/derived` のコピー先への出力） | [ ] | |
| C2 | **zip 有効**（`TOPPAGE_APPEARANCE_PRIMARY` 未設定または有効値）でスモーク生成した | [ ] | |
| C3 | 個人ページ・API・ランキング相当 JSON の **目視または自動スモーク**を実施した | [ ] | |
| C4 | 重大な破綻（ゼロ除算、明らかな数値崩壊、想定外のキー欠落）がないことを確認した | [ ] | |

---

## D. 旧 vs 新・差分・Go/No-Go

| # | 項目 | 確認 | 日付・メモ |
|---|------|------|------------|
| D1 | **旧**: `TOPPAGE_APPEARANCE_PRIMARY=0` で同一スモークを再生成し、成果物を退避した | [ ] | |
| D2 | **新**: フラグを外し（zip 有効）、同一条件で再生成した | [ ] | |
| D3 | 差分を `batting_appearance_phase4_diff_thresholds_proposal.md` の案に照らし **許容内か**判定した | [ ] | |
| D4 | **プロダクトオーナーまたは運用責任者の承認**（書面・Issue 承認・会議メモ等）を得た | [ ] | |

---

## E. ロールバック再現

| # | 項目 | 確認 | 日付・メモ |
|---|------|------|------------|
| E1 | `npm run validate:appearance-rollback` が **ローカル／CI で成功**した | [ ] | |
| E2 | **少なくとも 1 試合分**（またはスモーク単位）で、`TOPPAGE_APPEARANCE_PRIMARY=0` にした派生が **意図どおり旧挙動側に寄る**ことを目視または diff で確認した | [ ] | |
| E3 | 運用手順として `docs/batting_appearance_phase3_prep.md` §1（フラグ表）に従えることを確認した | [ ] | |

---

## F. 記録

| # | 項目 | 確認 | 日付・メモ |
|---|------|------|------------|
| F1 | 本チェックリストの **完了版**（チェック済み）をリポジトリまたは社内 Wiki に保管した | [ ] | |
| F2 | `npm run appearance:phase3` の直近レポート（`docs/batting_appearance_phase3_last_run.md`）を **Phase 5 完了時点**で保存した | [ ] | |

---

## 関連

- 親計画（Phase 4 要件・**Phase 5 標準順序**）: `docs/plan_batting_derived_appearance_stats_primary_phases.md` §4  
- 閾値・Go/No-Go のたたき台: `docs/batting_appearance_phase4_diff_thresholds_proposal.md`
- Phase 3 準備（診断・フラグ）: `docs/batting_appearance_phase3_prep.md`
