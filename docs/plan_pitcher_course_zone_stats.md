# コース別投球成績 — 実装・継続運用計画書（Phase 別）

**Phase の数:** **4 段階（Phase 1〜4）**。うちデータ一括生成は **実装スクリプト名 `phase20`**（`npm run phase20:build:pitcher-zones`）で実行する。

## 文書の位置づけ

| 用途 | 内容 |
|------|------|
| **初回** | Phase 1〜4 の実装順と完了条件 |
| **継続運用** | canonical 更新後の再生成タイミング、確認手順、障害時の切り分け |
| **オンボーディング** | 新メンバーが「データの流れ」と「コマンド」を追える |

**改訂時は文末の改訂履歴を更新する。**

---

## 1. 背景と問題の整理

### 現象

投手の「今季の成績」内 **コース別の投球成績（対右／対左 5×5）** が、多くの選手で **マスが「ー」だらけ**、または **取得エラー表示**になる。

### 技術的要因（SSOT）

| 要因 | 内容 |
|------|------|
| 試合スコープ | 現状の主系は **`yahooGameId` × NPB 選手 ID** 経由の **`/api/games/.../zone-stats`** に依存しやすい |
| 事前 JSON の不足 | **`zone_stats_{game}_{yahooPitcher}.json` がリポジトリにほぼ無い**（PoC は少数） |
| canonical フォールバック | **`canonical/{gameId}.json`** が無い、または **該当投手の `pitchEvents` が無い**と集計不可 → 404 |
| 名簿タイミング | **`rosterMatchedNpbId` が空の間は fetch しない**ため、一瞬〜継続的に空に見える場合あり |
| 指標互換 | 旧 JSON に **`tb` / `isop` が無い**と被 ISOP が「—」になり、空に近い印象 |

### 成功条件（実装完了の定義）

1. **名簿が取れた投手**について、既定フローで **シーズン（または合意した期間）に基づく**コース別投球成績が **データありで表示される**、または **無い理由が UI で明示される**。
2. **単試合スナップショット**は **`yahooGameId` で上書き**可能（後方互換）。
3. **一括再生成**が **npm script 等 1〜少数コマンド**で文書化されている。

### 運用成功の定義（継続的）

- **canonical に試合を追加したあと**、手順どおりに派生を回せば **コース別が期待どおり更新される**。
- 障害時、本書の **Runbook** で 30 分以内に「データ欠損 / API / フロント / インフラ」のいずれかに切り分けできる。

---

## 2. パイプライン上の位置づけ（他 Phase との関係）

**原則:** コース別投球は **canonical の `pitchEvents` を SSOT** とする。Yahoo 直スクレイプ JSON は **補助線**。

| 上流 | 役割 |
|------|------|
| Yahoo 取り込み・正規化 | 例: `phase10:yahoo:*`、merge で **canonical** 生成 |
| canonical | `_data/scraped_games/canonical/*.json` |
| 本計画 Phase 1（予定） | canonical から **投手×年度のゾーン派生** を生成 |
| 既存 Phase 14 | **打者**視点の `player_pitch_from_canonical`（**投手コース別とは別物**。混同禁止） |

**運用ルール:** `canonical` を増やした・差し替えたら、**本計画の派生ビルド（Phase 1 相当）を再実行**する。他の `phase11`〜`phase19` と同様、「canonical 更新 → 派生一括」の習慣に載せる。

---

## Phase 1 — データ層の一括整備（初回 + 運用で繰り返し実行）

**目的:** 試合単位の手置き JSON に依存せず、**一括で派生データを生成**できるようにする。

### 1-A. 投手×シーズンのゾーン派生（推奨・本命）

- **内容（一括）**
  - `scraped_games/canonical` 内の **全試合**（または `--year` / 試合リストでフィルタ）を走査。
  - 各 **`yahooPitcherId`** について、`buildPitcherZoneStatsFromCanonicalPlateAppearances` と同等の集計を **試合横断でマージ**。
  - 出力例: `_data/derived/pitcher_zone_from_canonical/{year}/yahoo_{yahooPitcherId}.json`  
    - スキーマは既存 `ZoneStatsResponse` と整合（`vsRight` / `vsLeft`、`isop`、可能なら `tb`）。
