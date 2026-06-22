# NPB 統合再スクレイピング計画書 — 投手成績・プロフィール・ローマ字

## 1. 目的

NPB 公式（`https://npb.jp/bis/players/{player_id}.html`）への **1 回の訪問**で、次をまとめて取得・更新する。

| 区分 | 内容 | 備考 |
|------|------|------|
| **投手成績（再スクレイプ）** | 1950〜2024 の年度別投手行を正しい列マッピングで再取得 | 現マスタの列ずれ・ERA 異常値を解消 |
| **プロフィール表** | 生年月日・プロ入り・経歴 | **2005〜2025** にマスタ登場の全 `player_id` + 2026 名簿。年齢は保存しない |
| **ローマ字** | フルネーム + イニシャル略式（例 `M.Saitoh`） | 同上。**既にローマ字がある選手はスキップ** |

2026 名簿（`_data/npb_roster_2026.csv`）の選手も、ローマ字・プロフィールのルールは **同一**とする。

**親計画との関係**

| 既存計画 | 本計画での扱い |
|----------|----------------|
| [`plan_pitching_rankings_historical_phases.md`](plan_pitching_rankings_historical_phases.md) | マスタ修正後に Phase 4 で JSON 再ビルド |
| [`plan_player_profile_and_career_stats_phases.md`](plan_player_profile_and_career_stats_phases.md) | 通算成績は **再取得しない**。プロフィール NPB 取得は本計画 Phase 1 に統合 |
| [`H欠損とERA異常値_原因究明レポート.md`](H欠損とERA異常値_原因究明レポート.md) | 再スクレイプの修正要件の根拠 |

---

## 2. 背景と再スクレイプの対象範囲

### 2.1 投手 CSV の既知問題（再取得の理由）

| 問題 | 主な発生範囲 | 原因（要約） |
|------|--------------|--------------|
| ERA 異常値（50〜190 等） | 1950〜2004 中心 | ホールド導入前の行で H/HP 列が無く **2 列シフト** |
| ER=0・ERA=0.00 | 同上 | シフトにより自責点列を誤読 |
| H 欠損 | 1950〜2004 | 極少登板行のテーブル構造差 + 列マップ |
| 打者混入・列ずれ | 2005〜2024 一部 | idp1 / テーブル判定の列ずれ（P1 で必要時のみ） |

**方針**: 選手個人ページの投手表を **行単位でヘッダーとセル数を突合**するパーサに統一する。

### 2.2 再スクレイプの年度・経路

| 年度 | 優先度 |
|------|--------|
| **1950〜2004** | **P0**（列ずれの主因・全件） |
| **2005〜2024** | **P1**（異常検出年度のみ・任意） |
| **2026** | 対象外（既存パイプライン維持） |

### 2.3 プロフィール・ローマ字の対象選手（確定）

**投手 CSV の再スクレイプとは別スコープ。** 2005〜2025 の投手マスタは **触らない**（料金抑制）。

```
U = (2026 名簿の npb_player_id)
  ∪ (master_csv の batting_* / pitching_* に 2005〜2025 で出現する player_id)
```

| 区分 | 範囲 | HTTP |
|------|------|------|
| プロフィール 3 項目 | U の全員（未取得のみ実 GET） | `--skip-pitching` |
| ローマ字 | 同上（§2.3 スキップ条件で既存は取得しない） | 同一 GET |
| 投手成績再取得 | **1950〜2004 のみ**（Phase 3-1） | 投手パースあり |

### 2.4 同時取得するフィールド

| 項目 | フィールド | 保存方針 |
|------|-----------|----------|
| 生年月日 | `birth_date_raw` | 原文。括弧内年齢は除去 |
| プロ入り | `pro_debut_raw` | 原文（ドラフト / 入団） |
| 経歴 | `career_raw` | 原文 |
| ローマ字フル | `name_en_full` | 日本人は **姓 名** |
| ローマ字略式 | `name_en_short` | **名イニシャル.姓**（`formatRomanNameForRanking` と整合） |

**ローマ字スキップ**（いずれか非空なら NPB からローマ字を取らない）: 名簿 `name_en_*`、マスタ `player_name_en`、最終辞書、`npb_player_meta` 既存値。

プロフィールはローマ字をスキップしても、未取得なら **同一 GET** で取得する。

---

## 3. データ正本（SSOT）と成果物

