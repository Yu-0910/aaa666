# 野手個人ページ「球団別」タブ — カウント別配球表示 実装計画書（Phase 別）

**Phase の数:** **5 段階（Phase 0〜4）**。データ一括生成の中核は **`phase33:build:batter-vs-team-count-pitch-types`** で、機能番号として **Phase 33** と呼ぶ。

## 文書の位置づけ

| 用途 | 内容 |
|------|------|
| **初回** | Phase 0〜4 の実装順と完了条件 |
| **継続運用** | canonical 更新後の再生成タイミング、確認手順 |
| **オンボーディング** | 打者視点の「受けた配球」データの流れ・UI 仕様の SSOT |

**改訂時は文末の改訂履歴を更新する。**

---

## 1. 背景と目的

### 1.1 やりたいこと

野手個人ページ（`/players/{playerId}`）の **「今季の成績」** 配下に、新サブタブ **「球団別」** を追加し、**対戦球団ごとにその打者へ投げられた球種構成（配球）** を **カウント別** に可視化する。

| 項目 | 内容 |
|------|------|
| 対象ページ | **野手のみ**（投手個人ページには追加しない） |
| 区分軸 | **12 球団**（対戦相手チーム）× **投手利き腕別（対左／対右）** × **B-S カウント 12 種** |
| 表示内容 | 各カウントにおける **球種別投球割合**（積み上げ横棒グラフ） |
| 初版年度 | `2026`（`DERIVED_SEASON_YEAR_DEFAULT` に追随） |

### 1.2 用語

| 用語 | 意味 |
|------|------|
| **球団別タブ** | 野手・今季サブタブ `seasonDetailTab === "vs_team_pitch"`（仮キー）。本計画で追加 |
| **配球（打者視点）** | その打者の打席で投げられた **一球ごとの球種** の構成比。投手ページの「球種一覧」と **視点が逆**（投げた球 ↔ 受けた球） |
| **Phase 33** | canonical の `pitchEvents` から **打者×対戦球団×投手利き腕×カウント** 別球種 MIX を生成する派生処理 |
| **カウントキー** | `"0-0"` … `"3-2"` 形式。SSOT は `lib/yahooGame/pitchCountSim.ts` の `ORDERED_PITCH_COUNT_KEYS` |
| **対左／対右** | **投手の利き腕**（L/R）。投手 PoC の `byCountPitchTypesVsL/VsR` と同換算 |
| **対戦球団** | 打席が行われた試合における **相手チーム**。Phase 13 `vs_team` と同一の球団解決 |

### 1.3 成功条件（実装完了の定義）

1. 一球ログがある野手について、**対戦した各球団**の見出し下に **12 カウント行の積み上げ横棒**が表示される（当該球団×利き腕×カウントの投球 0 は空バーまたは行省略）。
2. 各カウント内の `pct` 合計が **100% ± 丸め誤差**（当該バケットの総投球数に対する球種別割合）。
3. **対左／対右** を折りたたみパネルで切り替え可能（投手「球種情報」タブと同一 UX）。
4. **再生成**（`phase33:build:batter-vs-team-count-pitch-types`）と **日次一括**（`phase3:derived:2026` / `daily:npb-pipeline`）に組み込まれ、canonical 更新後に追従する。

### 1.4 スコープ外（初版）

- 投手個人ページへの同一タブ
- 通算タブ内への配球ブロック
- **巡目別** × 球団別の配球（初版は **カウント別のみ**）
- 球団別の **打撃成績表**（OPS・打率等）— 既に「基本成績 › チーム別の対戦成績」（Phase 13 `vs_team`）で提供済み
- 球団内 **投手個人別** の配球（「対戦成績」タブの個人対個人とは別軸）
- Whiff% / 被打率等の率指標（初版は **球種構成（投球割合）のみ**）
- 2026 年以外のシーズン（初版は `year=2026` 固定）

---

## 2. 現状整理

### 2.1 UI（関連実装済み・本機能は未実装）

