# 投手指標の裏側仕様（Phase 0 文書化）

**目的**: ランキング UI・JSON 生成・ソートがぶれないよう、型・ソート方向・計算式・未実装項目をここに固定する。  
**実装の正**: 集計は `scripts/phase19_build_pitching_rankings_from_canonical.ts` の `buildPitchingRow`、一覧の既定ソートは `lib/ranking/pitchingSortOrder.ts`、表示形式は `lib/formatStat.ts` の `getMetricFormat`。

---

## 1. 指標一覧（データ型・ランキングソート・JSON キー）

「良い方向」は **ランキングで上位に来る向き**（`order=asc` は数値が小さいほど上位、`desc` は大きいほど上位）。

| 順 | UI ラベル（Record_pitching 正） | JSON キー | 値の種類 | 良い方向 | 備考 |
|---:|---|---|:---:|---|---|
| 1 | 防御率 | `era` | 実数（防御率） | 小さいほど良い → **asc** | 下記 §2 |
| 2 | K-BB％ | `k_bb_pct` | 実数（0〜100、百分率の数値） | 大きいほど良い → **desc** | 下記 §2 |
| 3 | 勝利 | `w` | 整数 | 大きいほど良い → **desc** | |
| 4 | 敗戦 | `l` | 整数 | **desc**（数値が大きいほど上位。野球感覚の「少ないほど良い」とは逆。並べ替え仕様を変える場合はコードと本表を同時更新） | |
| 5 | HLD | `hld` | 整数 | **desc** | |
| 6 | Ｓ | `sv` | 整数 | **desc** | §3（現状常に 0） |
| 7 | ＨＰ | `hp` | 整数 | **desc** | §3（現状常に 0・意味は §4） |
| 8 | 試合 | `g` | 整数 | **desc** | 登板のあった試合数（ユニーク gameId） |
| 9 | 先発 | `gs` | 整数 | **desc** | §3（現状常に 0） |
|10 | 完投 | `cg` | 整数 | **desc** | §3（現状常に 0） |
|11 | 完封 | `sho` | 整数 | **desc** | §3（現状常に 0） |
|12 | 勝率 | `wpct` | 実数（0〜1） | 大きいほど良い → **desc** | 表示は打率風 `.xxx`（formatStat） |
|13 | 回数 | `ip` | 実数（十進イニング） | **desc** | 例: 6.1 |
|14 | 被打者 | `bf` | 整数 | **desc** | |
|15 | 投球数 | `np` | 整数 | **desc** | |
|16 | P/IP | `p_ip` | 実数 | **小さいほど良い → asc** | 下記 §2 |
|17 | 被安 | `ha` | 整数 | **desc** | 集計上は H |
|18 | 被本 | `hra` | 整数 | **desc** | |
|19 | 三振 | `so` | 整数 | **desc** | |
|20 | 四球 | `bb` | 整数 | **desc** | |
|21 | WHIP | `whip` | 実数 | **小さいほど良い → asc** | 下記 §2 |
|22 | K％ | `k_pct` | 実数（0〜100） | 大きいほど良い → **desc** | 下記 §2 |
|23 | BB％ | `bb_pct` | 実数（0〜100） | **小さいほど良い → asc** | 下記 §2 |
|24 | QS率 | `qs_rate` | 実数（0〜100） | **desc**（実装一致） | §3（現状常に 0） |
|25 | HQS率 | `hqs_rate` | 実数（0〜100） | **desc** | §3（現状常に 0） |
|26 | SQS率 | `sqs_rate` | 実数（0〜100） | **desc** | §3（現状常に 0） |
|27 | 被打率 | `avg_against` | 実数（0〜1） | **小さいほど良い → asc** | 下記 §2 |
|28 | 被BABIP | `babip_against` | 実数（0〜1） | **小さいほど良い → asc** | 下記 §2 |
|29 | 被出塁率 | `obp_against` | 実数（0〜1） | **小さいほど良い → asc** | 下記 §2 |
|30 | 被長打率 | `slg_against` | 実数（0〜1） | **小さいほど良い → asc** | 下記 §2 |

**ソート実装の対応**

- URL・トップ導線: `getPitchingSortOrderForKey`（`lib/ranking/pitchingSortOrder.ts`）
- JSON 生成時の並び: `metricSortAsc`（phase19、`bb_pct` のみ昇順、その他は `LOWER_BETTER` 集合で判定）。**K-BB％（`k_bb_pct`）は高いほど良いので降順**（`LOWER_BETTER` に含めない）

