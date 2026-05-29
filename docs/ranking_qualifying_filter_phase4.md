# Phase 4: サイト側の規定フィルタ整理と後方互換

ランキング用JSONが規定必須指標について「規定到達者のみ」で既にビルドされている場合と、従来ビルド（全員入り）のJSONが混在する場合の両方で、正しく表示されるようにするための整理ドキュメント。

---

## 方針

- **規定フィルタは残す**  
  アプリ側で「PA >= minPA」（または年度・リーグに応じた AB/PA/チーム別しきい値）でフィルタする実装を維持する。
- **規定用CSVからビルドしたJSON**  
  既に規定到達者のみが含まれるため、フィルタを通しても結果は変わらない（全行が規定以上 → 実質 no-op）。
- **従来ビルドのJSON（全員入り）**  
  フィルタが効くことで、規定未到達者が除外され正しく表示される。
- **後方互換**  
  フィルタを残すことで、規定用CSVをまだ作っていない年度や、古いJSONが残っている環境でも正しく表示される。

---

## 規定フィルタの適用箇所

| ファイル | 役割 | 内容 |
|----------|------|------|
| **lib/ranking/qualifyingPA.ts** | 規定判定の定義・計算 | `shouldRequireQualifyingPA(metricKey)` で指標ごとに規定必要/不要を判定。`calculateMinPA(year, league, team?)` で年度・リーグ・チーム別の規定打席（または規定打数）を計算。1950年代PLのチーム別AB等もここで定義。 |
| **app/ranking/[year]/[league]/RankingPageClient.tsx** | ランキング表のソート前フィルタ | ソート対象指標が規定必須の場合、`PA >= minPA`（または AB/チーム別しきい値）で行をフィルタ。1966/1967 PL はチーム別PA、1951/1952 PL はチーム別AB、1950 CL は試合数条件も考慮。 |
| **lib/ranking/leaders.ts** | トップリーダー取得時のフィルタ | `getTopNForMetric` 内で、規定必須指標の場合は `PA >= minPA` でフィルタしてから上位N件を取得。 |
| **lib/ranking/adapter.ts** | ランキング行の構築 | `buildRankingWithAllMetrics` では「PA > 0」のみフィルタ。規定打席（minPA）による絞り込みは **Client 側（RankingPageClient）でソート時に実施**。 |

---

## データの流れ

1. **JSON の取得**  
   `lib/ranking/jsonLoader.ts` の `loadRankingJson` で `data/rankings/{year}/{league}/{metric}.json` を取得。
2. **規定用CSV由来のJSON**  
   Phase 2 で規定必須指標は `*_qualifying.csv` からビルドされているため、JSON には規定到達者のみが含まれる。Client 側のフィルタは全行が規定以上なので **通過するだけ（no-op）**。
3. **従来ビルドのJSON**  
   規定用CSVが無い年度や古いビルドでは、JSON に全選手が含まれる。Client 側のフィルタで `PA < minPA` の行が除外され、**規定到達者のみが表示される**。

---

## 2026 ビルド時絞り込み（Phase 4・実施済み）

- Phase 12 / 19: 率系は `{指標}.json` のみ規定到達者、`*_all.json` は全選手
- Phase 28: 週間率系 JSON を当週 `team-games` で絞り込み
- 実装: `lib/ranking/filterRankingsByQualifyingAtBuild.ts`
- 検証: `npm run validate:ranking-qualifying-2026`

## オプション（未実施）

- **JSON にメタ情報を付与**（`qualifyingFilterApplied` 等）は将来用。Client フィルタは後方互換のため維持。

---

## 参照

- 計画書: `docs/ranking_qualifying_csv_all_years_plan.md`（Phase 4 セクション）
- データパス・実行順序: `docs/DATA_PATHS.md`