| 項目 | 現状 |
|------|------|
| 野手・今季サブタブ | 基本成績 / 球種情報 / 状況別 / 対戦成績（＋ 捕手成績） |
| チーム別 **打撃** 成績 | `SeasonStatsPilot`「チーム別の対戦成績」— Phase 13 `vs_team`、**表のみ**（基本成績タブ内） |
| 状況別 › **巡目別** 打撃成績 | `SeasonStatsPilot` — `split_type: "pa_round"`、**表のみ**（OPS・打率等） |
| 状況別 › **カウント別** 打撃成績 | `SeasonStatsPilot` — `split_type: "pitch_count"`（Phase 16）、**表のみ** |
| 球種情報 › 球種別打撃 | `PitchTypePieChart`（ドーナツ）＋ コース 25 マス |
| 投手 › カウント別球種 | `PitchTypeSplitViewsSection` — **積み上げ横棒**（Phase 32 `byCountPitchTypes`） |
| 投手 › 対左右折りたたみ | 同上 `PitchTypeVsHandSplitBlock`（左＝対左打者、右＝対右打者） |
| 野手向け **球団×カウント×球種** | **派生 JSON・API・UI とも未実装** |

### 2.2 参考 UI（本計画のトレース元）

#### A. グラフ本体 — 投手「カウント別の球種一覧」

| 要素 | 参照ファイル |
|------|-------------|
| 積み上げ横棒 | `app/components/PitchTypeSplitStackedBarSection.tsx` |
| 12 カウント行 | `app/components/PitchTypeSplitViewsSection.tsx` → `CountPitchTypeChart` |
| 対左右トグル | 同上 → `PitchTypeSidePanelToggle` / `PitchTypeVsHandSplitBlock` |
| 球種パレット・凡例 | `buildPitchTypeColorMap`（`PitchTypeSplitStackedBarSection`） |

> **補足:** ユーザー要件の「巡目別の打撃成績を参考に」について、現状の巡目別打撃成績（`pa_round`）は **表形式** でグラフは無い。初版の **グラフ UI** は投手タブの **カウント別球種横棒**（Phase 32）を SSOT とし、**行ラベル幅（46px）・0〜100% グリッド・球種色** をそのまま流用する。球団ブロックの **見出し・色帯** は下記 B を参照。

#### B. 球団見出しブロック — 対戦成績タブ

| 要素 | 参照ファイル |
|------|-------------|
| 球団 `h2` + チームカラー | `PlayerPageMatchupBody.tsx` の `TEAM_COLORS` |
| 球団並び（固定 12） | `lib/playerMatchupTeamOrder.ts` → `PLAYER_MATCHUP_TEAM_ORDER` |
| 左ストライプ見出し | `SeasonStatsPilot` の `h2Section`（`borderLeft: 6px solid`） |

#### C. 既存「チーム別の対戦成績」との住み分け

| 既存（基本成績） | 本タブ（球団別） |
|-----------------|-----------------|
| 打撃 **結果**（OPS・打率・本塁打…） | 受けた **配球 MIX**（球種割合） |
| Phase 13・試合×打者で 1 加算 | 一球ログ・`pitchEvents` ベース |
| 表 | 積み上げ横棒グラフ |

### 2.3 データ（集計可能な入力）

| 入力 | 役割 |
|------|------|
| `_data/scraped_games/canonical/*.json` | 打席 `plateAppearances`、`pitchEvents`、scoreboard |
| `lib/yahooGame/pitchCountSim.ts` | 一球直前カウント（`countBeforePitchAtIndex`）— Phase 32 と同一 |
| `lib/yahooGame/batterHandFromCanonical.ts` | 打者利き手（本機能では **投手利き腕** 判定に使用） |
| `lib/yahooGame/yahooPitcherIdForVsHandFromPa.ts` | 打席の投手 ID 解決 |
| Phase 13 と同系 | 試合の **対戦球団** 解決（`injectTeamsFromTextPbpIfMissing` 前提） |
| `lib/standings/teamCodes.ts` | 球団コード ↔ 表示名 |

### 2.4 ギャップ