**表示形式（UI）**は `lib/formatStat.ts` の `getMetricFormat` に従う（率は `percent1` のとき **数値は既に 0〜100** として `toFixed(1)+'%'`）。

---

## 2. 計算式（phase19 実装の一文定義）

記号は試合横断集計後の合算値: `outs`＝アウト数（`ip` を十進にした値 × 3）、`ipDec = outs/3`、`BF, H, HR, SO, BB, HBP, ER, NP` は canonical `PitchingLine` 由来の合計。

| 指標 | 式（分母 0 のときは値 0 とする） |
|---|---|
| **防御率（ERA）** | `ERA = ER × 27 / outs`（`outs > 0`） |
| **WHIP** | `(BB + H) / ipDec`（`ipDec > 0`） |
| **K％** | `(SO / BF) × 100`（`BF > 0`） |
| **BB％** | `(BB / BF) × 100`（`BF > 0`） |
| **K-BB％** | `((SO − BB) / BF) × 100`（`BF > 0`）。**三振率と四球率の差を打者面对比で表した百分率**（自前定義。NPB 公式表記と完全一致を保証しない） |
| **勝率** | `W / (W + L)`（`W+L > 0`）。表示は別途打率風フォーマット |
| **P/IP** | `NP / ipDec`（`ipDec > 0`）。**1 イニング（3 アウト）あたりの投球数** |
| **被打率** | `AB_est = max(0, BF − BB − HBP)` とし、`H / AB_est`（`AB_est > 0`） |
| **被出塁率** | `(H + BB + HBP) / BF`（`BF > 0`） |
| **被長打率** | `TB_est = H + HR × 3`（単打・二塁打・三塁打を H に分解しない近似）、`TB_est / AB_est`（`AB_est > 0`）。**厳密な公式 SLG ではなく集計データ制約下の近似** |
| **被BABIP** | 分母 `BF − BB − HBP − SO − HR` が正のとき `(H − HR) / 分母` |

---

## 3. 現パイプラインで「常に 0」または未入力の項目

canonical の `PitchingLine` と phase19 の集計範囲では、次は **実装として 0 固定**（または未集計）。

| JSON キー | UI ラベル | 内容 |
|---|---|---|
| `sv` | Ｓ | セーブ数（未集計 → 0） |
| `hp` | ＨＰ | §4 |
| `gs` | 先発 | 先発登板回数（未集計 → 0） |
| `cg` | 完投 | 未集計 → 0 |
| `sho` | 完封 | 未集計 → 0 |
| `qs_rate` | QS率 | **クオリティスタート率**。分子分母未定義のため **0 固定**。将来、公式定義または **「先発かつ 6IP 以上かつ失点 3 以下」等の自前定義を一文でここに追記**してから実装する |
| `hqs_rate` | HQS率 | 同上。**定義確定後に実装** |
| `sqs_rate` | SQS率 | 同上。**定義確定後に実装** |

---

## 4. 「ＨＰ」列の意味（データとの照合）

- **UI・マスタ上のラベル**は NPB 成績表で使われる **「ＨＰ」** に合わせている。
- **現行 canonical / phase19 では「ホールドポイント」等のソースが無く、`hp` は常に 0**。  
- NPB 公式が **ＨＰを「ホールドポイント」** としている前提で列を置いており、**将来 canonical または別 CSV に列が追加されたら、その定義に合わせて `hp` を埋める**。  
- 公式が別義（例: 記録略号の別解釈）であることが判明した場合は、本節と `Record_pitching.csv` の備考を更新する。

---

## 5. 改訂時のルール

- 式やソート方向を変えたら **必ず** `phase19_build_pitching_rankings_from_canonical.ts`・`pitchingSortOrder.ts`・本書を同じ PR で揃える。  
- 個別選手だけの例外分岐は `pitching_ranking_plan.md` §1.2 に反するため禁止（集中マップに限る）。

---

## 6. 参照ファイル

| 内容 | パス |
|---|---|
| 集計・行生成 | `scripts/phase19_build_pitching_rankings_from_canonical.ts` |
| 一覧既定ソート | `lib/ranking/pitchingSortOrder.ts` |
| 表示フォーマット | `lib/formatStat.ts` |
| 指標順・ラベル正 | `_data/master_csv/Record_pitching.csv` |
| ラベル→キー | `config/pitching_metric_map.json`、`getPitchingJsonKey` |