| 層 | パス |
|----|------|
| HTML キャッシュ | `_data/cache/npb_player_page/{player_id}.html` |
| 統合メタ | `_data/derived/npb_player_meta/{player_id}.json` |
| 投手ステージング | `_data/master_csv__rescrape_staging/pitching_{year}_{CL\|PL}_from_master.csv` |
| 投手マスタ | `_data/master_csv/pitching_*` |
| 計算済み / JSON | `master_csv_calculated/`、`public/data/rankings/pitching/` |
| プロフィール | `_data/derived/player_profile/profile_npb/{id}.json` |
| レポート | `_reports/npb_rescrape_phase*.csv` |

---

## 4. Phase 一覧（5 段階）

旧案 10 Phase（設計・実装・パーサ・プロフィール・反映…を分割）を、**テスト以外は統合**した。

| Phase | 名称 | NPB HTTP | 内容 |
|-------|------|----------|------|
| **0** | 要件確定 | 0 | スコープ・サンプル選手リスト |
| **1** | **統合スクレイパ実装** | 0（実装のみ） | 1 GET で投手・プロフィール・ローマ字をパースするスクリプト一式 |
| **2** | **パイロットテスト** | 少数（≤7 GET） | 固定サンプルで合格するまで繰り返し。**本番前の必須ゲート** |
| **3** | **本番スクレイプ** | 大量（初回のみ） | 3-1: 1950〜2004 投手 → ステージング / **3-2: U のプロフィール・ローマ字（2005〜2025 含む）** |
| **4** | **反映・再ビルド・検証** | 0 | マスタ反映、calculated、JSON、プロフィール merged、完了レポート |

```
Phase 0 ──► Phase 1（実装）──► Phase 2（テスト合格）──► Phase 3（本番GET）──► Phase 4（ローカル反映）
                ▲                      │
                └──── 不合格時は修正 ───┘
```

**省いたもの（Phase 番号にしない理由）**

| 旧案 | 統合先 |
|------|--------|
| 設計のみ Phase | Phase 1 の冒頭（スキーマ・HTTP 原則は実装と同時に固定） |
| 投手パーサ / プロフィール / ローマ字の個別 Phase | Phase 1（同一スクレイパのモジュール） |
| マスタ反映 / ビルド / マージの個別 Phase | Phase 4（HTTP 不要の連続作業） |
| 検証のみ Phase | Phase 4 末尾（反映後の自動チェック） |

---

## 5. Phase 0 — 要件確定 ✅

- [x] P0: 1950〜2004 全年度・CL/PL
- [x] プロフィール・ローマ字: **2026 名簿 804 名** + **マスタ 2005〜2025 の全 `player_id`（和集合 U）**
- [x] ローマ字スキップ・生年月日方針
- [x] サンプルリスト

成果物: [`npb_rescrape_phase0_spec.md`](npb_rescrape_phase0_spec.md)、[`npb_rescrape_phase0_samples.md`](npb_rescrape_phase0_samples.md)、[`_data/npb_rescrape/phase0_samples.json`](../_data/npb_rescrape/phase0_samples.json)

---

## 6. Phase 1 — 統合スクレイパ実装

**スクリプト（新規）**

| ファイル | 役割 |
|----------|------|
| `scripts/scrape_npb_player_unified.py` | 1 選手 1 GET、統合パース、メタ JSON・ステージング CSV 出力 |
| `scripts/rescrape_pitching_historical.py` | 1950〜2004 年度ループ（キャッシュ共有・重複 GET なし） |
| `tests/test_npb_pitching_row_parser.py` | 固定 HTML フィクスチャ（オフライン UT） |

**流用する既存コード**

`fetch_npb_player_profile.py`（プロフィール）、`build_player_name_kana_and_official_roman.py`（ローマ字）、`scrape_2004_pitching_via_all_players.py`（投手列オフセット・`TEAM_LEAGUE_MAP`）、`apply_roman_to_master_csvs.py`（略式変換・スキップ）。

### 6.1 統合 JSON スキーマ

```json
{
  "player_id": "71375153",
  "fetched_at": "2026-06-17T12:00:00Z",
  "source_url": "https://npb.jp/bis/players/71375153.html",
  "profile": {
    "birth_date_raw": "1997年5月12日",
    "pro_debut_raw": "2019年ドラフト1位",
    "career_raw": "智辯和歌山高－..."
  },
  "roman": {
    "name_en_full": "Itoh Masashi",
    "name_en_short": "M.Itoh",
    "source": "npb_official",
    "skipped": false
  },
  "pitching_rows_by_year": { "2024": { "ERA": 2.31 } }
}
```

### 6.2 HTTP 原則

