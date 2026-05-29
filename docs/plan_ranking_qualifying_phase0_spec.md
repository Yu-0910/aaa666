# ランキング規定 — Phase 0 要件確定書（2026・チーム別区別）

**状態**: ✅ Phase 0 完了（**2026-05-21**。§9 **改定**でチーム試合数の正を確定。実装は Phase 1）  
**親計画**: [`plan_ranking_qualifying_weekly_and_season_phases.md`](plan_ranking_qualifying_weekly_and_season_phases.md)

Phase 1 以降は **本書の最新版（改定後）** に従う。**本書の主眼は 2026 年シーズンにおける球団ごとの区別**である。

---

## 0. メイン趣旨（Phase 0 で固定・改定後が正）

2026 年のランキング（通算・週間）で、次を **球団（6 チーム × CL/PL）ごとに別々の値**として扱う。

| 値 | 記号 | 2026 の正（確定） |
|----|------|-------------------|
| **チーム試合数** | `teamGames(team)` | **一括取得パイプラインの canonical から数えた、その球団の消化試合数** |
| **規定打席** | `minPA(team)` | `round(teamGames(team) × 3.1)` |
| **規定投球回** | `minIp(team)` | `teamGames(team) × 1.0`（十進） |

### 0.1 チーム試合数に使わないもの（2026）

| ❌ 使わない | 理由 |
|------------|------|
| ランキング JSON の **選手 `games` / `g` のチーム別 max** | **出場試合**であり球団の**消化試合数**ではない |
| `config/games_per_team_by_season.json` のリーグ一律値 | 球団間の消化差を表せない |
| `calculateMinPA(2026, league)` の 443 一律 | 同上 |

---

## 0.2 Phase 0 初版と改定（履歴・必読）

Phase 0 は **同日に 2 段階**で確定した。初版で決めた項目のうち、**チーム試合数のデータ源だけが改定**されている。

### 初版 Phase 0（2026-05-21・前半）— 一部 **撤回**

| 項目 | 初版の決定 | 改定後 |
|------|------------|--------|
| **チーム試合数** `teamGames(team)` | ランキング JSON 内の **選手 `games` / `g` のチーム別 max** | **撤回** → §2 の **canonical 取得試合数** |
| 規定式（×3.1 / ×1.0） | チーム別に適用 | **維持** |
| 打席丸め（2026） | 動的経路の `ceil` を `minPAFromTeamGames`（**round**）に統一 | **維持** |
| 週間の率系 | 通算と同型の規定をかける | **維持**（週間の `teamGames` も canonical・当週） |
| カウント系 | 規定なし | **維持** |
| 追加 HTTP | 増やさない | **維持**（`team-games.json` はビルド時に既存 canonical から生成） |

初版に合わせて入れたコード **`computeDynamicMinPAByTeam(rows)`**（選手行 max）は **2026 本番の正ではない**。Phase 1 で `team-games.json` 読込に置き換える。

### 改定 Phase 0（2026-05-21・後半）— **チーム試合数の正**

| 項目 | 確定内容 |
|------|----------|
| **取得試合数** | 一括取得（`daily:npb-pipeline`）で `_data/scraped_games/canonical/{gameId}.json` まで入った試合 |
| **球団別試合数** | 上記 canonical のうち、**その球団が対戦に含まれる試合を 1 試合としてカウント**（通算＝2026 年度、週間＝当該週） |
| **規定への接続** | `minPA` / `minIp` は **必ず**この `teamGames` から算出。選手の出場試合数は使わない |

**用語**: 本計画の「試合数」＝**取得試合数（canonical 本数ベースの球団消化数）**。公式の年間予定試合数や、未取得の将来試合は含めない。

---

## 1. スコープ（2026）

| 対象 | 内容 |
|------|------|
| 年度 | **2026**（CL / PL） |
| データの正 | `_data/scraped_games/canonical`（一括取得で更新）→ 派生 **`team-games.json`** |
| ランタイム | `public/data/rankings/2026/{CL\|PL}/team-games.json` 等を読む。**新規 HTTP なし** |
| 指標 | 率系のみ規定。カウント系はフィルタなし |

---

## 2. チーム試合数の SSOT（canonical・一括取得）

### 2.1 集計ルール（Phase 1 で実装）

| 項目 | 内容 |
|------|------|
| 入力 | `loadCanonicalGamesMergedForDerivedPipeline`（Phase 12 / 19 / 28 と同一） |
| 1 試合 | スコアボードまたは `game.teams` から **対戦 2 球団**を取得し、各球団の試合数 +1 |
| リーグ | Phase 12 と同じ `CSV_TEAM_TO_RANKING_SHORT` + CL/PL バケット |
| 通算 | 2026 シーズンに含まれる全 canonical 試合 |
| 週間 | `weekKey`（火曜始まり週）に含まれる試合のみ |
| 中止試合 | 実装時に canonical の状態で除外（集計から外す） |

