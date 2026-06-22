# カウント別球種情報 — 実装・継続運用計画書（Phase 別）

**Phase の数:** **4 段階（Phase 0〜4）**。うちデータ一括生成の中核は **`phase:pitcher-poc1`**（`splits.byCountPitchTypes` 追加）で、機能番号として **Phase 32** と呼ぶ。

## 文書の位置づけ

| 用途 | 内容 |
|------|------|
| **初回** | Phase 0〜4 の実装順と完了条件 |
| **継続運用** | canonical 更新後の再生成タイミング、確認手順 |
| **オンボーディング** | データの流れ・コマンド・UI 仕様の SSOT |

**改訂時は文末の改訂履歴を更新する。**

---

## 1. 背景と目的

### 1.1 やりたいこと

投手個人ページ「今季の成績 › 投球データ」に、**B-S カウント別（12 種）の球種構成**を表示する。

| 項目 | 内容 |
|------|------|
| 区分 | `0-0` / `1-0` / `2-0` / `3-0` / `0-1` / `1-1` / `2-1` / `3-1` / `0-2` / `1-2` / `2-2` / `3-2` の **12 カウント** |
| 表示形式 | 既存 **「巡目別の球種一覧」** と同じ **積み上げ横棒グラフ**（球種ごとに色分け、`pct` を幅に反映） |
| 配置 | 「巡目別の球種一覧」の直下、または同一サブタブ（`pitcherSeasonSubTab === "pitch"`）内 |
| 初版年度 | `2026`（`DERIVED_SEASON_YEAR_DEFAULT` に追随） |

### 1.2 用語

| 用語 | 意味 |
|------|------|
| **Phase 32** | 投手シーズン payload に **カウント別球種**（`byCountPitchTypes`）を付与する派生処理 |
| **カウントキー** | `"0-0"` … `"3-2"` 形式。SSOT は `lib/yahooGame/pitchCountSim.ts` の `VALID_COUNT_KEYS` |
| **一球の帰属** | 各 `pitchEvent` を **その球を投げる直前の B-S** に帰す（打席結果の四球寄せは **使わない**） |
| **巡目別球種** | 既存 `splits.byPaRoundPitchTypes`（`phase:pitcher-poc1`）。UI・スキーマの **見本** とする |

### 1.3 成功条件（実装完了の定義）

1. 一球ログ（`pitchEvents`）がある投手について、12 カウント各行に **横棒グラフ**が表示される（投球 0 のカウントは空バーまたは非表示）。
2. 各カウント内の `pct` 合計が **100% ± 丸め誤差**（当該カウントの総投球数に対する球種別割合）。
3. **再生成**（`phase:pitcher-poc1`）と **日次一括**（`daily:npb-pipeline` / `day:fetch-display`）に組み込まれ、canonical 更新後に手順どおり回せばデータが追従する。

### 1.4 スコープ外（初版）

- 対左右別 × カウント別の 12×2 マトリクス（後続 Phase で検討可）
- カウント別の **Whiff% / 被打率** 等の率指標（本 Phase は **球種構成（投球割合）のみ**）
- 捕手タブへの同一ブロック（投手タブのみ）
- 試合単位スナップショット API（シーズン集計のみ）

---

## 2. 現状整理

### 2.1 既存資産（流用する）

| レイヤ | ファイル / 処理 | 役割 |
|--------|-----------------|------|
| カウント SSOT | `lib/yahooGame/pitchCountSim.ts` | B-S シミュ（`advanceBs` / `classifyPitchResultForCountJa`） |
| 打者カウント別成績 | `scripts/phase16_build_count_splits_from_canonical.ts` | **打席単位**のカウント帰属（四球寄せあり）。**参考のみ**（一球帰属ロジックは別） |
| 巡目別球種（投手） | `scripts/phase_pitcher_poc1_build_from_canonical.ts` | `byPaRoundPitchTypes` を canonical 走査で生成 |
| 型 | `lib/pitcherSeasonPocTypes.ts` | `PitcherSeasonPocPayload.splits` |
| UI（横棒） | `app/players/[playerId]/PlayerPagePitcherSeasonBody.tsx` | 「巡目別の球種一覧」セクション（palette / `partsForRound` / 凡例） |
| 出力先 | `_data/derived/player_season_pitching/{year}/npb_{npbPlayerId}.json` | 既存 season-pitching API が読む payload |