- **1 選手 1 GET**（キャッシュ命中時 0）
- `--delay` デフォルト **1.0 秒**
- 投手・プロフィール・ローマ字で **二重 GET しない**

### 6.3 投手パーサ（1950〜2004 形式）

1. ヘッダーから列インデックスを構築
2. データ行のセル数 < ヘッダー数 − 2 → `old_format`（H/HP 欠落）、CG 以降 **−2 オフセット**
3. 極少登板（IP 空）→ H 欠損は警告のみ許容
4. CSV の `player_name_en` は `name_en_short`。**既存非空は上書きしない**

### 6.4 CLI（主要フラグ）

| フラグ | 説明 |
|--------|------|
| `--samples` | Phase 2 用 JSON / md |
| `--years` | 投手対象年度（カンマ区切り） |
| `--staging` | ステージングのみ（マスタ未触） |
| `--skip-roman-if-exists` | デフォルト true |
| `--force` | 開発用・キャッシュ無視 |

### 6.5 完了条件

- [ ] スクリプトと UT が揃っている
- [ ] Phase 2 を **未実装のまま走らせず**、実装直後にパイロット可能

---

## 7. Phase 2 — パイロットテスト（必須ゲート）

**目的**: 本番（Phase 3）の前に、パーサ・スキップ・GET 回数を固定サンプルで検証する。

**入力**: [`npb_rescrape_phase0_samples.md`](npb_rescrape_phase0_samples.md)（ユニーク ID **7**・最大 **7 GET**）

```powershell
cd c:\dev\TopPage
python scripts/scrape_npb_player_unified.py `
  --samples _data/npb_rescrape/phase0_samples.json `
  --years 1950,1984 `
  --staging `
  --delay 1.0 `
  --report _reports/npb_rescrape_phase2_pilot.csv
```

### 合格基準

| 検証 | 基準 |
|------|------|
| ERA | 江川卓・藤本英雄等で公式と ±0.01 |
| プロフィール | 3 項目非空、年齢文字列なし |
| ローマ字スキップ | 岩崎優・伊藤将司で `roman.skipped=true` |
| ローマ字新規 | 江川・藤本で `name_en_full` / `name_en_short` 非空 |
| GET 回数 | ユニーク 7 ID で **最大 7 GET** |

**不合格時**: Phase 3 に進まない。Phase 1 を修正して Phase 2 を再実行。

---

## 8. Phase 3 — 本番スクレイプ

Phase 2 合格後のみ実行。

### 8.1 Phase 3-1 — 投手成績（1950〜2004 のみ）

| 処理 | 想定時間 |
|------|----------|
| 1950〜2004 投手（`--years 1950-2004`・ステージング） | 数時間〜 |

**2005年以降の投手 CSV は実行しない**（料金抑制・P1 任意は見送り）。

### 8.2 Phase 3-2 — プロフィール・ローマ字（2005〜2025 含む）

対象 ID リスト `U` を生成してから **`--skip-pitching`** で実行（投手表はパースしない → 料金は **ユニーク ID 数 × 1 GET**）。

| 順 | 処理 | 備考 |
|----|------|------|
| 1 | `_data/npb_rescrape/targets_profile_roman.json` 生成 | 下記コマンド |
| 2 | `scrape_npb_player_unified.py --targets ... --skip-pitching` | キャッシュ・スキップで再 GET 削減 |
| 3 | （任意）2026 名簿は U に含まれるため **追加実行不要** | |

```powershell
cd c:\dev\TopPage

# Step A: 対象 ID リスト（2026 名簿 ∪ マスタ 2005〜2025）
python -c @"
import csv, json
from pathlib import Path
root = Path('.')
ids = {}
for row in csv.DictReader((root/'_data/npb_roster_2026.csv').open(encoding='utf-8-sig')):
    pid = (row.get('npb_player_id') or '').strip()
    if pid:
        ids[pid] = (row.get('name_ja') or '').strip()
for y in range(2005, 2026):
    for side in ('CL', 'PL'):
        for kind in ('batting', 'pitching'):
            p = root / f'_data/master_csv/{kind}_{y}_{side}_from_master.csv'
            if not p.is_file():
                continue
            with p.open(encoding='utf-8-sig', newline='') as f:
                for row in csv.DictReader(f):
                    pid = (row.get('player_id') or '').strip()
                    name = (row.get('player_name_ja') or '').strip()
                    if pid:
                        ids.setdefault(pid, name)
out = [{'player_id': k, 'name_ja': v} for k, v in sorted(ids.items())]
path = root / '_data/npb_rescrape/targets_profile_roman.json'
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Wrote {len(out)} ids -> {path}')
"@

