# トップ「予想投手」タブ — Phase 0 要件確定書

**状態**: 未着手（2026-06-14 起草）  
**親計画**: [`plan_top_probables_tab_phases.md`](plan_top_probables_tab_phases.md)

本書は v1 実装前にブレないよう固定した決定事項である。Phase 1 以降は本書に従う。

---

## 1. スコープ（v1 でやる／やらない）

| やる | やらない（別 Issue） |
|------|----------------------|
| トップ **「予想投手」** タブ（メインタブ id=2） | 試合詳細ページへの先発表示 |
| **直近の対戦カード**ごとに **予想先発 6 名**（三連戦想定） | 二連戦・四連戦の自動ラベル（v1 は 3 試合カードのみ） |
| 予想ソース: **Sporting News 日本版** 各球団ローテ記事 | 公式発表・スポナビ速報のリアルタイム上書き（v2 候補） |
| 各予想投手の下に **相手球団 OPS 上位 3 打者** | 打者の球種別・左右別の詳細 |
| 対戦成績は **Phase 30 派生**（個人ページ対戦成績タブと同一） | canonical からの再集計 |
| 2026 年度先行 | 2025 以前 |
| 一括パイプライン・`rankings:rebuild` / `display:refresh:2026` への組込 | 独立 URL ページ |

---

## 2. 用語

| 用語 | 意味 |
|------|------|
| **対戦カード** | 同一 `(teamA, teamB)` ペアが **連続 3 日**（暦日）に組まれた試合系列。ホーム／ビジターは日ごとに入れ替わり得る |
| **直近の対戦カード** | JST **今日以降**に未消化の試合が 1 試合以上残るカードのうち、**開始日（系列の初日）が最も早いもの**を最大 **6 件**（= 通常 1 日 6 試合分のカード上限） |
| **予想投手** | Sporting News 記事のローテ表に載る投手名（未記載日は `null`） |
| **相手 OPS 上位 3 打者** | 当該予想投手の `player_matchup_pitching` において、**相手球団**所属の打者行を OPS 降順で上位 3 名（個人ページ対戦成績タブと同じ `compareMatchupOpponentsByOpsDesc`） |
| **表示 SSOT** | `public/data/top-probables/{year}/current.json` → R2 `data/top-probables/{year}/current.json` |

---

## 3. 予想投手のデータソース（Sporting News）

### 3.1 参照記事

各球団ごとに **ローテーション予想記事** 1 本を正とする。記事 URL は `_data/config/sportingnews_rotation_urls_2026.json`（新設）で管理し、HTML 構造変更時は設定だけ差し替え可能にする。

