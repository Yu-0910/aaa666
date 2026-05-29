# 2026-03-27（広島×中日）でできていることを、2026-04-17 までの全試合へ拡大する計画書

ゴール: **投手個人ページ / 野手個人ページ / ランキングページ**の UI 上の指標が、**2026-03-27〜2026-04-17 の NPB 全試合**に基づく数値で埋まる。

前提（この計画でやらないこと）:
- すでに **2026-03-27 広島×中日（gameId=2021038624）**で「取得→計算→UI 反映」が動いている。**基本的に同じ手順を踏む**。
- 既に `docs/plan_full_pipeline_from_games_to_pages_and_rankings.md` の手順で実行済みのものは、同じ成果物がある限り **繰り返さない**（＝飛ばす）。
- **規定打席/規定投球回（規定到達）**の扱いは、既存計画書の該当 Phase をそのまま流用する（本書では「Phase 7（規定）」として参照する）。
- Phase 0〜8 完了後も **個人ページの欠損・ランキングのリーグ混同・指標誤り・規定の未検証** などが残る場合は、**Phase 9 以降**で切り分け・修正・検証を行う（番号は自然数のみ）。

この計画のスコープ:
- 2026-03-27〜2026-04-17 に開催された NPB 全試合（現状 `season_2026.json` の 122 試合）を対象に、**canonical と派生を “全試合分” に拡大**し、UI に数値を出す。

---

## 現状（すでにあるもの／飛ばせる可能性が高いもの）

すでに確認できているもの:
- Phase 0 相当（スケジュール index）: `_data/sportsnavi_schedule_index/season_2026.json`（games=122）
- Phase 1 相当（試合トップ raw）: `_data/scraped_games/raw_sportsnavi/{gameId}.html`（`--force` で再取得済み）
- Phase 2 相当（canonical ファイル）: `_data/scraped_games/canonical/{gameId}.json`（122 本）

ただし現状の canonical は、**出場成績/テキスト速報の raw が揃っていないと空になりやすい**。
この計画は「3/27 の成功パターン」と同じ入力（出場成績・一球・テキスト等）を全試合へ広げることに集中する。

---

## 重要な考え方（SSOT）

- UI の数値は、最終的に **`_data/scraped_games/canonical` を正**として計算できる形に寄せる。
- ただしスポナビだけで埋まらない層（特に **一球速報＝pitch-by-pitch**）は、3/27 で実績のある手段（Yahoo 由来の復元・マージ等）で補完する。
- 「どの raw が欠けているか」は canonical 内の `game.missingOrPartial` を手掛かりに検知できる状態にする。

---

## Phase 設計（1コマンド=1 Phase を原則）

### Phase 0: 対象試合の確定（スケジュール index 更新）

目的:
- 3/27〜4/17 の試合集合を固定する（漏れ・延期の差分も追える入口）。

入力:
- スポナビ日程

出力:
- `_data/sportsnavi_schedule_index/season_2026.json`
- `_data/sportsnavi_schedule_snapshots/by_date/*.json`

実行:
- `npm run phase0:sportsnavi:schedule`

飛ばせる条件:
- `season_2026.json` の `builtAt` が十分新しく、`gameIds` が 122 試合で妥当なら飛ばす。

---

### Phase 1: 試合トップ raw の更新（必要時のみ再取得）

目的:
- canonical 生成の最小入力（試合トップ HTML）を揃える。

入力:
- Phase 0 の `season_2026.json`

出力:
- `_data/scraped_games/raw_sportsnavi/{gameId}.html` と `_meta`

実行:
- 通常: `npm run phase1:sportsnavi:games`
- 強制更新: `npm run phase1:sportsnavi:games -- --force`

飛ばせる条件:
- `raw_sportsnavi/{gameId}.html` と `_meta/{gameId}.json` が全件存在し、`_failures.json` が健全なら飛ばす。

---

### Phase 2: スポナビの「出場成績」「テキスト速報」raw を全試合分そろえる（新規に一括化する）

目的:
- Phase 2（canonical）で `domain.battingLines/pitchingLines` と `textPlayByPlay` を埋められる状態にする。

入力:
- Phase 0 の `season_2026.json`（gameId 一覧）

出力:
- `_data/scraped_games/raw_sportsnavi_stats/{gameId}.html`（出場成績）
- `_data/scraped_games/raw_sportsnavi_text/{gameId}.html`（テキスト速報）

実行:
- 本 Phase の実装により **単一コマンド**で回せるようにする（例: `npm run phase2:sportsnavi:stats-text`）。