- 打者視点の **球団×カウント×球種** 派生 JSON が無い。
- 野手今季サブタブに **「球団別」** が無い（`FielderSeasonDetailTab` にキー未追加）。
- `PitchTypeSplitViewsSection` は投手 payload 前提。打者×球団用の **汎用ラッパー** または専用 Body が必要。
- 日次パイプラインに Phase 33 が未組込み。

---

## 3. 目標仕様

### 3.1 タブ配置

親タブ「今季の成績／通算成績」は変更しない。**野手のみ**、今季サブタブ列に **「球団別」** を追加する。

#### 野手（`kikuchiSeasonDetailTab`）

```text
通常（5+1）:
  1. 基本成績   (basic)
  2. 球種情報   (pitch)
  3. 状況別     (situation)
  4. 対戦成績   (matchup)
  5. 球団別     (vs_team_pitch)   ← 本計画で追加
  6. 捕手成績   (catcher)         ← 従来 5 つ目だった場合は 6 つ目へ後退

名簿捕手なし（5 タブ）:
  1〜5. 上記のうち catcher 除く
```

#### 型・定義の変更箇所

| ファイル | 変更 |
|---------|------|
| `lib/playerMatchupSeasonTab.ts` | `FielderSeasonDetailTab` に `"vs_team_pitch"` 追加、`buildFielderSeasonSubTabs` に `{ key: "vs_team_pitch", label: "球団別" }` |
| `app/players/[playerId]/PlayerPageClient.tsx` | サブタブ切替・描画分岐 |
| 新規 | `app/players/[playerId]/PlayerPageFielderVsTeamPitchBody.tsx` |

**表示条件:** `showFielderSeasonPilotUi === true` かつ `statsTab === "season"`。

### 3.2 1 球団ブロックの UI 構成

各球団見出しの下に、**1 セクション** を配置する。

```text
┌─ [球団名 h2] ──────────────────────────────── [左|右] ─┐
│  カウント別の配球                                       │
│  ┌──────┬──────────────────────────────────────────┐   │
│  │ 0-0  │ ████ ストレート ███ スライダー …         │   │
│  │ 1-0  │ …                                        │   │
│  │ …    │ （12 行: ORDERED_PITCH_COUNT_KEYS 順）    │   │
│  │ 3-2  │ …                                        │   │
│  └──────┴──────────────────────────────────────────┘   │
│  0%   25%   50%   75%   100%                          │
│  [球種凡例]                                             │
└────────────────────────────────────────────────────────┘
```

| 項目 | 仕様 |
|------|------|
| セクション見出し | `カウント別の配球`（球団 `h2` の直下、小見出しまたは `PitchTypeSectionHeading` 相当） |
| ベース表示 | **対左右合算**（VsL + VsR の投球を同一グラフに集約） |
| 対左右パネル | 投手 UI と同様。**左**＝対左投手（LHP から受けた球）、**右**＝対右投手（RHP から受けた球） |
| 行ラベル | `0-0` 形式、左 46px、改行なし |
| 棒グラフ | 高さ `h-7`、`PitchTypeSplitStackedBarSection` と同一 |
| 凡例 | 当該球団ブロック内の全カウントを通した球種出現順（投球数合計降順） |
| データ無し | 当該球団で `pitches_total === 0` → **球団ブロック自体を非表示**（ページが空なら `DerivedPipelineEmptyNotice`） |
| 最小表示閾値（初版） | 球団×合算で **総投球 10 球未満** は非表示（ノイズ抑制。Phase 0 で調整可） |

### 3.3 球団の並び順

初版は **固定 12 球団順**（`PLAYER_MATCHUP_TEAM_ORDER` と同一）。対戦投球数降順ソートは **採用しない**（基本成績のチーム別表と並びを揃える）。

### 3.4 集計定義（Phase 0 SSOT）

#### 3.4-A. 一球の帰属ルール

```
各 pitchEvent e（打席内インデックス i）について:
  1. 打者 = pa.yahooBatterId（対象打者のファイルのみ出力）
  2. 対戦球団 = 当該試合の scoreboard から打者所属の反対チーム（Phase 13 getPaContext と同一関数群を共用）
  3. カウント = countBeforePitchAtIndex(sortedPitchEvents, i)  // Phase 32 と同一
  4. 球種 = (e.pitchTypeJa ?? "").trim() || "不明"
  5. 投手利き腕 = resolvePitcherThrowHandRL(yahooPitcherId) // 投手 PoC vsHand と同換算
  6. isValidPitchCountKey(count) でなければ除外
```