- **成果物（実装済み）**
  - `scripts/phase20_build_pitcher_zone_from_canonical.ts`
  - `npm run phase20:build:pitcher-zones`（既定 `--year 2026`。変更は `package.json` の script か CLI で指定）

### 1-B. （任意・補助）Yahoo スクレイプ JSON のバッチ生成

- **内容（一括）:** `fetch_pitcher_zone_stats.py` のバッチラッパー（試合×投手リスト）。レート制限・リトライをコメントで明記。
- **運用:** canonical が無い・`pitchEvents` が欠ける試合のみ **ピンポイントで**使う。乱用しない。

### Phase 1 完了条件（初回）

- [x] スクリプト `phase20_build_pitcher_zone_from_canonical.ts` と `npm run phase20:build:pitcher-zones` を追加した。
- [ ] プロジェクトルートで `npm run phase20:build:pitcher-zones` が **終了コード 0**。
- [ ] 少なくとも 1 投手で **25×2 ゾーン**が期待どおり（`_data/derived/pitcher_zone_from_canonical/{year}/` を目視）。

### Phase 1 運用メモ（継続）

| トリガー | 作業 |
|----------|------|
| canonical に **新規試合 JSON を追加**した | Phase 1 スクリプトを **同じ `--year`** で再実行 |
| **年度切り替え**（例: 2026→2027） | `DERIVED_SEASON_YEAR_DEFAULT` / 名簿 CSV / 本スクリプトの `--year` を揃えて再実行 |
| 集計ロジック（ゾーン・決着球）を変えた | 派生を **全件再生成**（キャッシュ混在防止） |
| リポジトリに派生を **コミットする方針**の場合 | PR に「再生成コマンドと対象年度」を必ず記載 |

---

## Phase 2 — API の一括拡張（初回実装後も契約の保守対象）

**目的:** フロントが **試合固定 API のみ**に縛られないようにする。

### 2-A. 新 API（推奨・実装済み）

- **`GET /api/players/{publicId}/pitcher-zone-stats?year=2026`**（`year` 省略時は `DERIVED_SEASON_YEAR_DEFAULT`）
- 実装: `app/api/players/[playerId]/pitcher-zone-stats/route.ts`
- 読み込み: `loadPitcherZoneSeasonDerived`（`lib/yahooGame/gamePitcherPilotFiles.ts`）
- 無い場合: **404** + `code`: `NO_YAHOO_ID` | `NO_DERIVED_DATA`

### 2-B. 既存 `zone-stats`（試合単位）

- **維持。** `yahooGameId` 指定時は **試合スナップショット**用。

### Phase 2 完了条件（初回）

- [x] 新 API が 200 で `vsRight` / `vsLeft` を返す（Phase 20 済み・該当派生がある投手）。
- [x] ファイル無し時は 404 + `code`（フロントで説明可能）。

### Phase 2 運用メモ（継続）

- **レスポンス形式を変える**場合は: フロント（Phase 3）と **同じ PR または直後の PR** で直す。Version query（`?v=2`）は必要なら導入。
- **年度パラメータ**は `DERIVED_SEASON_YEAR_DEFAULT` とドキュメント上で一致させる。

---

## Phase 3 — フロントの一括差し替え（初回 + 仕様変更時）

**目的:** コース別ブロックの **主データソース**を Phase 2 に寄せる。

### 内容（一括）

- `page.tsx`: **主** `pitcher-zone-stats`、**従** `yahooGameId` 明示時のみ試合 API 等（仕様をコードコメント 1 箇所に固定）。
- `zoneStatsUnavailableReason` を新 API のエラーに同期。
- 名簿未確定時の **ローディング / 保留**表示。

### Phase 3 完了条件（初回）

- [ ] Phase 1 生成済み投手でコース別が **空にならない**。
- [ ] `yahooGameId` 変更時の挙動がコメントと一致。

### Phase 3 運用メモ（継続）

- UI 文言変更は **ユーザー向けヘルプ**（試合 ID の意味・データ更新の遅れ）とセットで検討する。

---

## Phase 4 — 検証・ドキュメント・定期確認（初回 + 四半期でもよい見直し）

**目的:** 再現性、オンボーディング、**運用の型**。

### 初回（一括）

