# Phase 2 — 表示用データの R2 キー規則と環境変数（確定版）

**対象**: 表示用 JSON のみ。工場層 `_data/` は [付録 A](plan_display_data_r2_unified_phases.md#付録-a--工場層本計画の-phase-ではない)。

**関連**: [`plan_display_data_r2_unified_phases.md`](plan_display_data_r2_unified_phases.md)、[`display_data_r2_phase1_inventory.md`](display_data_r2_phase1_inventory.md)

**確定日**: 2026-05-22

---

## 1. 用語（初心者向け）

| 用語 | 意味 |
|------|------|
| **ローカル工場** | `public/data/rankings/`・`top-leaders/`（`npm run rankings:rebuild`） |
| **R2** | 本番の JSON 置き場 |
| **オブジェクトキー** | R2 上のパス（`public/` なし） |
| **`RANKINGS_BASE_URL`** | R2 公開ベース URL（Vercel に設定） |

### 番号の混乱について

| 名前 | 意味 |
|------|------|
| **本計画 Phase 2**（この文書） | キー・環境変数 |
| **Cloudflare 手順書 Phase 1** | R2 バケット作成（インフラ・別文書） |
| **`phase0:sportsnavi:schedule`** | 日程取得（工場・無関係） |

---

## 2. R2 オブジェクトキー（確定）

| ローカル | R2 キー | ブラウザ |
|----------|---------|----------|
| `public/data/rankings/2026/CL/OPS.json` | `data/rankings/2026/CL/OPS.json` | `/data/rankings/2026/CL/OPS.json` |
| `public/data/top-leaders/2026/CL/batting.json` | `data/top-leaders/2026/CL/batting.json` | `/data/top-leaders/2026/CL/batting.json` |
| `public/data/top-leaders/weekly/2026/{weekKey}/CL/batting.json` | `data/top-leaders/weekly/2026/{weekKey}/CL/batting.json` | `/data/top-leaders/weekly/2026/{weekKey}/CL/batting.json` |
| `public/data/rankings/weekly/2026/current-week.json` | `data/rankings/weekly/2026/current-week.json` | `/data/rankings/weekly/2026/current-week.json` |

**R2 直 URL**: `{RANKINGS_BASE_URL}/{R2キー}`

---

## 3. 環境変数（確定）

### 本番 Vercel（Production）

```
RANKINGS_BASE_URL=https://pub-41ff9f32fcf748529b7036f73f9e04e5.r2.dev
NEXT_PUBLIC_RANKINGS_BASE_URL=https://pub-41ff9f32fcf748529b7036f73f9e04e5.r2.dev
```

- 末尾 `/` なし、`/data/rankings` も付けない  
- `RANKINGS_BASE_URL`: サーバー（SSR・プロキシ）  
- `NEXT_PUBLIC_RANKINGS_BASE_URL`: クライアント今週タブの R2 直読み（**同じ URL をコピー**）  
- **Production** にチェック → Save → Redeploy

### 本番では付けない

- `RANKINGS_EXTERNALIZE_SCOPE`
- `RANKINGS_PREFER_LOCAL`

### 検証用（任意）

- `DISPLAY_R2_SITE_BASE_URL` — `npm run display:r2:phase1` で本番 URL を叩く

---

## 4. よくある間違い

| 間違い | 正しい |
|--------|--------|
| R2 キーに `public/` を付ける | `data/rankings/...` のみ |
| Pre-Production だけ env | **Production** も必須 |
| R2 に 2026 が無い | **Phase 5** で全アップロード |
| Redeploy だけで数字更新 | **Phase 5 / 9** で R2 更新 |

---

## 5. Phase 2 完了チェックリスト

- [x] キー規則の文書化
- [ ] Vercel **Production** に `RANKINGS_BASE_URL` 登録済み
- [ ] 次: **Phase 5** — `npm run display:r2:upload`（要 R2 API トークン）

---

## 6. クイックリファレンス

```
public/data/rankings/    →  data/rankings/
public/data/top-leaders/ →  data/top-leaders/
```