# Step B: プロフィール・ローマ字のみ（投手 2005+ は触らない）
python scripts/scrape_npb_player_unified.py `
  --targets _data/npb_rescrape/targets_profile_roman.json `
  --skip-pitching `
  --delay 1.0 `
  --report _reports/npb_rescrape_phase3_profile_roman.csv
```

**料金抑制**: `--skip-pitching` 必須。ローマ字はスキップ条件どおり既存値は再取得しない。2 回目以降は HTML キャッシュで GET 0 に近づく。

### 8.3 Phase 3 全体（参考・投手は後日でも可）

```powershell
# 3-1 のみ（投手 1950-2004）— 別途 rescrape_pitching_historical 等が揃ってから
# 3-2 のみ（本項 Step A + B）— プロフィール・ローマ字を先に回せる
```

---

## 9. Phase 4 — 反映・再ビルド・検証

すべて **NPB HTTP 0 回**。

### 9.1 手順

1. **差分確認**: ステージング vs 現行 `master_csv`（ERA 分布・重複）
2. **バックアップ**: `_data/master_csv__backup_{date}/`
3. **マスタ反映**: ステージング → `_data/master_csv/pitching_*`
4. **計算・JSON**:
   ```powershell
   python scripts/compute_metrics_pitching_all_seasons.py --overwrite
   npm run pitching-rankings:build:historical
   npm run rankings:rebuild:historical
   ```
5. **プロフィール・名簿**: `npb_player_meta` → `profile_npb/`、`merge_player_profile.ts`、名簿の `name_en_*`（既存非空はスキップ）
6. **ローマ字をマスタへ**: `apply_roman_to_master_csvs.py`（統合メタ入力）

### 9.2 検証

| スクリプト | 内容 |
|------------|------|
| `investigate_h_era_issues.py` | ERA 異常・H 欠損 |
| `analyze_pitching_csv_issues.py` | 打者混入 |
| `validate_profile_vs_ranking_pitching.ts` | プロフィール整合 |
| `validate_npb_rescrape_report.py`（新規） | GET 数・スキップ率・充足率 |

### 9.3 完了レポート

`_reports/npb_rescrape_phase4_summary.txt` — 処理件数、ローマ字新規/スキップ、プロフィール充足率、ERA 異常残件。

### 9.4 UI（任意・小変更）

`PlayerPageProfileTableBlock`: 生年月日に年齢を付けない（`mergedAge` を渡さない）。

### 9.5 Phase 4-B — 2026名簿外プロフィール表示対応

Phase 3-2 および §9.1 手順 5 で生成したプロフィールデータを、**2026名簿に載っていない過去選手**（U の非名簿部分）でも個人ページに表示できるようにする。対象は §2.3 の和集合 U そのものである。

```
U = (2026 名簿の npb_player_id)
  ∪ (master_csv の batting_* / pitching_* に 2005〜2025 で出現する player_id)
