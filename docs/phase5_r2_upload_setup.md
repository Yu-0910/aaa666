# Phase 5 — R2 アップロード手順（認証情報）

`npm run display:r2:upload` が `Missing R2 credentials` で止まるときの設定ガイド。

---

## ターミナルの意味

| 出力 | 意味 |
|------|------|
| `JSON files: 15505` | ローカルに載せるファイルは揃っている ✅ |
| `dry-run` 成功 | パス `data/rankings/...` は正しい ✅ |
| `Missing R2 credentials` | **Cloudflare の API キーが未設定**（次の手順で直す） |

---

## 1. Cloudflare で4つの値を取る

### 使う画面 / 使わない画面

| 画面 | 使う？ |
|------|--------|
| **R2 API トークンの管理** → 作成 | **はい（これだけ）** |
| **アカウント API トークンの作成**（プロフィール等） | **いいえ** — 1 本のトークンしか出ず `npm run display:r2:upload` では使えない |
| バケット設定（一般・パブリック開発 URL 等） | **いいえ** — 公開 URL 確認だけ |

### 手順

1. 左 **R2 Object Storage** → **R2 API トークンの管理**（バケットの中ではない）
2. **Create API token**
   - 権限: **オブジェクト読み取りと書き込み**（管理者ではない）
   - バケット: **特定のバケット** → `rankings-data`
3. 作成直後に **2 つ** コピー（再表示不可）:
   - **Access Key ID** → `CLOUDFLARE_R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
4. ダッシュボード右の **アカウント ID** → `CLOUDFLARE_ACCOUNT_ID`
5. バケット名 `rankings-data` → `CLOUDFLARE_R2_BUCKET_NAME`

公開 URL（Vercel の `RANKINGS_BASE_URL`）は別物です:  
`https://pub-41ff9f32fcf748529b7036f73f9e04e5.r2.dev`（アップロード用トークンとは別）

---

## 2. プロジェクト直下に `.env.local` を書く

`TopPage/.env.local`（Git にコミットしない）:

```env
CLOUDFLARE_ACCOUNT_ID=あなたのアカウントID
CLOUDFLARE_R2_ACCESS_KEY_ID=アクセスキー
CLOUDFLARE_R2_SECRET_ACCESS_KEY=シークレットキー
CLOUDFLARE_R2_BUCKET_NAME=rankings-data
```

引用符は不要。前後にスペースを入れない。

---

## 3. 再実行

```powershell
npm run display:r2:upload
```

15,505 件は **10〜30 分程度**かかることがあります。完了後:

```powershell
npm run display:r2:phase1
```

R2 直の 2026 が **200** になれば Phase 5 完了 → 本番 URL で Phase 8 確認。

---

## よくある失敗

| 症状 | 対処 |
|------|------|
| まだ Missing credentials | `.env.local` のファイル名・場所（`TopPage` 直下）を確認 |
| Access Denied | トークンのバケット権限・バケット名の typo |
| 途中で止まる | 再実行で上書き（同じキーに Put し直す） |
| **今週タブ**だけ 404 / エラー | 週間 JSON 未生成、または `top-leaders/weekly/2026/...` が R2 未投入（下記） |

---

## 今週タブ用（週間データ）

トップ「今週」は次を読む（いずれも R2 キー `data/...`）:

| 用途 | R2 キー例 |
|------|-----------|
| 表示週 | `data/rankings/weekly/2026/current-week.json` |
| 今週リーダー | `data/top-leaders/weekly/2026/2026-05-19/CL/batting.json` ほか |

**注意**: `display:r2:upload:2026` は `top-leaders/weekly/2026/` も含める（`2026/CL/...` だけでは足りない）。

```powershell
npm run weekly:display:2026
```

（中身: `phase28` → `top-weekly-leaders:build:2026` → `display:r2:upload:2026`）

投入後の確認（R2 直）:

- `.../data/rankings/weekly/2026/current-week.json` → 200
- `.../data/top-leaders/weekly/2026/{weekKey}/CL/batting.json` → 200

本番 `/data/...` が 404 のときは **Phase 6 プロキシ**（`app/data/[...path]/route.ts`）のデプロイと Vercel **Production** の `RANKINGS_BASE_URL` を確認し、Redeploy する。