**四球寄せ（Phase 16 の `adjustPitchCountKeyForWalk`）は使わない。** 理由は Phase 32 計画書 §0-D と同様（球種 MIX の歪み防止）。

#### 3.4-B. バケットキー

```
batterYahooId × vsTeamCode × vsPitcherHand("L"|"R"|"unknown") × countKey × pitchType
```

- `vsTeamCode`: `F` / `E` / `L` / …（`teamCodes.ts` の 1 文字〜2 文字コード）
- `unknown` 投手利き腕は **合算バケットに含める**（VsL/VsR 派生には入れない）

#### 3.4-C. 出力 JSON スキーマ（1 打者 1 ファイル）

**出力先:**

```
_data/derived/player_batter_vs_team_count_pitch_types/{year}/yahoo_{yahooBatterId}.json
```

```typescript
/** Phase 33 */
type BatterVsTeamCountPitchTypesFile = {
  schemaVersion: "phase33-batter-vs-team-count-pitch-types-v1"
  seasonYear: string
  yahooBatterId: string
  playerName?: string
  generatedAt: string
  source: {
    canonicalGames: string[]
    note?: string
  }
  /** 球団コード順は JSON 内任意。UI は PLAYER_MATCHUP_TEAM_ORDER でソート */
  teams: Array<{
    teamCode: string
    label: string
    pitches_total: number
    /** 対左右合算 */
    byCountPitchTypes: PitchTypesSplitRow[]
    byCountPitchTypesVsL?: PitchTypesSplitRow[]
    byCountPitchTypesVsR?: PitchTypesSplitRow[]
  }>
}

/** PitcherSeasonPocPitchTypesSplitRow と同型（再利用） */
type PitchTypesSplitRow = {
  key: string       // "0-0" … "3-2"
  label: string
  pitches_total: number
  rows: Array<{ pitch_type: string; pitches: number; pct: number }>
}
```

- カウント出力順: `ORDERED_PITCH_COUNT_KEYS`
- `pitches_total === 0` のカウント行は **省略**
- 当該球団で投球 0 の球団エントリは **teams 配列から省略**

---

## Phase 0 — 仕様固定（実装前）

**目的:** 集計定義・JSON スキーマ・UI 仕様をコード化前に固定する。

### 0-A. 対戦球団解決の SSOT 確定

- Phase 13 `scripts/phase13_build_context_splits_from_canonical.ts` の `getPaContext` / `vsTeamValue` ロジックを **関数抽出** し、Phase 33 から import する（コピペ禁止）。
- 球団コード正規化は `lib/standings/teamCodes.ts` 経由。

### 0-B. 参照選手の目視比較

| 項目 | 候補 |
|------|------|
| 選手 | **近藤 健介**（yahoo=`1100097`）— 2026 canonical **pitchEvents 最多（1,135 球）** |
| 副候補 | 近本 光司（名簿 `71075138`）— canonical に yahooBatterId 未登場のため Phase 0 では不採用 |
| 比較方法 | Yahoo 個人ページの球種別・状況別と、特定球団×カウントの傾向が **定性一致** すること |
| 検証 CLI | `scripts/diagnose_batter_vs_team_count_pitch_types.ts --yahoo {id} --year 2026 --team Hs` |

### 0-C. UI モック確認

- [x] グラフ UI は Phase 32 `PitchTypeSplitStackedBarSection` / `CountPitchTypeChart` を流用（Phase 3 で組込み）
- [x] 6 タブスライダーは `buildFielderSeasonSubTabs` 拡張で対応（`seasonSubTabSliderWidthPct` はタブ数から自動計算）

### Phase 0 完了条件

