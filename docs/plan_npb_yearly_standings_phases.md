# NPB 公式 歴代順位表取得・表示 計画書（Phase 別）

**状態**: Phase 0 ✅ / Phase 1 ✅ / Phase 2 ✅ 完了  
**親 UI**: [`TopPageStandingsTab`](../app/components/top/TopPageStandingsTab.tsx)（2026 順位表を見た目の参照）  
**既存パイプライン**: Phase 29（canonical 由来・直近年）— 本計画とはデータソースが異なる

---

## 1. 目的

[NPB 年度別成績](https://npb.jp/bis/yearly/centralleague_1990.html) から **1950–2025** のセ・パ各年度について、チーム勝敗・打撃・投手成績を取得し、計算指標を加えて順位表 JSON を生成する。トップページ各年度の **「順位表」タブ**に、提示指標のみを表示する（2026 UI のレイアウトを踏襲）。

| データソース | `source` 値 | 列セット |
|-------------|-------------|----------|
| canonical（Phase 29） | `canonical` | `STANDINGS_METRIC_COLUMNS`（フル 32 列） |
| NPB 公式年度別 | `npb_official_yearly` | `NPB_YEARLY_STANDINGS_METRIC_COLUMNS`（24 列） |

---

## 2. 対象 URL（152 件）

```
CL: https://npb.jp/bis/yearly/centralleague_{year}.html
PL: https://npb.jp/bis/yearly/pacificleague_{year}.html
year = 1950 .. 2025
```

既存参照: [`scripts/patch_sb_from_npb.py`](../scripts/patch_sb_from_npb.py) の `npb_yearly_url()`

各ページのアンカー:

| セクション | アンカー | 内容 |
|-----------|---------|------|
| チーム勝敗表 | `#standings` | 試合・勝敗・引分・勝率・ゲーム差 |
| チーム打撃成績 | `#teamBatting` | 打率・打数・得点・安打・二塁打・三塁打・本塁打・打点・盗塁 |
| チーム投手成績 | `#teamPitching` | 防御率・完投・完封勝・投球回・奪三振・失点 |

---

## 3. Phase 0 — 仕様・スキーマ固定 ✅

### 3.1 型・列定義（実装済み）

| ファイル | 内容 |
|----------|------|
| [`lib/standings/types.ts`](../lib/standings/types.ts) | `StandingsSource` に `npb_official_yearly` 追加。`TeamStandingRow` に `ab,rbi,sb,sho,ip,so,k9` |
| [`lib/standings/metricColumns.ts`](../lib/standings/metricColumns.ts) | `NPB_YEARLY_STANDINGS_METRIC_COLUMNS`、`standingsMetricColumnsForSource()` |
| [`lib/standings/computeNpbYearlyStandingsMetrics.ts`](../lib/standings/computeNpbYearlyStandingsMetrics.ts) | SLG / IsoP / K/9 計算式 |

### 3.2 表示指標（NPB 歴代・固定順）

コード上の正: `NPB_YEARLY_STANDINGS_METRIC_COLUMNS`

| 順 | ラベル | JSON キー | 取得元 |
|---:|---|---|---|
| 1 | 球団 | `team` / `teamName` | — |
| 2 | 試 | `g` | 勝敗表 |
| 3 | 勝 | `w` | 勝敗表 |
| 4 | 敗 | `l` | 勝敗表 |
| 5 | 分 | `t` | 勝敗表 |
| 6 | 勝率 | `pct` | 勝敗表 |
| 7 | 差 | `gb` | 勝敗表 |
| 8 | 得点 | `runs` | 打撃表 |
| 9 | 打率 | `avg` | 打撃表 |
| 10 | 打数 | `ab` | 打撃表 |
| 11 | 安打 | `h` | 打撃表 |
| 12 | 二塁打 | `doubles` | 打撃表 |
| 13 | 三塁打 | `triples` | 打撃表 |
| 14 | 本塁打 | `hr` | 打撃表 |
| 15 | 打点 | `rbi` | 打撃表 |
| 16 | 盗塁 | `sb` | 打撃表 |
| 17 | 長打率 | `slg` | 計算 |
| 18 | IsoP | `isop` | 計算 |
| 19 | 失点 | `runs_allowed` | 投手表 |
| 20 | 防御率 | `era` | 投手表 |
| 21 | 完投 | `cg` | 投手表 |
| 22 | 完封勝 | `sho` | 投手表 |
| 23 | 投球回 | `ip` | 投手表（文字列） |
| 24 | K/9 | `k9` | 計算 |
| 25 | 奪三振 | `so` | 投手表 |

### 3.3 計算式（固定）

| 指標 | 式 |
|------|-----|
| `slg` | `(1B + 2×2B + 3×3B + 4×HR) / AB`（`1B = H - 2B - 3B - HR`） |
| `isop` | `SLG - AVG` |
| `k9` | `SO × 9 / IP`（投球回はアウト数に正規化。`1182.2` → 1182⅔ 回） |

### 3.4 検証サンプル（1990 年 CL 巨人）

[公式ページ](https://npb.jp/bis/yearly/centralleague_1990.html) より:

| 項目 | 公式値 | 計算 |
|------|--------|------|
| 打率 | .2666 | — |
| 安打 / 二塁 / 三塁 / 本塁 / 打数 | 1158 / 217 / 27 / 134 / 6130 | — |
| 長打率 | — | **.299**（1831÷6130） |
| IsoP | — | **.032** |
| 奪三振 / 投球回 | 1311 / 1317.0 | — |
| K/9 | — | **8.96**（1311×9÷1317.0） |

### 3.5 Phase 0 完了条件

- [x] 型・列定義・計算ユーティリティ実装
- [x] `npm run validate:npb-yearly-standings:phase0` が成功

---

## 4. Phase 1 — NPB 年度別ページ取得・パース ✅

**スクリプト:** [`scripts/scrape_npb_yearly_standings.py`](../scripts/scrape_npb_yearly_standings.py)  
**出力:** `_data/raw/npb_yearly/{year}/{CL|PL}.json`

```bash
# 依存（初回のみ）
pip install requests beautifulsoup4 lxml

# 1年度試行
python scripts/scrape_npb_yearly_standings.py --year 1990
npm run scrape:npb-yearly-standings -- --year 1990

# 全年度（1950–2025 × CL/PL）
python scripts/scrape_npb_yearly_standings.py --from 1950 --to 2025 --sleep 1.0

# パースのみ（保存しない）
python scripts/scrape_npb_yearly_standings.py --year 1990 --dry-run
```

---

## 5. Phase 2 — 歴代球団名正規化 ✅

**実装:** [`lib/standings/teamCodes.ts`](../lib/standings/teamCodes.ts)

| 関数 / 定数 | 用途 |
|-------------|------|
| `NPB_YEARLY_LABEL_TO_CODE` | NPB 公式 team 原文 → 球団コード |
| `isNpbYearlyTeamLabel()` | リーダーズ・個人成績行の除外 |
| `resolveNpbYearlyTeamCode()` | 原文 → コード（未マップは null） |
| `normalizeNpbYearlyTeam()` | 原文 → `{ team, teamName, npbLabel }` |
| `auditNpbYearlyTeamLabels()` | raw 走査用・未マップ一覧 |

**1990年 CL サンプル（raw の team 原文）:**

| npbLabel | team | teamName |
|----------|------|----------|
| 読売ジャイアンツ | G | 巨人 |
| 横浜大洋ホエールズ | DB | 大洋 |
| 阪神タイガース | H | 阪神 |

### 検証（ターミナル）

全 raw JSON の team 原文を走査し、未マップを列挙する:

```bash
npx tsx -e "import{readFileSync,readdirSync}from'fs';import{join}from'path';import{auditNpbYearlyTeamLabels,normalizeNpbYearlyTeam}from'./lib/standings/teamCodes.ts';const labels:string[]=[];for(const y of readdirSync('_data/raw/npb_yearly')){for(const lg of['CL','PL']){try{const j=JSON.parse(readFileSync(join('_data/raw/npb_yearly',y,lg+'.json'),'utf8'));for(const s of['standings','batting','pitching'])(j[s]??[]).forEach((r:{team:string})=>labels.push(r.team));}catch{}}}const a=auditNpbYearlyTeamLabels(labels);console.log('mapped',a.mapped.length,'unmapped',a.unmapped.length);if(a.unmapped.length){console.log(a.unmapped);process.exit(1);}console.log(normalizeNpbYearlyTeam('横浜大洋ホエールズ'));"
```

1年度だけ試す場合:

```bash
npx tsx -e "import{normalizeNpbYearlyTeam}from'./lib/standings/teamCodes.ts';console.log(normalizeNpbYearlyTeam('横浜大洋ホエールズ'));"
```

**完了条件:** 上記走査で `unmapped` が空（または既知の例外のみ計画書に記載）

---

## 6. Phase 3 — 指標計算・JSON 生成（未着手）

**スクリプト（案）:** `scripts/phase31_build_npb_yearly_standings.ts`  
**出力:** `public/data/standings/{year}/{CL|PL}.json`（`source: "npb_official_yearly"`）

---

## 7. Phase 4 — UI 統合（未着手）

`TopPageStandingsTab` で `source === "npb_official_yearly"` 時に `NPB_YEARLY_STANDINGS_METRIC_COLUMNS` を使用。

---

## 8. Phase 5 — 一括ビルド・検証・R2 配信（未着手）

---

## 9. コマンド

```bash
# Phase 0 検証
npm run validate:npb-yearly-standings:phase0
```

---

## 改訂履歴

| 日付 | 内容 |
|------|------|
| 2026-06-18 | Phase 2（歴代球団名マスタ・正規化 API） |
| 2026-06-18 | Phase 0 初版（型・列・計算式・検証スクリプト） |
