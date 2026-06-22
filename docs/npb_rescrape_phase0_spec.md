# NPB 統合再スクレイピング — Phase 0 要件確定書

**状態**: 確定（2026-06-17）  
**親計画**: [`plan_npb_rescrape_pitching_profile_roman_phases.md`](plan_npb_rescrape_pitching_profile_roman_phases.md)

本書は Phase 1 以降の実装・テストがブレないよう固定した決定事項である。Phase 構成は親計画の **5 段階（0〜4）** に従う。

---

## 1. スコープ（やる／やらない）

| やる | やらない |
|------|----------|
| 選手個人ページ **1 GET** で投手成績・プロフィール・ローマ字を同時パース | 同一選手への目的別の二重 GET |
| **1950〜2004** 投手 CSV の再取得（列ずれ・ERA 異常の修正） | **2026** 投手 canonical の上書き |
| **2026 名簿全員**（804 名）のプロフィール 3 項目 | 通算成績の NPB 再取得 |
| ローマ字（フル + 略式）。**既存値はスキップ** | ローマ字の無条件上書き（`--force-roman` は開発のみ） |
| 生年月日は原文保存（**年齢文字列は除去**） | 年俸・FA・出身地 |
| Phase 2 用サンプル 10 名の固定リスト | 2005〜2024 の全年度一括再スクレイプ（P1・任意） |

---

## 2. 再スクレイプ対象年度

| 優先度 | 範囲 | 方針 |
|--------|------|------|
| **P0（必須）** | 1950〜2004 × CL/PL（**55 年度 × 2 = 110 ファイル**） | 全件ステージング → 検証後マスタ反映 |
| **P1（任意）** | 2005〜2024 のうち異常検出年度のみ | `master_csv` で ERA>20 等の行がある年度（2026-06-17 時点で **32 年度×リーグ組**・計 94 行）。本番前に `analyze_pitching_csv_issues.py` で再確認 |
| **対象外** | 2026 | 既存パイプライン維持 |

---

## 3. プロフィール・ローマ字対象（確定）

**投手 CSV 再スクレイプ（2005〜2025）は行わない。** 以下の **選手 ID 和集合 U** に対し、プロフィール 3 項目とローマ字（未取得のみ）を取得する。

```
U = (2026 名簿 npb_player_id)
  ∪ (master_csv batting_* / pitching_* の 2005〜2025 行の player_id)
```

| 集合 | 件数（目安） | 備考 |
|------|--------------|------|
| 2026 名簿 | 804 | `_data/npb_roster_2026.csv` |
| マスタ 2005〜2025 | U の大半 | 投手・打撃 CSV から `player_id` をユニーク抽出 |
| 重複 | 和集合で 1 回のみ | 同一 ID へ二重 GET しない |

成果物: `_data/npb_rescrape/targets_profile_roman.json`（Phase 3-2 で生成）

実行: `scrape_npb_player_unified.py --targets ... --skip-pitching`（計画書 Phase 3-2 参照）

---

## 4. ローマ字スキップ条件（確定）

次のいずれかで非空なら、NPB からローマ字フィールドを **取得しない**（プロフィールは別途未取得なら取得）。

1. `_data/npb_roster_2026.csv` の `name_en_full` または `name_en_short`
2. `_data/master_csv*/` の打撃・投手 CSV で当該 `player_id` の `player_name_en`
3. `output/master/player_id_to_roman_full.csv`（存在する場合）
4. `_data/derived/npb_player_meta/{player_id}.json` の `roman.name_en_full`

**略式の正規形**: `lib/ranking/formatRomanNameForRanking.ts` と同一（日本人: 名イニシャル.姓、例 `M.Itoh`）。

---

## 5. 生年月日の保存規則

- NPB の「生年月日」行の文言をベースに保存
- 保存前に除去: `（\d+歳）`、半角 `(\\d+)` 年齢表記、末尾の age 相当
- JSON フィールド: `birth_date_raw`（`profile.birth_date_raw`）
- UI では年齢を表示しない方針（Phase 8 で `mergedAge` を渡さない）

---

## 6. HTTP 原則（Phase 1 実装に含める）

| 項目 | 値 |
|------|-----|
| 1 選手あたりネットワーク GET | **最大 1**（キャッシュ命中時 0） |
| デフォルト delay | **1.0 秒** |
| キャッシュ | `_data/cache/npb_player_page/{player_id}.html` |
| ID ゆれ | `npb_id_candidates` + `_data/player_profile/npb_bis_id_override.csv` |

---

## 7. Phase 0 成果物

| ファイル | 内容 |
|----------|------|
| 本書 | 要件確定 |
| [`npb_rescrape_phase0_samples.md`](npb_rescrape_phase0_samples.md) | Phase 2 パイロット用 10 名 |
| [`_data/npb_rescrape/phase0_samples.json`](../_data/npb_rescrape/phase0_samples.json) | 上記の機械可読版 |

---

## 8. 次 Phase への引き継ぎ

| Phase | 状態 |
|-------|------|
| **0** 要件確定 | ✅ 完了（本書） |
| **1** 統合スクレイパ実装 | ✅ 完了 |
| **2** パイロットテスト | ✅ 合格（2026-06-17） |
| **3** 本番スクレイプ | Phase 2 合格後 |
| **4** 反映・再ビルド・検証 | Phase 3 完了後 |