- [x] §3.4 集計定義をコード SSOT 化（`batterVsTeamCountPitchTypesAgg.ts`）
- [x] 参照選手 1 名を指定（近藤 健介 yahoo=1100097）
- [x] 最小投球閾値 **10 球**（`BATTER_VS_TEAM_MIN_PITCHES_DISPLAY`）
- [x] 既存「チーム別の対戦成績」との住み分け（§2.2-C）を計画書に明記

### 0-D. Phase 0 実行結果（2026-06-14）

#### コード SSOT（成果物）

| 成果物 | パス |
|--------|------|
| 対戦球団解決 | `lib/yahooGame/batterGameContextFromCanonical.ts` |
| 型・定数 | `lib/batterVsTeamCountPitchTypesTypes.ts` |
| 集計 prototype | `lib/yahooGame/batterVsTeamCountPitchTypesAgg.ts` |
| 単体テスト | `lib/yahooGame/batterGameContextFromCanonical.test.ts`（3 件 pass） |
| 検証 CLI | `scripts/diagnose_batter_vs_team_count_pitch_types.ts` |
| Phase 13 リファクタ | `scripts/phase13_build_context_splits_from_canonical.ts` → 共用 lib import |
| validate リファクタ | `scripts/validate_phase13_context_vs_phase11.ts` → 共用 lib import |

#### 参照打者（近藤 健介・2026・389 試合）

| 項目 | 値 |
|------|-----|
| Yahoo 打者 ID | `1100097` |
| シーズン pitchEvents 合計 | **1,135 球**（canonical 野手最多） |
| 対巨人（G）サンプル | 71 球・12 カウントすべて非ゼロ |

対巨人 `0-0` 例: ストレート 42.9%, カットボール 35.7%, チェンジアップ 7.1%（vsR 65 球 / vsL 6 球）

検証コマンド:

```bash
npx tsx scripts/diagnose_batter_vs_team_count_pitch_types.ts --scan
npx tsx scripts/diagnose_batter_vs_team_count_pitch_types.ts --yahoo 1100097 --year 2026 --team G
npx vitest run lib/yahooGame/batterGameContextFromCanonical.test.ts
```

**Phase 0 完了 → Phase 1（phase33 ビルドスクリプト）に進行可。**

---

## Phase 1 — データ層（Phase 33 派生）

**目的:** canonical 全試合から **打者×球団×カウント別球種** JSON を一括生成する。

### 1-A. 集計ライブラリ

**新規:** `lib/yahooGame/batterVsTeamCountPitchTypesAgg.ts`

| 関数 | 役割 |
|------|------|
| `emptyBatterVsTeamCountPitchTypesAcc()` | 打者→球団→利き腕→カウント→球種 の nested Map |
| `accumulateBatterVsTeamCountPitchTypesFromDocs(docs, targetBatterYahooId, acc)` | canonical 走査 |
| `serializeBatterVsTeamCountPitchTypesAcc(acc)` | `PitchTypesSplitRow[]` へ変換 |

**流用:**

- `countBeforePitchAtIndex` / `ORDERED_PITCH_COUNT_KEYS`（`pitchCountSim.ts`）
- `sortPitchEventsByPitchIndex`
- 投手利き腕: `pitcherThrowHandRLFromYahooPitcherIdWithMentioned`（phase_pitcher_poc1 と同系）
- 球団解決: Phase 0 で抽出した共用関数

### 1-B. ビルドスクリプト

**新規:** `scripts/phase33_build_batter_vs_team_count_pitch_types_from_canonical.ts`

```bash
npx tsx scripts/phase33_build_batter_vs_team_count_pitch_types_from_canonical.ts --year 2026
npm run phase33:build:batter-vs-team-count-pitch-types
```

処理概要:

1. `loadCanonicalGamesMergedForDerivedPipeline` で全試合読込
2. 試合ごとに `plateAppearances` を走査
3. `yahooBatterId` ごとに acc を更新（全 roster 打者を対象。Phase 14 と同様に **登場打者全員**）
4. acc を JSON 化して `_data/derived/player_batter_vs_team_count_pitch_types/{year}/yahoo_*.json` に書出
5. シーズン対象外ファイルの `unlinkSync`（既存 phase スクリプトパターン）

### 1-C. 診断 CLI

