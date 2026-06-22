# 投手ランキング（1950〜2025）— Phase 0 要件確定書

**状態**: ✅ Phase 0 完了  
**親計画**: [`plan_pitching_rankings_historical_phases.md`](./plan_pitching_rankings_historical_phases.md)

---

## 1. 固定したこと

| 項目 | 決定内容 |
|------|----------|
| データ正本 | `_data/master_csv_calculated/pitching_{year}_{CL\|PL}_from_master.csv` |
| 歴史年度の指標順 | [`_data/master_csv/Record_pitching_historical.csv`](../_data/master_csv/Record_pitching_historical.csv)（**25 指標**） |
| 2026 の指標順 | [`_data/master_csv/Record_pitching.csv`](../_data/master_csv/Record_pitching.csv)（**30 指標**・現行維持） |
| 2026 専用（歴史に出さない） | 先発, 投球数, P/IP, QS率, HQS率, SQS率, 被打率, 被BABIP, 被出塁率, 被長打率 |
| 規定投球回（歴史） | チーム別 `max(G) × 1.0` イニング（ビルド時フィルタ） |
| 率系指標 | 防御率, WHIP, K-BB％, K％, BB％, 勝率（`qualifyingPitching.ts` の `RATE_KEYS` と一致） |
| JSON 出力先 | `public/data/rankings/pitching/{year}/{league}/{metric}.json` |
| 2026 パイプライン | Phase 19 を上書きしない（`--max-year 2025`） |

---

## 2. Record_pitching_historical.csv（確定順）

```
防御率,K-BB％,勝利,敗戦,HLD,Ｓ,ＨＰ,試合,完投,完封,勝率,回数,被打者,被安,被本,三振,四球,WHIP,K％,BB％,敬遠,死球,自責,失点,暴投
```

2026 用 `Record_pitching.csv` から **先発・投球数・P/IP・QS 系・被打率系を除き**、マスタ CSV にある **敬遠・死球・自責・失点・暴投** を末尾に追加。

---

## 3. コード正本（Phase 0 成果物）

| ファイル | 役割 |
|----------|------|
| `_data/master_csv/Record_pitching_historical.csv` | 歴史年度 UI / JSON の指標順 SSOT |
| `config/pitching_metric_map.json` | 敬遠・死球・自責・失点・暴投の日本語キー追加 |
| `lib/ranking/recordPitching.ts` | `loadMetricsFromRecordPitchingHistorical()` / `loadMetricsFromRecordPitchingForYear()` |
| `scripts/lib/pitching_historical_metrics.py` | Python ビルド用の列マッピング・2026 専用集合 |
| `scripts/validate_pitching_historical_phase0.py` | Phase 0 検証 |

---

## 4. 検証コマンド

```powershell
cd c:\dev\TopPage
python scripts/validate_pitching_historical_phase0.py
```

期待: 1950 / 1958 / 2000 / 2024 のサンプル CSV で **全 25 指標が列解決 OK**。

---

## 5. Phase 1 以降への引き継ぎ

- **Phase 1**: `parse_pitching_filename` / 出力パス
- **Phase 2**: `build_pitching_rankings_from_calculated.py`（`pitching_historical_metrics.py` を import）
- **Phase 5**: `page.tsx` で `loadMetricsFromRecordPitchingForYear(yearNum)` を使用（ローダは Phase 0 で実装済み）

---

## 6. 既知のデータ品質（仕様として許容）

- 1950 年代など **ER=0 が多く ERA=0.0** になる行がある（元データ由来）
- 計算済み CSV の行数が import より多い年度がある（追補済みマスタ）