### 2.2 ギャップ

- `pitchCountSim` に **任意インデックスの一球直前カウント**を返す関数が無い（`countBeforeLastPitch` は最終球のみ）。
- `PitcherSeasonPocPayload` に `byCountPitchTypes` が無い。
- UI にカウント別横棒が無い。
- `run_reparse_empty_pitchrows_and_rebuild_2026.py` は **phase14 + 打撃プロフィール**までで、`phase:pitcher-poc1` を再実行しない（一球修正後に巡目別・カウント別が古いまま残りうる）。

---

## Phase 0 — 仕様固定（実装前）

**目的:** 集計定義と表示仕様をコードに書く前に固定する。

### 0-A. 一球のカウント帰属ルール

```
各 pitchEvent e（インデックス i）について:
  1. 同一打席の pitchEvents を pitchIndex でソート
  2. i === 0 → カウントキー "0-0"
  3. i > 0  → pitches[0..i-1] の resultJa を advanceBs で逐次適用した直後の "B-S"
  4. isValidPitchCountKey(key) でなければ当該球は集計から除外（ログ用カウンタのみ）
  5. 球種 = (e.pitchTypeJa ?? "").trim() || "不明"
  6. 投手 = e.yahooPitcherId（打席途中交代対応。byPaRoundPitchTypes と同じ）
```

**四球寄せ（`adjustPitchCountKeyForWalk`）は使わない。** 打者の Phase 16 は打席結果を 3-0 等に寄せるが、本 Phase は **投球 MIX** なので一球ごとの自然なカウントを正とする。

### 0-B. 集計スキーマ（`byCountPitchTypes`）

`byPaRoundPitchTypes` と同型で、キーだけ 12 カウント:

```typescript
byCountPitchTypes?: Array<{
  key: string       // "0-0" … "3-2"
  label: string     // 表示用（初版は key と同一で可）
  pitches_total: number
  rows: Array<{
    pitch_type: string
    pitches: number
    pct: number     // pitches / pitches_total * 100、小数1桁
  }>
}>
```

- 出力順: `pitchCountSim.VALID_COUNT_KEYS` の定義順（0-0 → 3-0 → 0-1 → … → 3-2）。
- `pitches_total === 0` のカウントは **JSON から省略**（UI は空バー）。

### 0-C. UI 仕様

| 項目 | 仕様 |
|------|------|
| 見出し | `カウント別の球種一覧` |
| 行ラベル | 左 46px 幅、`0-0` 形式（改行なし） |
| 棒グラフ | 高さ `h-7`、巡目別と同一（`pitchTypePctLabelStyle`、palette 共有） |
| 凡例 | 全 12 カウントを通した球種の出現順（投球数合計降順） |
| データ無し | 全体が空なら凡例に `—`（巡目別と同様） |
| fallback | **初版は fallback なし**（`byCountPitchTypes` 未生成時はセクション非表示または「データ準備中」） |

### Phase 0 完了条件

- [x] 本節 0-A〜0-C をレビューし、Yahoo 個人ページの「カウント別球種」と目視比較する選手を 1 名指定（例: 先発ローテ投手）
- [x] 四球寄せを使わない理由を関係者合意

### 0-D. Phase 0 実行結果（2026-06-10）

#### 参照投手（Yahoo 目視比較用）

| 項目 | 値 |
|------|-----|
| 選手 | **伊藤 大海**（北海道日本ハムファイターズ） |
| NPB ID | `51355153` |
| Yahoo 投手 ID | `2000079` |
| 選定理由 | 2026 canonical 371 試合中 **pitchEvents 最多（1,301 球）**。12 カウントすべてに投球があり、先発ローテとして Yahoo 個人ページとの比較に適する |

#### 仕様 SSOT（コード化済み）

| 成果物 | パス |
|--------|------|
| 一球直前カウント | `lib/yahooGame/pitchCountSim.ts` → `countBeforePitchAtIndex` / `ORDERED_PITCH_COUNT_KEYS` |
| 集計ロジック（prototype） | `lib/yahooGame/pitcherCountPitchTypesAgg.ts` |
| 型（0-B スキーマ） | `lib/pitcherSeasonPocTypes.ts` → `PitcherSeasonPocPitchTypesSplitRow` / `byCountPitchTypes` |
| 単体テスト | `lib/yahooGame/pitchCountSim.test.ts`（6 件 pass） |
| 検証 CLI | `scripts/diagnose_pitcher_count_pitch_types.ts` |