**新規:** `scripts/diagnose_batter_vs_team_count_pitch_types.ts`

- 指定打者・球団・カウントの球種内訳を stdout
- `--json` で API 応答プレビュー

### Phase 1 完了条件

- [x] 参照選手について 12 球団×12 カウントのうち、データがあるセルすべて `pct` 合計 ≈ 100%
- [x] 同一打者の Phase 14 通算球種投球数 ≥ 各球団合計（球団分割の総和が通算を超えない）
- [x] `npm run phase33:build:batter-vs-team-count-pitch-types` が 2026 canonical で完走

### 1-D. Phase 1 実行結果（2026-06-14）

| 項目 | 値 |
|------|-----|
| 出力先 | `_data/derived/player_batter_vs_team_count_pitch_types/2026/` |
| 生成ファイル数 | **407**（pitchEvents あり打者） |
| 検証 | `validate:phase34-batter-vs-team-pitch-vs-phase14:fail` **0 mismatches**（Phase14 再生成後） |

---

## Phase 2 — API 層

**目的:** 個人ページから Phase 33 JSON を読む REST API を提供する。

### 2-A. ルート

**新規:** `app/api/players/[playerId]/batter-vs-team-count-pitch-types/route.ts`

```
GET /api/players/{playerId}/batter-vs-team-count-pitch-types?year=2026
```

| 項目 | 仕様 |
|------|------|
| playerId 解決 | `getYahooIdForPilotAsync` → Yahoo batter ID（`season-stats` / `pitch-details` と同一） |
| 読込 | `loadDerivedJson("player_batter_vs_team_count_pitch_types", year, yahoo_{id}.json)` |
| 404 | ファイル無し → `{ teams: [], hasData: false }`（500 にしない） |
| 応答型 | `BatterVsTeamCountPitchTypesFile` + `hasData: boolean` |

### 2-B. ローダー

**新規:** `lib/batterVsTeamCountPitchTypesLoad.ts`（derived パス解決・R2/ローカル分岐は既存 `playerMatchupLoad.ts` パターン）

### 2-C. クライアント hook

**新規:** `hooks/useBatterVsTeamCountPitchTypesDerived.ts`

- `loading` / `settled` / `payload` — `usePlayerMatchupDerived` と同型

### Phase 2 完了条件

- [x] 参照選手 ID で API が 200 + `hasData: true`
- [x] 存在しない ID で空 payload（クラッシュなし）
- [x] `getYahooIdForPilotAsync` 経由（`displayName` フォールバックなし）

### 2-D. Phase 2 実行結果（2026-06-14）

| 成果物 | パス |
|--------|------|
| API ルート | `app/api/players/[playerId]/batter-vs-team-count-pitch-types/route.ts` |
| 取得ロジック | `lib/batterVsTeamCountPitchTypesApi.ts` |
| ローダー | `lib/batterVsTeamCountPitchTypesLoad.ts` |
| hook | `hooks/useBatterVsTeamCountPitchTypesDerived.ts` |

検証（ローダー直接）:

```bash
# 近藤 健介 yahoo=1100097 → teams=11, pitches_total=1135
npx tsx -e "import { fetchBatterVsTeamCountPitchTypesPayload } from './lib/batterVsTeamCountPitchTypesApi.ts'; (async()=>{ console.log(await fetchBatterVsTeamCountPitchTypesPayload('2026','1100097')); })();"
```

HTTP: `GET /api/players/1100097/batter-vs-team-count-pitch-types?year=2026`

---

## Phase 3 — UI 層（球団別タブ）

**目的:** 野手個人ページに「球団別」サブタブと配球グラフを実装する。

### 3-A. Body コンポーネント

**新規:** `app/players/[playerId]/PlayerPageFielderVsTeamPitchBody.tsx`

