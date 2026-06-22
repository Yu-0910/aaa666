# チーム順位表 — Phase 0 要件確定書

**状態**: ✅ Phase 0 完了（**2026-05-30**。実装は Phase 1 以降）  
**親計画**: [`plan_team_standings_phases.md`](plan_team_standings_phases.md)

Phase 1 以降は **本書** に従う。指標順・JSON キー・パス・R2 方針・計算ルールはここで固定する。

---

## 1. スコープ（v1 でやる／やらない）

| やる | やらない（別 Issue） |
|------|----------------------|
| トップ「順位表」タブ（CL・PL の 2 表） | 順位表専用 URL ページ |
| 2026 年を先行（canonical から再集計） | オープン戦・キャンプ（順位表の集計対象外） |
| **各リーグ表に交流戦を含む**（CL 球団の CL 表行＝内戦＋対パ交流） | — |
| 指標 32 列（§3） | 失策・残試合・盗塁（今回の指標リスト外） |
| R2 配信（`/data/standings/...`） | デザイン最終調整 |
| 過去年度（Phase 3）：マスタ CSV から成績再計算 | 公式順位 tie-break の完全再現 |

---

## 2. データレイヤ（R2 一本化）

[`plan_display_data_r2_unified_phases.md`](plan_display_data_r2_unified_phases.md) の **3 原則**に従う。

| レイヤ | パス |
|--------|------|
| 工場（派生） | `_data/derived/team_standings/{year}/{CL\|PL}.json` |
| ローカル（表示用・Git 外） | `public/data/standings/{year}/{CL\|PL}.json` |
| R2 オブジェクトキー | `data/standings/{year}/{CL\|PL}.json` |
| ブラウザ | `/data/standings/{year}/{CL\|PL}.json` |

**更新**: `phase29:build:standings` → `display:r2:upload`（`git push` だけでは数字は変わらない）。

---

## 3. 表示指標（確定順）

コード上の正: `lib/standings/metricColumns.ts` の `STANDINGS_METRIC_COLUMNS`。

| 順 | ラベル | JSON キー |
|---:|---|---|
| 1 | 球団 | `team` / `teamName` |
| 2 | 試 | `g` |
| 3 | 勝 | `w` |
| 4 | 敗 | `l` |
| 5 | 分 | `t` |
| 6 | 勝率 | `pct` |
| 7 | ゲーム差 | `gb` |
| 8 | 得点 | `runs` |
| 9 | OPS | `ops` |
| 10 | 打率 | `avg` |
| 11 | 本塁打 | `hr` |
| 12 | 安打 | `h` |
| 13 | 単打 | `singles` |
| 14 | 二塁打 | `doubles` |
| 15 | 三塁打 | `triples` |
| 16 | 出塁率 | `obp` |
| 17 | 長打率 | `slg` |
| 18 | 得点圏打率 | `risp_avg` |
| 19 | IsoD | `isod` |
| 20 | IsoP | `isop` |
| 21 | BB% | `bb_pct` |
| 22 | K% | `k_pct` |
| 23 | 防御率 | `era` |
| 24 | 先発防御率 | `era_starter` |
| 25 | 救援防御率 | `era_relief` |
| 26 | 被打率 | `avg_allowed` |
| 27 | 完投 | `cg` |
| 28 | BB% | `bb_pct_pitch` |
| 29 | K% | `k_pct_pitch` |
| 30 | K-BB% | `k_bb_pct` |
| 31 | QS率 | `qs_rate` |
| 32 | HQS率 | `hqs_rate` |

打撃 BB% と投手 BB% は **別キー**（`bb_pct` / `bb_pct_pitch`）。

---

## 4. JSON スキーマ

**スキーマ ID**: `team-standings-v1`（`lib/standings/types.ts`）

**ファイル（ルート）**:

