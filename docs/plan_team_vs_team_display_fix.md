# チーム別の対戦成績 表示復旧 計画書

個人ページ（`/players/[playerId]`）の「**チーム別の対戦成績**」テーブルに全行「—」しか表示されていない症状を解消し、12 球団の OPS／打率／本塁打／打点／出塁率／長打率／打数／安打 を実数値で描画する。**他見出しの作成過程で既に存在する資産を最大限再利用**し、最終的に **`npm run phase3:derived:2026`**（一括生成）の一連で自動更新できる状態に戻す。

---

## 1. 現状（5/12 時点の症状）

- UI 該当箇所: `app/components/SeasonStatsPilot.tsx` の `{/* チーム別の対戦成績（12球団固定表示） */}` ブロック。
  - 集計ソース: `effectiveStats.filter((r) => r.split_type === "vs_team")`。
  - 12 球団ループは `splitMatch`（例: `"ジャイアンツ"`, `"DeNA"`, `"広島"` 等）で `split_value.includes(splitMatch)` 検索する。
  - 一致行が無いと全セル `"—"`。
- API: `app/api/players/[playerId]/season-stats/route.ts` → `mergePilotSeasonStatsWithDerived()`。
- マージ元: `lib/seasonStatsPilot.ts` の `loadPhase13ContextBattingRows()`。
- ファイル: `_data/derived/player_season_batting_context/{year}/yahoo_{batterId}.json`（**Phase 13** 派生）。
- **git status: 当該フォルダ配下の `yahoo_*.json` が一括 `D`（削除）状態。再生成しても下記の根本原因により `vs_team` 行が 0 件のまま書き出される。**

---

## 2. 根本原因（一次特定済み）

`scripts/phase13_build_context_splits_from_canonical.ts` の `getPaContext()` は以下を要求する。

```ts
const sb = doc.game.scoreboard
if (sb.length < 2) return null
const visitorName = (sb[0].teamName ?? "").trim()
const homeName    = (sb[1].teamName ?? "").trim()
```

ところが現行 canonical ビルダー（`_data/scraped_games/canonical/*.json`）は `scoreboard: []` および `teams: []` のまま生成される（チーム名はタイトル文字列と `textPlayByPlay` の「試合前情報」テキストにしか含まれない）。

その結果、`getPaContext()` が**全 PA で null を返し**、`vs_team` / `stadium` / `home_away` の 3 種すべてが 0 行で書き出される（UI は「—」しか表示できない）。

実証:

- `_data/scraped_games/canonical/*.json` を grep すると全ファイルで `"scoreboard": []` / `"teams": []`。
- 派生も「`vs_team` 行を含まない（または `player_season_batting_context/2026/` 配下が空）」状態。

---

## 3. 既存資産（他見出し作成の過程で既に存在）

新規にスクレイピング・パースを書かない。次の資産を**そのまま流用**する。

| 既存資産 | 役割 | 用途 |
|----------|------|------|
| `lib/yahooGame/inferTeamsFromTextPbp.ts` の `injectTeamsFromTextPbpIfMissing()` | canonical の `scoreboard`/`teams` が空のとき、`textPlayByPlay[0]`（"試合前情報"）の `先攻:X / 後攻:Y` をパース。失敗時は `battingLines`/`pitchingLines` の `yahooPlayerId` を `findRosterPlayerByPublicId` で照合し頻度集計で上位 2 チームを採用。出力は **NPB 12 球団の正式名**（例 `広島東洋カープ` / `中日ドラゴンズ` / `読売ジャイアンツ` / `横浜DeNAベイスターズ` …）。**idempotent**（既に埋まっていれば素通り）。**Phase 28（vs_hand）パイプラインで既に実戦投入済み**。 | 各 canonical 試合のビジター／ホームを再構築 |
| `lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline.ts` の `loadCanonicalGamesMergedForDerivedPipeline()` | Phase 11 / 13 / 14 / 15 / 16 / 17 で**共通**に使われている canonical 一括ロード関数。`mergePhase10RestoredIntoDocIfPresent` を適用して 1 球復元 PA も含んだ状態で配列を返す。 | Phase 13 から呼び出し済み。差し替え不要 |
| `_data/npb_roster_2026.csv` + `findRosterPlayerByPublicId` | フォールバック側（先攻/後攻テキストが取れない試合）で打者・投手の所属チームを引く。`injectTeamsFromTextPbpIfMissing` 内で利用済み。 | 試合前情報テキストが取れない例外試合の救済 |

UI 側の `TEAM_ORDER`（`SeasonStatsPilot.tsx`）の `splitMatch` は次のように既に**正式名と部分一致でヒット**するよう設計されている。追加変更は不要。

| UI label | splitMatch | 完全名（注入後の vs_*）が含むキーワード |
|----------|-----------|---------------------------------------|
| 日本ハム | `北海道日本ハム` | `北海道日本ハムファイターズ` ✓ |
| 楽天 | `楽天` | `東北楽天ゴールデンイーグルス` ✓ |
| 西武 | `西武` | `埼玉西武ライオンズ` ✓ |
| ロッテ | `ロッテ` | `千葉ロッテマリーンズ` ✓ |
| オリックス | `オリックス` | `オリックス・バファローズ` ✓ |
| ソフトバンク | `ソフトバンク` | `福岡ソフトバンクホークス` ✓ |
| 巨人 | `ジャイアンツ` | `読売ジャイアンツ` ✓ |
| ヤクルト | `ヤクルト` | `東京ヤクルトスワローズ` ✓ |
| 横浜 | `DeNA` | `横浜DeNAベイスターズ` ✓ |
| 中日 | `中日` | `中日ドラゴンズ` ✓ |
| 阪神 | `阪神` | `阪神タイガース` ✓ |
| 広島 | `広島` | `広島東洋カープ` ✓ |