**例（阪神）**: [阪神タイガースの先発ローテーション予想｜プロ野球2026 - スポーティングニュース](https://www.sportingnews.com/jp/npb/news/tigers-rotation/71e224e19cb07f9f52646ee5)

12 球団（記事内リンク表記）:

| 表示名 | teamCode（内部） |
|--------|------------------|
| 巨人 | G |
| 阪神 | T |
| DeNA / 横浜 | DB |
| 広島 | C |
| ヤクルト | S |
| 中日 | D |
| ソフトバンク | H |
| 日本ハム | F |
| ロッテ | M |
| 楽天 | E |
| オリックス | Bs |
| 西武 | L |

### 3.2 パース対象

記事内の **日付 × 投手名 × 対戦相手（球団短縮名）** の表（HTML `<table>`）を best-effort で抽出する。

| フィールド | 例 |
|------------|-----|
| `dateJst` | `2026-06-14` |
| `pitcherNameJa` | `西勇輝` |
| `opponentTeamShort` | `オリックス` |
| `sourceUrl` | 記事 URL |
| `fetchedAt` | ISO 8601 |

- セルが空の行は **`pitcherNameJa: null`** として保持（UI は「未定」表示）
- 表記ゆれ（`髙`/`高`、`DeNA`/`横浜`）は `lib/standings/teamCodes.ts` 経由で正規化

### 3.3 取得頻度

| タイミング | 理由 |
|------------|------|
| **日次一括パイプラインの fetch ブロック**（Phase 35） | ローテ記事は試合日の前日〜当日に更新されやすい |
| **`probables:rebuild` 実行時** | 手動再生成でも最新 SN を取りに行く |

スロットル: 球団間 **400ms** 以上（Phase 0 日程取得と同程度）。失敗時は **前回スナップショットを維持**し `pipeline_bulk.log` に記録。

---

## 4. 対戦カードの決定（スケジュール）

### 4.1 入力

| 優先 | ソース | 用途 |
|------|--------|------|
| 1 | `_data/sportsnavi_schedule_snapshots/by_date/*.json` + **新規: 各日の home/away 球団** | 未来試合のカード検出 |
| 2 | `_data/scraped_games/canonical/{gameId}.json` の `game.meta.ogTitle` / scoreboard | 試合済み・当日分の球団名フォールバック |

**Phase 0 改定（本計画の Phase 2）**: 日程 HTML パース時に `homeTeamShort` / `awayTeamShort` を `by_date` JSON に追加する（`schemaVersion: sportsnavi-schedule-day-v3`）。

### 4.2 系列検出アルゴリズム

1. 対象期間: **JST 今日 − 1 日** 〜 **今日 + 14 日**（三連戦の取りこぼし防止）
2. 各日の試合を `(teamA, teamB)` に正規化（辞書順でペアキー `cardKey`）
3. **同一 `cardKey` が連続 3 暦日** に現れたら **三連戦カード** と判定
4. 「直近」フィルタ: 系列内に **今日以降** かつ **未終了**（canonical 未生成 or 先発未確定）の試合が 1 つ以上
5. 表示候補を **系列開始日昇順** に並べ、最大 **6 カード**

交流戦・二軍戦は v1 では **リーグ戦・交流戦の 1 軍公式戦**のみ（Phase 0 の `league` / `inter` URL 両方から得た gameId を対象）。

### 4.3 取得タイミングの変更（運用）

現状の日次 Phase 0 は **`D-2 .. D+2`** の 5 日巡回。三連戦検出には **未来 10 日程度** が必要なため、次を追加する。

| コマンド | 巡回範囲 | 実行位置 |
|----------|----------|----------|
| 既存 Phase 0 | `from`〜`to`（日次は D-2..D+2） | fetch ブロック |
| **新規 `phase0:fetch:schedule-ahead`** | **D .. D+14**（`--merge`） | fetch ブロック末尾（軽量・HTML のみ） |

`--merge` により `season_YYYY.json` は累積維持。狭い `--from/--to` でも gameId 一覧は消えない（既存運用と同じ）。

---

## 5. 予想投手 × カードの突合

各 **試合枠**（カード内の 1 日 1 試合）について:

1. `dateJst` + **先発側 teamCode**（ホーム/ビジターはスケジュール行から）で SN ローテ行を検索
2. SN に該当行が無い → `probablePitcher: null`
3. SN の `opponentTeamShort` がカードの相手球団と不一致 → **`warnings[]` に記録**しつつ SN 値を優先（記事側の組み合わせを信頼）
4. **試合済み**（canonical に先発投手 ID あり）の場合: v1 では **SN 予想を表示し続ける**（実先発との差異は小さく注記のみ。v2 で実績上書き可）

投手名 → NPB ID は **`_data/npb_roster_2026.csv`** の名前照合（既存 `findRosterPlayerByPublicId` /  fuzzy 日本語名マッチ）で解決。解決不能は **`pitcherNpbId: null`** とし OPS ブロックは非表示。

---

## 6. 相手 OPS 上位 3 打者

### 6.1 データの正

```
_data/derived/player_matchup_pitching/{year}/npb_{pitcherNpbId}.json
```

Phase 30 出力。再集計禁止。

### 6.2 抽出ルール

1. `teams[]` から **`teamCode === 相手球団`** のブロックを取得
2. `opponents[]` を `compareMatchupOpponentsByOpsDesc` でソート
3. **`ab >= 1`** の行に限り **上位 3 名**
4. 3 名未満の場合は **ある分だけ** 表示
5. 投手 ID 未解決・派生 JSON なし → **打者ブロック省略**（投手名のみ表示）

表示列（v1）: **打者名 | OPS | 打率**（個人ページ対戦成績の先頭 3 列に相当）。打者名は `/players/{publicId}` へリンク（`opponentPublicId` がある場合）。

---

## 7. 表示 JSON スキーマ（案）

**パス**: `public/data/top-probables/{year}/current.json`

```ts
type TopProbablesSnapshot = {
  schemaVersion: "top-probables-v1"
  seasonYear: string
  generatedAt: string
  asOfDateJst: string          // ビルド時 JST 暦日
  source: {
    sportingNewsFetchedAt: string | null
    scheduleIndexBuiltAt: string | null
    matchupDerivedPhase: "phase30"
  }
  cards: Array<{
    cardKey: string              // "Bs-T" 等
    teamCodes: [string, string]
    teamNames: [string, string]
    seriesStart: string          // YYYY-MM-DD
    seriesEnd: string
    games: Array<{
      dateJst: string
      gameId: string | null
      homeTeamCode: string
      awayTeamCode: string
      homeProbable: ProbablePitcherSlot | null
      awayProbable: ProbablePitcherSlot | null
    }>
  }>
  warnings: string[]
}

type ProbablePitcherSlot = {
  teamCode: string
  pitcherNameJa: string | null
  pitcherNpbId: string | null
  pitcherPublicId: string | null
  source: "sportingnews"
  topOpponentBatters: Array<{
    opponentName: string
    opponentPublicId: string | null
    ops: string | null
    avg: string | null
    ab: number
  }>  // 最大 3
}
```

**カード内の 6 人**: 三連戦 × 2 球団 = **各試合日の home/away 予想先発** を合計すると最大 6 スロット（1 日 1 試合 × 2 投手 × 3 日）。

---

## 8. UI 要件（v1）

| 項目 | 決定 |
|------|------|
| 配置 | `TopPageClient` メインタブ id=2（現 placeholder 置換） |
| 年度 | **2026 のみ実データ**。他年度は「2026 シーズンのみ対応」 |
| レイアウト | **カード単位**（2 球団名見出し + 3 試合分の行）。モバイルは縦積み |
| 1 試合行 | 日付 / ビジター先発 / @ / ホーム先発。各先発の下に OPS 上位 3 打者（小さめ表） |
| 未定 | 投手名 `null` → 「未定」。打者 0 件 → 行省略 |
| 色 | `teamColors`（`topPageConstants.ts`）の球団帯 |
| 出典 | フッターに「予想: Sporting News」+ 更新日時 |

---

## 9. パイプライン組込（確定方針）

### 9.1 新規 npm（案）

| npm | 実体 |
|-----|------|
| `phase35:fetch:sportingnews-rotation` | SN 12 球団 HTML 取得 → `_data/external/sportingnews_rotation/{year}/` |
| `phase36:build:top-probables` | カード検出 + SN 突合 + Phase 30 参照 → `public/data/top-probables/` |
| `probables:rebuild:2026` | `phase35` → `phase36`（手動再生成用） |

### 9.2 既存スクリプトへの追加

| スクリプト | 追加内容 |
|------------|----------|
| `run_daily_npb_pipeline.mjs` fetch ブロック | Phase 0 後: `phase0:fetch:schedule-ahead` + `phase35:fetch:sportingnews-rotation` |
| `run_daily_npb_pipeline.mjs` 派生ブロック | Phase 30 **後**・Phase 12 **前**: `phase36:build:top-probables` |
| `rankings:rebuild` | 末尾（`top-weekly-leaders` の後）: `phase36:build:top-probables` ※ SN は `_data/external` の最新を使用。必要なら `probables:rebuild:2026` を呼ぶ |
| `display:build:2026` / `display:refresh:2026` | `phase36` を含める |
| `scripts/display_r2_upload.mjs` | `public/data/top-probables` → `data/top-probables` |

### 9.3 本番 push 段階

一括取得スクリプトの新案には、生成と publish だけでなく **予想投手タブを本番へ push する段階** まで含める。

1. `phase36:build:top-probables` で `public/data/top-probables/{year}/current.json` を更新
2. `display:build:2026` / `display:refresh:2026` と R2 upload で本番配信データを更新
3. 予想投手タブの反映差分を **本番ブランチへ push** して公開完了とする

この段階を含めることで、「一括取得は済んだが予想投手タブだけ本番未反映」の状態を運用上の未完了として扱う。

**注意**: Phase 36 は Phase 30（対戦成績）に依存するが、canonical 派生全体には依存しない。SN 取得は **fetch フェーズ**で先行させ、derive 時点では `_data/external` を読むだけにする。

---

## 10. 欠損・エラー時

| 状態 | 表示 |
|------|------|
| JSON なし | 「予想投手データを準備中です」+ 再ビルド案内 |
| カード 0 件 | 「直近の三連戦カードがありません」（オフシーズン・全日程取得漏れ） |
| SN 全球団失敗 | 前回 `current.json` を維持（ビルド側）。初回のみ空 |
| 投手名のみ ID 未解決 | 投手名表示、OPS ブロックなし |

---

## 11. 受け入れ条件（Phase 0 完了）

- [ ] 本書の「直近の対戦カード」「6 人」「OPS 上位 3」の定義が PR 説明可能
- [ ] SN URL 設定ファイルの球団 12 件が揃っている
- [ ] JSON スキーマ・パスが `docs/DATA_PATHS.md` 草案と一致
- [ ] パイプライン組込位置（fetch vs derive）が関係者合意

---

## 改訂履歴

| 日付 | 内容 |
|------|------|
| 2026-06-14 | 初版起草 |