| 責務 | 内容 |
|------|------|
| 球団ループ | `PLAYER_MATCHUP_TEAM_ORDER` 順、`payload.teams` に存在かつ閾値以上のみ描画 |
| グラフ | `CountPitchTypeChart`（`PitchTypeSplitViewsSection.tsx` から export 済みなら import、未 export なら共通化リファクタ） |
| 対左右 | `PitchTypeVsHandSplitBlock` を **球団ごとに 1 インスタンス**（state は球団コード別 Map または各ブロック独立） |
| 空状態 | `DerivedPipelineEmptyNotice` + `SectionLoadingSpinner` |
| チーム色 | `PlayerPageMatchupBody.TEAM_COLORS` を共用 |

### 3-B. PlayerPageClient 組込

```typescript
// 疑似コード
kikuchiSeasonDetailTab === "vs_team_pitch" && showFielderSeasonPilotUi
  ? <PlayerPageFielderVsTeamPitchBody ... />
  : ...
```

- サブタブスライダー: `buildFielderSeasonSubTabs` の返却列変更に追随
- URL クエリ: 初版は `?seasonTab=vs_team_pitch` 等は **任意**（後続可）

### 3-C. コンポーネント共通化（必要最小限）

`CountPitchTypeChart` / `PitchTypeVsHandSplitBlock` が `PitchTypeSplitViewsSection.tsx` 内に閉じている場合:

- **Option A（推奨）:** 既存 export をそのまま import（投手依存 props を除去済みのため低コスト）
- **Option B:** `PitchTypeCountSplitChart.tsx` に切り出し — 投手・野手双方から import

### Phase 3 完了条件

- [x] 参照選手ページで「球団別」タブが表示され、2 球団以上の横棒が描画される
- [x] 対左右トグルでグラフが切り替わる
- [x] 捕手タブあり選手で 6 サブタブが崩れない（`seasonSubTabSliderWidthPct` 自動計算）
- [x] 投手個人ページに「球団別」が **出ない**

### 3-D. Phase 3 実行結果（2026-06-14）

| 成果物 | パス |
|--------|------|
| Body | `app/players/[playerId]/PlayerPageFielderVsTeamPitchBody.tsx` |
| タブ定義 | `lib/playerMatchupSeasonTab.ts`（`vs_team_pitch` / 「球団別」） |
| 組込 | `app/players/[playerId]/PlayerPageClient.tsx` |
| グラフ | `CountPitchTypeChart` / `PitchTypeVsHandSplitBlock` を export 再利用 |

---

## Phase 4 — パイプライン・検証・ドキュメント

**目的:** 日次運用に載せ、回帰を防ぐ。

### 4-A. npm / 一括パイプライン

`package.json` 追加:

```json
"phase33:build:batter-vs-team-count-pitch-types": "tsx scripts/phase33_build_batter_vs_team_count_pitch_types_from_canonical.ts --year 2026"
```

`phase3:derived:2026` に **Phase 30 の後**（matchup 生成後）で追加:

```
... && npm run phase30:build:player-matchup && npm run phase33:build:batter-vs-team-count-pitch-types && npm run build:yahoo-npb-full-index
```

`run_daily_npb_pipeline.mjs` にも同様に組込み。

### 4-B. 検証（Phase 34）

**新規:** `scripts/validate_phase34_batter_vs_team_pitch_types_vs_phase14.ts`

| 検査 | 内容 |
|------|------|
| 通算整合 | 全球団の `pitches_total` 合計 ≤ Phase 14 当該打者の `pitchTypeStats[].pitches` 合計 |
| カウント整合 | 各打者について、全球団×全カウントの投球合計 = 全球団合算の投球合計 |
| pct 検査 | 各 `PitchTypesSplitRow` で `sum(rows.pitches) === pitches_total` |

```bash
npm run validate:phase34-batter-vs-team-pitch-vs-phase14:fail
```

### 4-C. ドキュメント更新

| ファイル | 追記 |
|---------|------|
| `docs/data_operation_rules.md` | Phase 33 派生パス・再生成タイミング |
| `docs/DATA_PATHS.md` | `_data/derived/player_batter_vs_team_count_pitch_types/` |

### Phase 4 完了条件

- [x] `npm run phase3:derived:2026` 再実行後、球団別タブが更新される（Phase33 組込み済み）
- [x] `validate:phase34-batter-vs-team-pitch-vs-phase14:fail` が緑
- [x] `docs/data_operation_rules.md` 更新済み