- [x] `scripts/RUN.md` に **依存関係**を追記: Phase 1（`phase20`）コマンド、canonical / 派生パス、Node と Python の境界（`pa_outcome_from_ts` 等との混同防止）。
- [x] **スモークチェックリスト**（手動可）を `scripts/RUN.md` の「投手コース別（シーズン横断・Phase 20）」に配置。

### 継続（運用チェックリスト — データ更新のたび推奨）

- [ ] Phase 1 再実行が **エラーなく完走**した
- [ ] 任意の **登板あり投手** 1 名で API が 200（または「データなし」の契約どおり）
- [ ] ブラウザで **コース別グリッド**に数値が出る（または説明メッセージのみ）

### Phase 4 完了条件（初回）

- [ ] 新規クローンが **手順のみ**で画面確認まで到達できる（**canonical・派生の入手方針**が README 等でチームに合意されていることが前提。手順本体は `scripts/RUN.md`）。

---

## Phase 依存関係（実装順）

```
Phase 1（派生データ一括生成）→ Phase 2（API）→ Phase 3（フロント）→ Phase 4（検証・手順の固定）
```

**運用サイクル（実装後の定常）:**  
`canonical 更新` → **Phase 1 再実行** → （必要なら）デプロイ・キャッシュ無効化 → **Phase 4 チェックリスト**

---

## 3. トラブルシュート Runbook（運用）

| 症状 | まず確認すること | よくある原因 |
|------|------------------|--------------|
| 全員コース別が空 | Network で `zone-stats` / 新 API の **ステータス** | 派生未生成、404、名簿 NPB 未確定 |
| 特定選手だけ空 | その選手の **Yahoo 投手 ID** と派生ファイルの有無 | ファイル名の `yahoo_*` が一致していない |
| 被 ISOP だけ「—」 | JSON に **`tb` / `isop`** があるか | 旧形式 JSON → 再生成 |
| Python スクリプトが `npx` エラー | `where npx`、ターミナル再起動 | Node 未導入・PATH 未反映 |
| `next dev` が EPERM | `.next` 削除、OneDrive 同期 | ファイルロック |

**切り分けの順序:** ① ブラウザ Network ② サーバーログ ③ `_data/derived/...` の存在 ④ canonical 内 `pitchEvents`

---

## 4. 変更管理・リポジトリ方針（運用）

| 項目 | 推奨 |
|------|------|
| 派生 JSON を Git に含めるか | チーム方針で統一。**含めない**なら README に「デプロイ前に必ず Phase 1 実行」を明記 |
| 年度 | `DERIVED_SEASON_YEAR_DEFAULT`・名簿・Phase 1 の `--year` を **同じ年度で運用** |
| 指標変更（ISOP 等） | TS の SSOT（`paSettlementStatsFromResultJa` 等）と Python 側の整合を **1 PR で**取る |

---

## 5. リスクと回避

| リスク | 回避 |
|--------|------|
| canonical の網羅欠損 | Phase 1 で **処理した試合 ID 一覧をログ**に出す |
| Yahoo ID と NPB の不一致 | Phase 2 で既存 **橋渡し関数を再利用** |
| OneDrive による EPERM | プロジェクトを同期外に置くか、`.next` 削除手順を Runbook に含める |

---

## 6. スコープ外

- 野手 **コース別打撃**（`PitchDetailsPilot` / Phase 14 打者キー）— **別指標**。
- 球種別テーブルの **被 OPS** など、コース別以外の列。

---

## 改訂履歴

| 版 | 日付 | 内容 |
|----|------|------|
| 1.0 | 2026-04-12 | 初版（Phase 別計画） |
| 2.0 | 2026-04-12 | 継続運用・パイプライン位置づけ・Runbook・変更管理を追加。「実装+運用」計画書に再編 |
| 2.1 | 2026-04-12 | Phase 数の明示、`phase20:build:pitcher-zones`（計画書 Phase 1-A）実装を反映 |
| 2.2 | 2026-04-12 | Phase 2: `GET .../pitcher-zone-stats` API と `loadPitcherZoneSeasonDerived` を追加 |
| 2.3 | 2026-04-12 | Phase 3: 投手ページのコース別取得をシーズン API 主系＋試合 API フォールバックに変更 |
| 2.4 | 2026-04-11 | Phase 4: `scripts/RUN.md` に Phase 20 依存関係・スモークチェックリストを追記 |