```json
{
  "schemaVersion": "team-standings-v1",
  "year": "2026",
  "league": "CL",
  "source": "canonical",
  "generatedAt": "2026-05-30T12:00:00.000Z",
  "rows": []
}
```

**1 行**: §3 のキーを持つ `TeamStandingRow`（型定義は `lib/standings/types.ts`）。

---

## 5. 2026 年 — 集計の正（canonical）

### 5.1 入力

| 項目 | 内容 |
|------|------|
| 試合一覧 | `loadCanonicalGamesMergedForDerivedPipeline`（Phase 12 / 19 / 28 と同一） |
| 年度 | `--year 2026` |
| リーグ | `CL` または `PL`（6 球団ずつ） |
| 得点・勝敗のスコア | 出場成績 HTML（`raw_sportsnavi_stats/{gameId}.html`）内 `#ing_brd` 表の **「計」列**（一球速報ページと同位置）。パース: `lib/yahooGame/parseYahooScorePageScoreboard.ts`、読込: `lib/standings/sportsnaviStatsScoreboard.ts` |
| 集計入口 | `lib/standings/aggregateTeamStandingsFromCanonical.ts`（`projectRoot` 指定で raw スコアを参照） |

### 5.2 試合の含め方

| 条件 | 含める |
|------|--------|
| 試合日が 2026 年度内 | ✅ |
| 中止（`isCancelledCanonicalGame`） | ❌ |
| 未消化（`isFutureOrTodayGameYmd`：当日・未来） | ❌ |
| **当該リーグの球団が 1 つ以上出場**（`isLeagueStandingsGame`） | ✅ |
| **リーグ内戦**（CL vs CL / PL vs PL） | ✅ |
| **交流戦**（CL vs PL） | ✅（各リーグ表では **自リーグ球団の行だけ** 更新） |
| **他リーグ同士のみ**（例: PL vs PL を CL 表に載せない） | ❌ |
| 「計」列から先攻・後攻の得点が取れない | ❌（試合ごと除外。出場成績 R 合算フォールバックは **使わない**） |

**判定**: `lib/standings/leagueGameFilter.ts` の `isLeagueStandingsGame` — `rankingTeamShortsFromCanonicalGame` で得た 2 球団のうち、**いずれか**の `leagueBucketForTeamShort` が当該 `CL` / `PL` と一致すること。

**交流戦の勝敗**: `applyGameResult` は Map 内に存在する球団 bucket のみ更新（CL 表では CL 球団の W/L/得点のみ。相手 PL 球団は PL 表側で集計）。

### 5.3 勝敗・試合数

| 項目 | ルール |
|------|--------|
| 勝 | 自チーム得点 > 相手得点（「計」列。`getGameScoreSides`） |
| 敗 | 自チーム得点 < 相手得点 |
| 分 | 同点 |
| 試 `g` | `w + l + t` |
| 得点 `runs` | 自チームの「計」合計（§5.2 の対象試合すべて。交流戦含む） |
| 失点 `runs_allowed` | 相手「計」の合計（同上） |

**整合**: `g === w + l + t` を smoke で検証。`team-games.json`（`aggregateSeasonTeamGamesFromCanonical`）は **リーグフィルタなし**で試合数を数えるため、スコア未取得試合の有無によっては `g` と完全一致しない場合がある。

### 5.4 順位・ゲーム差

| 項目 | ルール |
|------|--------|
| ソート | 勝率 `pct` 降順 → 勝 `w` 降順 → `team` コード昇順 |
| 勝率 | `w / (w + l)`（引分は分母に含めない。v1 簡易式） |
| ゲーム差 `gb` | 首位: `—`。他: `(leaderW - teamW + teamL - leaderL) / 2`、0.5 刻みで表示 |

### 5.5 打撃合算（チーム）