#### prototype 集計結果（伊藤 大海・2026・371 試合）

| カウント | 投球数 | 上位 3 球種（%） |
|----------|--------|------------------|
| 0-0 | 339 | ストレート 31.0%, スプリット 12.1%, ツーシーム 12.1% |
| 1-0 | 121 | ストレート 20.7%, スライダー 17.4%, スプリット 15.7% |
| 0-1 | 188 | ストレート 28.7%, スライダー 15.4%, カーブ 9.6% |
| 1-2 | 131 | ストレート 51.1%, スプリット 14.5%, スイーパー 7.6% |
| 3-2 | 67 | ストレート 55.2%, スライダー 14.9%, スプリット 10.4% |
| … | … | 全 12 カウント非ゼロ、合計 **1,301 球** |

検証コマンド: `npx tsx scripts/diagnose_pitcher_count_pitch_types.ts --yahoo 2000079 --year 2026`

#### 四球寄せを使わない理由（合意）

| 観点 | 内容 |
|------|------|
| Phase 16（打者） | 打席 **結果** を 3-0 / 3-1 / 3-2 に寄せる（成績表の行帰属） |
| Phase 32（投手） | **各球** を投球直前カウントに帰す（球種 MIX の分布） |
| 実データ | 伊藤 2026: 四球打席 14、最終球カウントが Phase16 寄せキーと異なるケース **0**（一球ログが十分な場合は差が小さいが、寄せると 3-0 以外のカウントに散在した球が人為的に 3-0 へ移動し MIX が歪む） |

**Phase 0 完了 → Phase 1（poc1 への本番組込み）に進行可。**

---

## Phase 1 — データ層（Phase 32 派生）

**目的:** canonical の `pitchEvents` から **投手×シーズン**のカウント別球種を一括生成する。

### 1-A. `pitchCountSim` 拡張

- 新規: `countBeforePitchAtIndex(pitchEvents, index): string | null`
- 単体テスト（または既存 diagnose 系）で以下を確認:
  - 1 球のみ → `0-0`
  - 2 ストライク後ファウル → カウント不変
  - ボール 4 球目直前 → `3-0`

### 1-B. `phase_pitcher_poc1` への集計追加

`byPaRoundPitchTypes` ループ（各 `pitchEvent` を巡目に帰す）の **直後**に、同一走査で `byCountPitchTypes` を更新する。

```typescript
// 疑似コード（phase_pitcher_poc1 内）
const byCountPitchTypes = new Map<string, Map<string, Map<string, number>>>()
// npb → countKey → pitchType → count

for (const e of sortedPitchEventsInPa) {
  const ck = countBeforePitchAtIndex(ev, indexInPa)
  if (!ck || !isValidPitchCountKey(ck)) continue
  // eNpb / pitchType で Map を increment（巡目別と同じ投手 ID 解決）
}
```

- payload 組み立て: `splits.byCountPitchTypes` を 12 キー分 map（`pitches_total > 0` のみ）。
- **独立スクリプトに分離しない**（巡目別球種と同じく poc1 内。二重 canonical 走査を避ける）。

### 1-C. npm script

| script | 内容 |
|--------|------|
| `npm run phase:pitcher-poc1` | 既存。内部で `byCountPitchTypes` も出力 |

新規 script 名の候補（将来分離する場合のみ）: `phase32:build:pitcher-count-pitch-types`

### Phase 1 完了条件

- [x] `lib/yahooGame/pitchCountSim.ts` に `countBeforePitchAtIndex` を追加（Phase 0 で実施）
- [x] `lib/pitcherSeasonPocTypes.ts` に `byCountPitchTypes` 型を追加（Phase 0 で実施）
- [x] `phase_pitcher_poc1_build_from_canonical.ts` が `byCountPitchTypes` を書き込む
- [x] プロジェクトルートで `npm run phase:pitcher-poc1` が終了コード 0（305 ファイル → `player_season_pitching_poc/2026/`）
- [x] 参照投手 伊藤大海（`npb_51355153`）で 12 カウント・合計 1,301 球を目視確認