飛ばせる条件:
- 上記2ディレクトリに `{gameId}.html` が全件揃っている、または欠損が説明可能で canonical の `missingOrPartial` が十分小さい場合。

メモ:
- この Phase は、既存の `phase2_build_canonical_from_raw_sportsnavi.mjs` が参照する入力ディレクトリを “先に埋める” ためのもの。

---

### Phase 3: canonical の再生成（stats/text を取り込む）

目的:
- 全試合の canonical を、出場成績・テキスト速報まで含めて更新する。

入力:
- `raw_sportsnavi` / `raw_sportsnavi_stats` / `raw_sportsnavi_text`

出力:
- `_data/scraped_games/canonical/{gameId}.json`

実行:
- `npm run phase2:sportsnavi:canonical -- --force`

飛ばせる条件:
- canonical の `missingOrPartial` が十分減っており、`domain.battingLines` / `domain.pitchingLines` が実データで埋まっている試合が多数あるなら飛ばす。

---

### Phase 4: 一球速報（pitch-by-pitch）相当を全試合へ拡大し、canonical にマージする

目的:
- コース・球種・カウント等、UI に存在する「一球依存」の指標を全試合分計算できる入力を揃える。

入力:
- 3/27 で既に動いている「一球を得る経路」（Yahoo 由来の復元・マージ等）

出力:
- canonical の `domain.plateAppearances` / `domain.pitchEvents` が全試合で（可能な限り）埋まる

実行（例）:
- `npm run phase10:yahoo:restore`（既存）
- `npm run phase10:yahoo:merge`（既存）

飛ばせる条件:
- canonical 側で `plateAppearances` / `pitchEvents` が十分に入っており、Phase 6（派生）の生成結果が UI を満たすなら飛ばす。

---

### Phase 5: 個人ページ用派生を全試合分で再生成（投手/野手/捕手）

目的:
- `_data/derived/**/2026/` を「3/27 の 1 試合」ではなく「3/27〜4/17 の全試合」で埋める。

入力:
- `_data/scraped_games/canonical/*.json`（上記 Phase 3/4 済み）
- 名簿・ID 橋渡し

出力:
- 既存の派生（投手・野手・捕手・ゾーン等）が全試合分の値になる

実行:
- `npm run phase3:derived:2026`

飛ばせる条件:
- `_data/derived/**/2026/` が全員分・全指標分で揃っており、UI 上の数値が埋まっているなら飛ばす。

---

### Phase 6: ランキング JSON の再生成（全試合分）

目的:
- ランキングページが読む JSON を、全試合分の canonical/派生から生成する。

実行:
- `npm run rankings:rebuild`（打撃 `phase12` + 投手 `phase19`）

注意:
- `public/data/rankings/` は Git から除外される運用になり得るため、配置・公開の方針（ローカル確認/外部ストレージ）を決める。

---

### Phase 7: 規定到達（規定打席/規定投球回）

目的:
- 規定系のランキング・表示条件を成立させる。

本書の扱い:
- **既存計画書**（`docs/plan_full_pipeline_from_games_to_pages_and_rankings.md`）の Phase 7（規定）を流用し、そちらを SSOT とする。

---

### Phase 8: UI の確認・“数値が埋まった”ことの確認

目的:
- 投手個人/野手個人/ランキングの UI で「—」が残る場所を、欠損理由と再計算手順で説明できる状態にする。

実施内容（最小）:
- 投手ページ: `season-pitching` / `pitcher-zone-stats` / `pitch-details` の表示が「試合 1 本」依存になっていないこと
- 野手ページ: `season-stats` がプレースホルダではなく、シーズン集計として値が出る選手がいること
- ランキング: `public/data/rankings/**` が存在し、ページが JSON を読んで埋まること

---

### Phase 9: 個人ページの数値欠損の切り分けと修正

目的:
- Phase 0〜8 実行後も **個人ページに「—」や空欄が残る**問題を、原因（canonical 欠損・派生未生成・API パス・年度フィルタ・ID 橋渡し）ごとに潰し、**シーズン集計が UI に出る状態**にする。

入力:
- `_data/scraped_games/canonical/*.json`、`_data/derived/**/2026/`、個人ページが呼ぶ API の応答

出力:
- 欠損理由のメモ（再発防止）と、必要ならコード・データ側の修正
- 修正後は **Phase 5 相当の派生再生成**で数値を揃える

