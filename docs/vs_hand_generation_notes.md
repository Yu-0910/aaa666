# 対左右別（vs_hand）生成の再発防止メモ

このプロジェクトでは、**対左右別（split_type=`vs_hand`）は「完成成績の転載」ではなく、試合ログ（canonical）から再構築**する方針とする。

## 今回の学び（不具合の原因）

### 1. 投手割当（R/L）が欠けると「対不明」になる
- `plateAppearances[].yahooPitcherId` が無い試合（sportsnavi partial など）では、左右判定ができず `unknown` に寄りやすい。
- さらに `game.teams` が空の canonical では、先発投手の seed すら取れない。

### 2. 打席結果が欠けると AVG/OPS が壊れる
- `plateAppearances` に `resultSummaryJa` が無い／`pitchEvents` も無い打席が混ざると、
  - PA は増えるが AB/H などの増分が入らず
  - `PA` と `AB+BB+HBP+SH+SF` が一致しない
  - AVG/OPS がズレる

## 再発防止の方針（実装ルール）

### A. まず「投手の投球腕」は名簿を唯一の正とする
- 投手の左右は `_data/npb_roster_2026.csv` の `throw_hand` を唯一の正にする。
- 可能なら `yahooPitcherId -> (bridge) -> npb_player_id -> roster` で解決。
- ID が無い場合は `yahooPlayersMentioned[id]` の日本語名で名簿照合（`pitcherThrowHandRLFromYahooPitcherIdWithMentioned`）。
  - **正式名**（名簿 `name_ja` と完全一致）のみ全国照合可。
  - **略称**（例: 「オスナ」）は **守備球団**（試合前情報＋打席の表/裏）で名簿を絞り、**候補が1人のときだけ**採用。2人以上・球団不明は `unknown`。
  - 全国の `find` 先勝ち（CSV 並び）で同姓別球団を拾わない（ヤクルトＪ．オスナ vs ソフトバンクＲ．オスナ等）。
- 実況・raw_yahoo_text の投手名フォールバックも同じ球団スコープ（`pitcherThrowHandFromJaNameHint`）。

### B. 投手割当の優先順位（2026-05 改定: carry-forward / BF 廃止）

実装: `lib/yahooGame/resolvePitcherIdByPaId.ts`（派生パイプライン読込時・Phase10 マージ後に `enrichPlateAppearancesWithResolvedPitcherIds` を適用）。

1. `pitchEvents` 末尾 → `plateAppearances.yahooPitcherId`（`yahooPitcherIdForVsHandFromPa`）
2. 実況タイムライン（`buildPitcherIdByPaIdFromTextTimeline`）— 投手交代・「に代わって」を反映
3. 打席行の投手明示（`inferPitcherIdFromPaTextLine`）
4. それでも無理なら **`unknown`**（対右/対左に推測で入れない）

**使わない（廃止）**

- 表/裏の直前投手 carry-forward
- `pitchingLines.bf` による打席順の機械割当

敬遠のみ: `applyCarryForwardPitcherForIntentionalWalk`（Phase10 マージ内・同一半回・交代なし・敬遠行のみ）

### C. 打席結果の補完ルール（最低限）
- `resultSummaryJa` が空 かつ `pitchEvents` が無い打席は、実況行（textPlayByPlay）から結果を最低限補完する。
  - 四球/死球/犠打/犠飛/三振/本塁打/二塁打/三塁打/安打/アウト
- sportsnavi 省略表記（例: `左２`, `右本`）も hit 判定に含める。

## 自動チェック（DoD）
- `vs_hand` について、少なくとも次の整合性を満たすこと。
  - `PA == AB + BB + HBP + SH + SF`（※このプロジェクトの打席定義に合わせて調整）
  - `AVG == H/AB`（AB>0 のとき）
  - `H == H1 + H2 + H3 + HR`
- 欠損がある場合は「対不明」または「未取得」ではなく、**どの原因（投手割当欠損/結果欠損）かを debug で可視化**できること。