---

## 4. フェーズ計画

### Phase A — Phase 13 ビルダーへの注入（最小修正・最優先）

- **対象**: `scripts/phase13_build_context_splits_from_canonical.ts`
- **変更**:
  1. `injectTeamsFromTextPbpIfMissing` を import。
  2. メインループ内、PA を回す前に `const merged = injectTeamsFromTextPbpIfMissing(doc)` を挟み、以降は `merged.game.scoreboard` / `merged.gameId` を参照する。
  3. これ以外のロジック（`getPaContext`、`updateBattingAggFromPa`、`toSeasonStatsRow`、出力スキーマ、ファイル名）は**触らない**。
- **理由**:
  - 既に Phase 28 系で正しく動作しているヘルパーをそのまま挿すだけ。
  - `injectTeamsFromTextPbpIfMissing` は idempotent なので、将来 canonical ビルダーが `scoreboard` を埋めるよう改修されても影響なし。

### Phase B — 球場名・ホーム/ビジターも同時に正常化（同経路の副作用として完成する）

- **対象**: 上記 Phase A の同じスクリプト。
- **追加変更**:
  - 球場名（`resolveStadiumName` の `GAME_STADIUM_SHORT_NAME`）の取り扱いは現状維持で良いが、UI のキー（`マツダ`/`バンテリンD` 等の略称）にできるだけ寄せる方針を残す。本フェーズではチーム別を最優先で復旧させ、球場名マップ拡張は Phase D の運用判断とする。
  - `home_away` は `getPaContext` が `inningHalf` の `表/裏` から決定するため、Phase A の修正で**自動的に**正しく出るようになる。

### Phase C — 再生成と表示確認

1. `npm run phase13:build:context`（または `npx tsx scripts/phase13_build_context_splits_from_canonical.ts --year 2026`）を単体実行。
2. `_data/derived/player_season_batting_context/2026/yahoo_*.json` が**書き出される**こと、ファイル内の `rows[]` に `split_type: "vs_team"` の行（例 `split_value: "vs_中日ドラゴンズ"`）が含まれることを確認。
3. `npm run dev` 起動後、出場のある選手（例: 小園 海斗 `1800072`、菊池 涼介 `1100082` 等）の個人ページを開き、**チーム別の対戦成績**の 12 球団に数値が出ること、対戦実績の無い球団のみ `—` のまま残ることを目視確認。
4. `ホーム&ビジターの対戦成績`セクションも同時に数値化されること（副次効果）。

### Phase D — 一括生成（`phase3:derived:2026`）への組み込み確認

- **`package.json` の `"phase3:derived:2026"` には既に `npm run phase13:build:context` が含まれている**。
- すなわち Phase A の修正だけで、以後は **`npm run phase3:derived:2026`** を実行するたびに自動で派生 JSON が更新され、UI に反映される。
- 別途、`docs/plan_team_vs_team_display_fix.md`（本書）の存在と修正完了を `scripts/RUN.md` の運用節（"派生再生成の最小手順"）に短く追記する（任意・運用メモのみ）。

---

## 5. 検証チェックリスト

- [ ] `scripts/phase13_build_context_splits_from_canonical.ts` が `injectTeamsFromTextPbpIfMissing` を呼ぶ。
- [ ] `npm run phase13:build:context` 実行後、`_data/derived/player_season_batting_context/2026/` に `yahoo_*.json` が**ゼロ件でなく**書き出される。
- [ ] 任意の 1 ファイル（例 `yahoo_1800072.json`）に `rows[].split_type === "vs_team"` の行が複数含まれ、`split_value` が `vs_<NPB 12 球団の正式名>` の形になっている。
- [ ] 個人ページ「チーム別の対戦成績」テーブルで、対戦実績のある球団に数値が描画される。
- [ ] `npm run phase3:derived:2026` を実行しても本セクションが**手動コマンド無しに**最新化される（パイプライン回帰なし）。

---

## 6. 想定リスクとフォールバック

| リスク | 影響 | 対処 |
|--------|------|------|
| 「試合前情報」テキストのフォーマット揺れ（`先攻:X / 後攻:Y` パターンに合致しない試合） | 該当試合のみ `getPaContext` が null を返し、その PA は集計されない | `injectTeamsFromTextPbpIfMissing` 内のフォールバック（`battingLines`/`pitchingLines` × roster 頻度集計）が代替で動く。Phase 28 で実績あり。 |
| 同一試合で外国籍打者名がローマ字併記など、テキスト揺れで集計欠落 | 局所的に試合数が 1 件減る | UI は「対戦実績の無い球団のみ `—` 」になるので、視覚的に縮退するだけ。総合成績（通算行）には影響しない（通算は Phase 11 由来で独立）。 |
| 12 球団以外（独立リーグ・社会人）の試合が混入 | `splitMatch` ヒットせずテーブルに出ない | 現状仕様。今季 NPB のみ表示のままで運用問題なし。 |

---

## 7. 完了条件

1. Phase A の最小修正がコミットされ、`npm run phase13:build:context` がエラーなく完走する。
2. `npm run phase3:derived:2026` を再実行した直後、12 球団テーブルに**少なくとも対戦のある球団分**の数値が出る。
3. 本計画書の所在を `scripts/RUN.md` から辿れる（任意）。

以上。