実行（例・調査は手順化、再計算は一括可能）:
- 切り分け: ブラウザの Network と `_data/derived` の有無、`missingOrPartial` の確認（手順を本節または別メモに追記）
- データ更新後の一括: `npm run phase3:derived:2026`

飛ばせる条件:
- 代表選手（CL/PL・野手/投手）で `season-stats` / `season-pitching` 等が数値表示され、欠損が説明可能な例外のみであること。

---

### Phase 10: ランキングのセ・パ分離と指標計算の検証（全指標）

目的:
- **セ・リーグとパ・リーグが UI 上で混ざらない**こと（JSON の `CL`/`PL`、ページのタブ・クエリ、データソースのリーグ属性が一致）。
- **野手・投手の各指標の計算が正しいか**を検証する段階を必ず入れる。野手の **打率・OPS** は優先度の高い例にすぎず、**ランキングに出る指標はすべて**（防御率、WHIP、出塁率、長打率、IsoP、得点圏、投手の rate 系など）対象とする。
- 検証のやり方: 定義（分子・分母・分母ゼロ時の扱い）を SSOT として明記し、**数式どおり canonical／派生から再現できるか**、**サンプル選手・数試合で手計算またはスプレッドシートと突き合わせる**、**個人ページの同指標と一致するか**を確認する。誤りがあれば **集計ロジックまたは JSON 生成（Phase 6 相当）を修正**する。

入力:
- `public/data/rankings/2026/{CL|PL}/**`、`public/data/rankings/pitching/2026/{CL|PL}/**`、集計元の派生（野手・投手）および canonical

出力:
- リーグ別に正しい JSON と、必要なら表示側の修正
- **検証メモ**（指標一覧ごとの定義、使用したサンプル、検算結果と差分の有無）

実行（一括）:
- JSON 再生成: `npm run rankings:rebuild`
- 修正がコード側のみの場合も、再生成は上記と同じコマンドでよい

飛ばせる条件:
- CL/PL で別ディレクトリ・別リクエストが保証され、**指標ごとに**検算が通り、個人ページ／派生と矛盾しないこと（野手の打率・OPS だけでなく、投手・その他野手指標も含む）。

---

### Phase 11: 規定打席到達（チーム試合数ベース）の実装確認と検証

目的:
- **規定打席（および必要なら規定投球回）**が、**所属チームの消化試合数**から閾値を決め、選手実績と突き合わせて判定できるかを確認する（`docs/plan_full_pipeline_from_games_to_pages_and_rankings.md` の Phase 7 設計と整合）。

入力:
- Phase 0 の試合集合、canonical におけるチーム別の試合数、名簿の所属、派生の PA / 投球回

出力:
- チームごとの分母（試合数）と閾値、選手ごとの到達フラグを永続化する実装がある場合はそのパス、未実装なら **実装タスク**として本 Phase に残す
- 検証レポート（サンプル数チームで手計算と一致）

実行:
- 実装済みなら規定用ビルド／検証コマンド（リポジトリに追加されたもの）を実行。未実装なら Phase 7 SSOT に沿って実装してから再実行。

飛ばせる条件:
- 少なくとも **「チーム別試合数 → 閾値 → 到達可否」**が再計算可能で、ドキュメントと矛盾しないこと。

---

## 一括実行（データパイプライン）

以下は **前提データが揃っているとき**、続けて実行できる（途中で失敗したらそこで止めて原因を直す）。

```bash
# 派生（個人ページ用）→ ランキング JSON
npm run phase3:derived:2026 && npm run rankings:rebuild
```

一球まで含めて canonical を揃えた直後に、上記だけ繰り返す運用にできる。Phase 9〜10 でコードを直したあとも同じ。

---

## 進め方（最短ルート）

この計画の実行順（最短）:
1. Phase 0（必要時）
2. Phase 2（出場成績/テキスト raw を揃える）  ← **ここが今回の主戦場**
3. Phase 3（canonical を stats/text 反映で再生成）
4. Phase 4（必要なら一球を全試合へ）
5. Phase 5（派生全再生成）
6. Phase 6（ランキング再生成）
7. Phase 7（規定）※既存計画を流用
8. Phase 8（UI での埋まり確認）
9. Phase 9（個人ページの数値欠損の切り分けと修正）
10. Phase 10（ランキングのセ・パ分離と野手・投手の全指標の計算検証）
11. Phase 11（規定打席到達のチーム別計算の検証・未実装の補完）

Phase 9〜11 は **Phase 0〜8 のあと**、または問題が見つかったタイミングで実施する。