| 項目 | ルール |
|------|--------|
| 入力 | `plateAppearances` 優先。無ければ `battingLines` |
| 所属 | 打者の球団 = 当該試合での所属略称（Phase 12 と同系） |
| 対象試合 | §5.2 と **同一**（リーグ内戦＋交流戦。勝敗と同じ `games` ループ） |
| 率 | **合算後再計算**（個人率の平均は取らない） |
| 単打 | `H - 2B - 3B - HR` |
| 得点圏打率 | `risp` フラグ付き PA の `H / AB` |
| IsoD / IsoP | `OBP - AVG` / `SLG - AVG` |
| BB% / K% | `BB/PA×100` / `SO/PA×100` |
| OPS | `OBP + SLG` |

### 5.6 投手合算（チーム）

| 項目 | ルール |
|------|--------|
| 入力 | `pitchingLines` |
| 先発/救援 | `canonicalPitchingSeasonAgg` と **同一** starter 判定 |
| 対象試合 | §5.2 と **同一**（打撃・勝敗と同じ試合集合） |
| 防御率 | `(ER×9) / IP`（十進回） |
| 先発/救援 ERA | 先発分・救援分を **別 IP/ER で** 算出 |
| 被打率 | 相手打者の `H / AB`（チーム被打） |
| 完投 `cg` | 1 人投手完投試合数（既存 agg ロジック） |
| BB% / K% / K-BB% | `BB/BF×100` / `SO/BF×100` / `(SO-BB)/BF×100` |
| QS率 | `qsStarts / gamesStarted × 100`（QS: 6+ IP かつ ER≤3） |
| HQS率 | `hqsStarts / gamesStarted × 100`（HQS: 7+ IP かつ ER≤2） |

---

## 6. 過去年度（Phase 3 向けメモ）

| 項目 | 方針 |
|------|------|
| 入力 | `_data/master_csv_calculated/batting_{year}_{CL\|PL}_from_master.csv` ＋ pitching 同型 |
| 集計 | チーム列でグループ化 → 合算 → 率は再計算 |
| 勝敗 | canonical が揃う年度のみ §5.3。それ以外は `w/l/t/gb` を `null` または列非表示 |

---

## 7. UI データ取得（Phase 5 向け）

| 環境 | URL |
|------|-----|
| 本番 | `GET /data/standings/{year}/{CL\|PL}.json` → R2 |
| ローカル | 同上（`RANKINGS_PREFER_LOCAL=1` 時は `public/data/standings/`） |
| R2 直 | `{RANKINGS_BASE_URL}/data/standings/{year}/{CL\|PL}.json` |

球団帯カラー: `teamColors[team]`（`app/components/top/topPageConstants.ts`）。  
球団コード ↔ 略称: `lib/ranking/leadersFromRankingsJson.ts` の `teamNameToCode` / `teamCodeToName` を Phase 1 で共通化検討。

---

## 8. 本番確認用 URL（2026）

| 確認項目 | パス |
|----------|------|
| セ順位表 JSON | `/data/standings/2026/CL.json` |
| パ順位表 JSON | `/data/standings/2026/PL.json` |
| R2 直 | `{RANKINGS_BASE_URL}/data/standings/2026/CL.json` |
| トップ UI | `/2026` → 「順位表」タブ |

---

## 9. Phase 0 成果物チェックリスト

- [x] 本書（要件確定）
- [x] `lib/standings/types.ts`（スキーマ・行型）
- [x] `lib/standings/metricColumns.ts`（指標順・ラベル）
- [x] `lib/standings/paths.ts`（パス定数）
- [x] `.gitignore` に `public/data/standings/`
- [x] `docs/DATA_PATHS.md` に順位表パス追記
- [x] 親計画書 §Phase 0 を完了に更新

---

## 10. 改訂履歴

| 日付 | 内容 |
|------|------|
| 2026-05-30 | 初版（Phase 0 完了） |
| 2026-05-31 | §5.2 交流戦を各リーグ順位に含める。得点は出場成績 HTML「計」列（R 合算フォールバック廃止）。打撃・投球も §5.2 と同一試合集合 |