```

**NPB への再 GET は不要。** Phase 4-B はローカル反映・API・UI のみ。

#### 背景

- Phase 3-2 完了後、`profile_npb` / `merged` は U 全員分（目安 **3020 人**）生成可能。
- 2026名簿外選手は `rosterPlayer` が無いため、従来の個人ページ経路ではプロフィール表が表示されない。
- データは `_data/derived/` に存在しても、`profile-merged` API と `/players/{npb_player_id}` が未対応だと UI に届かない。

#### スコープ（やる / やらない）

| やる | やらない |
|------|----------|
| `profile_npb` / `merged` の U 全員カバレッジ確認 | Phase 3 の再実行 |
| `profile-merged` API の NPB ID 直読み | NPB HTTP |
| 個人ページの profile-only fallback | 今季成績・ランキング・球種等の新規取得 |
| `merge_player_profile.ts` の U=3020 対応（再実行しても 804 件に戻らない） | 2026名簿 804 人のリッチ merged の空上書き |

#### 成果物パス（§3 SSOT との整合）

| 成果物 | パス |
|--------|------|
| 対象 ID リスト | `_data/npb_rescrape/targets_profile_roman.json` |
| プロフィール | `_data/derived/player_profile/profile_npb/npb_{id}.json` |
| マージ済み | `_data/derived/player_profile/merged/npb_{id}.json` |
| 検証 | `scripts/validate_profile_coverage_phase4b.ts`（新規） |

#### 実装タスク（参照先ファイル名）

1. **API** — `app/api/players/[playerId]/profile-merged/route.ts`
   - `readMergedByNpbId`: `npb_{id}.json` → `{id}.json` の順
   - 数値 `decoded` は `resolveNpbPlayerIdFromPublicId` → 失敗時は `decoded` を NPB ID として使用
   - データあり → `hasData: true`

2. **個人ページ** — `app/players/[playerId]/PlayerPageClient.tsx`
   - `hasProfileOnly`: 名簿外かつ `profileMerged.profile` あり
   - 表示: 選手名（`profileMerged.name_ja` 優先）+ `PlayerPageProfileTableBlock`
   - 今季タブ・通算・球種・捕手・matchup は非表示
   - 生年月日に年齢を付けない（§9.4 方針維持）

3. **merge** — `scripts/merge_player_profile.ts`
   - 対象: `targets_profile_roman.json`（U 全員）
   - profile 読み: `profile_npb/npb_{id}.json` → `npb_player_meta/{id}.json`
   - 出力: `merged/npb_{id}.json`
   - 既存 merged の career / salary は保持、profile のみ補完

#### 完了条件

- [ ] `targets` = **3020**
- [ ] `profile_npb`（`npb_*.json`）= **3020**、`targets not in profile_npb` = **0**
- [ ] `merged`（`npb_*.json`）= **3020**、`targets not in merged` = **0**
- [ ] `non-roster targets not in profile_npb` = **0**
- [ ] `non-roster targets not in merged` = **0**
- [ ] `/api/players/01005153/profile-merged` が `hasData: true`（`payload.profile` に birth / debut / career）
- [ ] `/players/01005153` でプロフィール表表示（生年月日・プロ入り・経歴、年齢なし）
- [ ] `npm run build` 成功

#### 検証コマンド

API 確認:

```powershell
$url = "http://localhost:3001/api/players/01005153/profile-merged"
$r = Invoke-WebRequest $url -UseBasicParsing
$r.Content
```

件数監査:

```powershell
python -c "
import json; from pathlib import Path
root = Path('.')
targets = {r['player_id'] for r in json.loads((root/'_data/npb_rescrape/targets_profile_roman.json').read_text(encoding='utf-8'))}
roster = {r['npb_player_id'].strip() for r in __import__('csv').DictReader(open(root/'_data/npb_roster_2026.csv', encoding='utf-8-sig')) if r.get('npb_player_id')}
pn = {p.stem.removeprefix('npb_') for p in (root/'_data/derived/player_profile/profile_npb').glob('npb_*.json')}
mg = {p.stem.removeprefix('npb_') for p in (root/'_data/derived/player_profile/merged').glob('npb_*.json')}
non = targets - roster
print('targets', len(targets))
print('profile_npb', len(pn))
print('merged', len(mg))
print('targets not in profile_npb', len(targets - pn))
print('targets not in merged', len(targets - mg))
print('non-roster targets not in profile_npb', len(non - pn))
print('non-roster targets not in merged', len(non - mg))
"
```

ビルド:

```powershell
npm run build
```

---

## 10. リスクと対策

| リスク | 対策 |
|--------|------|
| NPB 制限 | delay 1s、夜間バッチ、失敗 ID リトライキュー |
| ID ゆれ | `npb_id_candidates` + `npb_bis_id_override.csv` |
| ローマ字上書き | スキップデフォルト、`--force-roman` は開発のみ |
| 行数減少 | ステージング diff で消失行をレポート |

---

## 11. npm スクリプト（Phase 4 完了時）

```json
"pitching:rescrape:pilot": "python scripts/scrape_npb_player_unified.py --samples _data/npb_rescrape/phase0_samples.json --staging",
"pitching:rescrape:historical": "python scripts/rescrape_pitching_historical.py --years 1950-2004 --staging",
"pitching:rescrape:apply": "python scripts/apply_pitching_rescrape_staging.py"
```

---

## 12. チェックリスト

- [x] Phase 0 サンプルリスト
- [x] Phase 1 統合スクレイパ + UT
- [x] Phase 2 パイロット合格
- [ ] Phase 3 本番スクレイプ（ステージング）
- [ ] Phase 4 反映・ビルド・検証・サマリー
- [ ] Phase 4-B 2026名簿外プロフィール表示（U=3020・API・個人ページ）

---

**作成日**: 2026-06-17  
**改訂**: 2026-06-17 — Phase を 10 段階から **5 段階（0〜4）** に統合  
**改訂**: 2026-06-18 — §9.5 Phase 4-B（2026名簿外プロフィール表示）を追加  
**ステータス**: Phase 0〜2 完了 → Phase 3（本番スクレイプ）着手可
