# 表示用データ R2 一本化 — Phase 1 棚卸し結果

**実行日**: 2026-05-22  
**計画**: [`plan_display_data_r2_unified_phases.md`](plan_display_data_r2_unified_phases.md) **Phase 1**  
**再実行**: `npm run display:r2:phase1`（R2: `RANKINGS_BASE_URL`、本番: `DISPLAY_R2_SITE_BASE_URL`）

---

## 1. ローカル工場出力（`public/data/`）

| ルート | R2 接頭辞 | JSON 件数 | 合計サイズ | 検出年度 |
|--------|-----------|-----------|------------|----------|
| `public/data/rankings/` | `data/rankings/` | **15,485** | **約 991 MB** | 1936–2026 |
| `public/data/top-leaders/` | `data/top-leaders/` | **20** | **約 63 KB** | **2026 のみ** |

---

## 2. 代表 URL チェックリスト（Phase 1 固定）

| ID | 確認項目 | サイトパス | ローカル | R2 直 (2026-05-22) |
|----|----------|------------|----------|---------------------|
| 2026_batting_ops | 2026 打撃 OPS (CL) | `/data/rankings/2026/CL/OPS.json` | OK | **404** |
| 2026_pitching_era | 2026 投手 防御率 (CL) | `/data/rankings/pitching/2026/CL/防御率.json` | OK | **404** |
| 2026_top_batting | トップ今季 | `/data/top-leaders/2026/CL/batting.json` | OK | **404** |
| 2026_weekly_meta | 週間メタ | `/data/rankings/weekly/2026/current-week.json` | OK | **404** |
| 2025_ops | 2025 打撃 OPS (PL) | `/data/rankings/2025/PL/OPS.json` | OK | **200** |
| 1975_ops | 1975 打撃 OPS (PL) | `/data/rankings/1975/PL/OPS.json` | OK | **200** |

---

## 3. 解釈

1. **ローカル**: 2026 表示用 JSON は揃っている。  
2. **R2**: **2026 は未アップロード（404）** → **Phase 5** が必要。  
3. **本番**: Phase 2 の env + Phase 5 で解消。  
4. **top-leaders**: **Phase 6** でプロキシ統合予定。

---

## 4. 次のアクション（計画書の番号順）

| Phase | 内容 | 状態 |
|-------|------|------|
| **2** | Vercel Production `RANKINGS_BASE_URL` | 要確認 |
| **5** | `npm run display:r2:upload` | **あなたが実行**（R2 トークン要） |
| **6** | プロキシ統合 | コード実装済み → **push & Redeploy** |
| **7** | API の fetch 化 | コード実装済み → 同上 |
| **8** | 本番検証 | Phase 5 後 |

---

## 5. 機械可読出力

- `output/phase1_inventory.json`
- `scripts/phase1_display_data_inventory.mjs`（`display:r2:phase1`）