### 1-D. Phase 1 実行結果（2026-06-10）

- 集計: `phase_pitcher_poc1` 内で `sortPitchEventsByPitchIndex` + `countBeforePitchAtIndex` + `pitcherCountPitchTypesAgg`
- 出力: `_data/derived/player_season_pitching_poc/{year}/npb_{npbPlayerId}.json` → `splits.byCountPitchTypes`
- 検証: 伊藤大海 `0-0` = 339 球（ストレート 31%）、全 12 カウント、合計 1,301 球（Phase 0 prototype と一致）

**Phase 1 完了 → Phase 2（API 確認）/ Phase 3（UI）に進行可。**

### Phase 1 運用メモ

| トリガー | 作業 |
|----------|------|
| canonical に試合追加 | `npm run phase:pitcher-poc1`（または日次一括） |
| `pitchCountSim` の分類ルール変更 | poc1 **全件再生成** |
| Phase10 空 pitchRows 修復後 | reparse → merge → **poc1 再実行**（Phase 4 参照） |

---

## Phase 2 — API・読み込み（変更最小）

**目的:** フロントが新フィールドを型安全に読めるようにする。

### 2-A. 既存 API 経路

- `GET /api/players/{playerId}/season-pitching?year=2026`（既存）
- 読み込み: `_data/derived/player_season_pitching_poc/{year}/npb_{id}.json`
- **新 API 不要**（payload 拡張のみ。`loadPitcherSeasonPocPayloadFromRepoAsync` が JSON をそのまま返す）

### Phase 2 完了条件

- [x] season-pitching API レスポンスに `splits.byCountPitchTypes` が含まれる（200）— JSON 直読みでフィールド透過
- [x] TypeScript ビルドが通る（`PitcherSeasonPocPayload` / `PlayerPagePitcherSeasonBody` props）

**Phase 2 完了（2026-06-10）**

---

## Phase 3 — UI（横棒グラフ）

**目的:** 巡目別と同じ UX で 12 カウントを表示する。

### 3-A. コンポーネント

- `app/components/PitchTypeSplitStackedBarSection.tsx` — 積み上げ横棒 + 凡例（palette / `pitchTypePctLabelStyle` 共有）
- `PlayerPagePitcherSeasonBody.tsx` — 「巡目別」の直下に「カウント別の球種一覧」を配置
- `ORDERED_PITCH_COUNT_KEYS`（12 件）で行順を固定。JSON に無いカウントは空バー

### Phase 3 完了条件

- [x] 投手個人ページ「投球データ」サブタブで 12 カウント横棒を表示（`byCountPitchTypes` ありの投手のみ）
- [x] データ無し投手はセクション非表示（クラッシュなし）
- [x] レイアウトは巡目別と同一（左 46px ラベル + `h-7` 棒）

**Phase 3 完了（2026-06-10）→ Phase 4（reparse 拡張）に進行可。**

---

## Phase 4 — パイプライン組込み（再生成・一括取得）

**目的:** 手動・日次・修復スクリプトのいずれでも `byCountPitchTypes` が自動更新される。

### 4-A. 組込み先一覧

| 経路 | ファイル | 対応内容 |
|------|----------|----------|
| 派生一括 | `package.json` → `phase3:derived:2026` | 既に `phase:pitcher-poc1` 含む。**Phase 1 完了後は追加作業不要** |
| 日次一括 | `scripts/run_daily_npb_pipeline.mjs` → `runDerivedAndRankings` | 同上（`phase:pitcher-poc1` 実行済み） |
| 日次取得+表示 | `npm run day:fetch-display` → 内部で `daily:npb-pipeline` | 同上 |
| 投手 poc 単体 | `npm run phase:pitcher-poc1` | 開発・部分再生成用 |
| ページデータ再生成 | `npm run rebuild:2026:page-data` | phase3 経由で poc1 含む |

### 4-B. 再生成スクリプトの拡張（要対応）

`scripts/run_reparse_empty_pitchrows_and_rebuild_2026.py` は現状:

```
restore → phase4:merge → phase14 → rebuild:batting-profile-and-rankings-2026
```

**Phase 32 以降の推奨:**