### 2.2 出力パス（静的 JSON）

| 種別 | パス |
|------|------|
| 通算 | `public/data/rankings/2026/{CL\|PL}/team-games.json` |
| 週間 | `public/data/rankings/weekly/2026/{weekKey}/{CL\|PL}/team-games.json` |

```json
{
  "schemaVersion": "ranking-team-games-v1",
  "year": "2026",
  "league": "CL",
  "period": "season",
  "source": "canonical",
  "teams": { "巨人": 26, "阪神": 26, "広島": 24, "ヤクルト": 27 }
}
```

`period`: 通算は `"season"`、週間は `"week"` + `weekKey` フィールドを付与（Phase 1 で確定）。

### 2.3 規定打席・規定投球回

```
minPA(team)  = round(teamGames(team) × 3.1)   // 2026
minIp(team)  = teamGames(team) × 1.0
```

`teamGames(team)` は **必ず** §2.1 の `teams[team]` から取る。

### 2.4 参照例（canonical 集計後・消化差あり）

| チーム | teamGames | minPA | minIp |
|--------|-----------|-------|-------|
| 広島 | 24 | 74 | 24.0 |
| DeNA | 25 | 78 | 25.0 |
| 阪神 | 26 | 81 | 26.0 |
| ヤクルト | 27 | 84 | 27.0 |

※ 数値は例。実値は一括取得後の `team-games.json` が正。

### 2.5 フォールバック（最後の手段）

| 順 | 条件 | 処理 |
|----|------|------|
| 1 | `team-games.json` あり | その `teams` を使用 |
| 2 | 無い・キー無し | 警告ログ → 選手行 max またはリーグ一律（**本番 2026 では到達させない**） |

---

## 3. 週間（2026）

週間も **当週の canonical 集計** を `team-games.json` に書き、率系フィルタに使う（Phase 3）。

| 区分 | JSON 掲載（不変） | 率系 |
|------|-------------------|------|
| 打撃 | `pa > 0` の週行 | `pa >= minPA(team)`（**当週** canonical `teamGames`） |
| 投球 | 週行・登板あり | `ip >= minIp(team)` |
| カウント系 | 週行あり | 規定なし |

---

## 4. 指標の要否（変更なし）

- 打撃: `shouldRequireQualifyingPA`
- 投球: `shouldRequireQualifyingPitching`
- 未知指標: 規定不要

---

## 5. 実装状況

| 項目 | 状態 |
|------|------|
| 要件: canonical 球団別試合数 | ✅ 本書で確定 |
| `team-games.json` ビルド | ❌ Phase 1（phase12 / phase28） |
| ランタイム読込 | ❌ Phase 1–3 |
| 暫定: `computeDynamicMinPAByTeam(rows)` | ⚠️ あり（**置換対象**） |

---

## 6. 受け入れ条件（Phase 0）

### 初版で完了したもの（有効のまま）

- [x] 2026: 球団ごとに **規定打席・規定投球回**を区別する（係数 3.1 / 1.0）
- [x] 率系のみ規定・カウント系は規定なし
- [x] 週間率系にも規定（旧週間仕様の上書き）
- [x] 打席丸め: 2009+ は `round`（`minPAFromTeamGames`）
- [x] 新規 HTTP は増やさない

### 改定で確定したもの（初版の teamGames 定義を置換）

- [x] **チーム試合数 = 一括取得済み canonical の球団別カウント**（選手 JSON max は **採用しない**）
- [x] 通算・週間とも同一ルール（期間のみ通算 vs 当週で切る）

### Phase 1 以降（Phase 0 では未完了）

- [ ] `aggregateTeamGamesFromCanonical` + `team-games.json` 出力（phase12 / phase28）
- [ ] ランキング UI が `team-games.json` を読む（`computeDynamicMinPAByTeam(rows)` からの移行）

---

## 7. Phase 1 への引き継ぎ

1. `aggregateTeamGamesFromCanonical.ts` を実装  
2. Phase 12 / 28 の末尾で `team-games.json` を書く  
3. `qualifyingThresholds.ts` が `team-games.json` を読み `minPA` / `minIp` を生成  
4. `computeDynamicMinPAByTeam(rows)` は 2026 本番経路から外す  

---

## 8. 変更しないもの

- Phase 17 / 7 / 28 の選手成績 JSON の再集計禁止
- 歴史年度の `calculateMinPA` 分岐

---

## 9. 改定ログ

| 日付 | 内容 |
|------|------|
| 2026-05-21（初版） | Phase 0 確定: チーム別規定・丸め・週間規定。`teamGames` = ランキング JSON の選手 max（**後述で撤回**） |
| 2026-05-21（改定） | `teamGames` = **一括取得 canonical の球団別取得試合数**。`team-games.json` を SSOT。初版の JSON max はドキュメント・本番経路から除外 |