---

## 5. ファイル一覧（予定）

| 種別 | パス |
|------|------|
| 新規 | `lib/yahooGame/batterVsTeamCountPitchTypesAgg.ts` |
| 新規 | `lib/batterVsTeamCountPitchTypesLoad.ts` |
| 新規 | `lib/batterVsTeamCountPitchTypesTypes.ts` |
| 新規 | `scripts/phase33_build_batter_vs_team_count_pitch_types_from_canonical.ts` |
| 新規 | `scripts/diagnose_batter_vs_team_count_pitch_types.ts` |
| 新規 | `scripts/validate_phase34_batter_vs_team_pitch_types_vs_phase14.ts` |
| 新規 | `app/api/players/[playerId]/batter-vs-team-count-pitch-types/route.ts` |
| 新規 | `hooks/useBatterVsTeamCountPitchTypesDerived.ts` |
| 新規 | `app/players/[playerId]/PlayerPageFielderVsTeamPitchBody.tsx` |
| 変更 | `lib/playerMatchupSeasonTab.ts` |
| 変更 | `app/players/[playerId]/PlayerPageClient.tsx` |
| 変更 | `package.json` |
| 変更 | `docs/data_operation_rules.md` |
| 変更 | `docs/DATA_PATHS.md` |
| 共有（変更なし想定） | `app/components/PitchTypeSplitStackedBarSection.tsx` |
| 共有（export 確認） | `app/components/PitchTypeSplitViewsSection.tsx` |

---

## 6. リスクと後続 Phase

| リスク | 対策 |
|--------|------|
| scoreboard 欠損で `vs_team` 解決失敗 | Phase 13 と同じ `injectTeamsFromTextPbpIfMissing` 前提。validate で unknown 球団率をログ |
| 投手利き腕 unknown 率が高い | VsL/VsR に入れず合算のみ表示。audit ルートで監視 |
| ページ縦長（12 球団 × グラフ） | 初版は全球団縦並び。後続 **Phase 33b** でアコーディオン折りたたみ検討 |
| phase 番号衝突 | 本計画 **Phase 33（ビルド）/ Phase 34（検証）** を新規採番 |

### 後続候補（本計画スコープ外）

| Phase | 内容 |
|-------|------|
| **Phase 33b** | 球団ブロックのアコーディオン化・対戦投球数降順ソート |
| **Phase 35** | 球団別 **巡目別** 配球（`byPaRoundPitchTypes` 相当） |
| **Phase 36** | 球団別配球 × 打撃結果オーバーレイ（カウント別 OPS ツールチップ等） |

---

## 7. 受け入れチェックリスト（リリース前）

- [x] `npm run phase33:build:batter-vs-team-count-pitch-types` が 2026 で完走
- [x] `npm run validate:phase34-batter-vs-team-pitch-vs-phase14:fail` が成功
- [x] 野手個人ページ「今季 › 球団別」で 2 球団以上のカウント別横棒が表示される
- [x] 対左右トグルが機能する（UI 実装済み・ブラウザ目視推奨）
- [x] データ未生成選手で EmptyNotice が表示されクラッシュしない
- [x] 投手個人ページに球団別タブが **表示されない**
- [x] `npm run phase3:derived:2026` に Phase 33 が含まれる

---

## 改訂履歴

| 日付 | 内容 |
|------|------|
| 2026-06-14 | 初版作成（Phase 0〜4、Phase 33/34 として野手球団別カウント配球タブ・横棒 UI・パイプライン組込み） |
| 2026-06-14 | **Phase 0 完了**: 球団解決 SSOT・集計 prototype・diagnose CLI・参照選手（近藤 1100097）確定 |
| 2026-06-14 | **Phase 1 + Phase 4（パイプライン）完了**: phase33 ビルド 407 ファイル・日次/一括パイプライン組込み・phase34 検証 |
| 2026-06-14 | **Phase 2 完了**: batter-vs-team-count-pitch-types API + hook |
| 2026-06-14 | **Phase 3 完了**: 野手個人ページ「球団別」タブ UI |