```
restore → phase4:merge → phase14
  → npm run phase:pitcher-poc1          # byPaRound + byCount 球種を更新
  → npm run phase25:build:pitcher-season-pitch-types  # 球種表と試合数同期
  → rebuild:batting-profile-and-rankings-2026
```

または保守性優先で **`npm run phase3:derived:2026`** の短縮版（pitcher 関連のみ）を reparse 末尾に追加。

### 4-C. 検証（任意・Phase 32b）

| 検証 | 内容 |
|------|------|
| 投球数整合 | 全カウントの `pitches_total` 合計 ≒ 当該投手の `pitchEvents` 総数（交代・無効球除く） |
| 参照比較 | 1 投手を Yahoo 個人ページのカウント別球種と目視（完全一致は不要、±数% で許容） |

スクリプト案: `scripts/diagnose_pitcher_count_pitch_types.ts --npb <id> --year 2026`

### Phase 4 完了条件

- [x] `daily:npb-pipeline` 完走後、当日登板投手の JSON に `byCountPitchTypes` がある（`runDerivedAndRankings` が `phase:pitcher-poc1` を実行済み）
- [x] `reparse:empty-pitchrows-2026` 完走後、`phase:pitcher-poc1` + `phase25` を実行するよう拡張
- [x] `docs/data_operation_rules.md` に Phase 32 / カウント別球種を追記

**Phase 4 完了（2026-06-10）— 本計画（Phase 0〜4）完了。**

---

## 3. パイプライン上の位置づけ

```mermaid
flowchart LR
  A[Phase4 一球復元] --> B[canonical merge]
  B --> C[phase:pitcher-poc1]
  C --> D["splits.byCountPitchTypes"]
  D --> E[season-pitching API]
  E --> F[PlayerPagePitcherSeasonBody]
```

| 上流 | 役割 |
|------|------|
| Phase 10 / Phase 4 | `pitchEvents`（球種・resultJa） |
| Phase 16 | 打者カウント別成績（**別派生**。SSOT 共有は `pitchCountSim` のみ） |
| **Phase 32（本計画）** | 投手 `byCountPitchTypes` |
| Phase 25 | 球種別成績表（Whiff% 等）。横棒の fallback には初版使わない |

---

## 4. 実装順序（推奨）

| 順 | Phase | 成果物 |
|----|-------|--------|
| 1 | Phase 0 | 仕様合意 |
| 2 | Phase 1 | `countBeforePitchAtIndex` + poc1 集計 + JSON |
| 3 | Phase 2 | 型・API 確認 |
| 4 | Phase 3 | UI 横棒 12 行 |
| 5 | Phase 4 | reparse 拡張 + data_operation_rules 追記 |

---

## 5. Runbook（障害切り分け）

| 症状 | 確認 | 対処 |
|------|------|------|
| 横棒が一切出ない | API の `byCountPitchTypes` | `phase:pitcher-poc1` 再実行 |
| 特定カウントだけ空 | 当該投手の一球ログ | Phase10 / canonical の `pitchEvents` 欠損 |
| 割合が Yahoo と大きくズレ | `pitchCountSim` 分類 | `diagnose_pitcher_count_pitch_types.ts` で一球ログを追跡 |
| 巡目別はあるがカウント別が無い | JSON 生成日 | poc1 が Phase 32 実装前の古いビルド |

---

## 6. 将来拡張（本計画の外）

- Phase 32b: 対左右別カウント別球種（24 行またはタブ切替）
- 試合単位 API（`gameId` 指定スナップショット）
- 捕手スタメン時の「受けた球」カウント別（Phase 26 系の拡張）

---

## 改訂履歴

| 日付 | 内容 |
|------|------|
| 2026-06-10 | 初版作成（Phase 0〜4、Phase 32 としてカウント別球種・横棒 UI・パイプライン組込み） |
| 2026-06-10 | **Phase 0 完了**: SSOT コード化・伊藤大海で prototype 検証・参照投手指定 |
| 2026-06-10 | **Phase 1 完了**: poc1 に `byCountPitchTypes` 組込み・305 投手 JSON 再生成 |
| 2026-06-10 | **Phase 2/3 完了**: season-pitching 透過確認・`PitchTypeSplitStackedBarSection` UI 追加 |
| 2026-06-10 | **Phase 4 完了**: reparse に poc1/phase25 追加・`data_operation_rules.md` 追記 |
