# Short-Stop 主要データページ 初期HTML化 計画書

作成日: 2026-08-05

## 目的

Short-Stop の主要データページについて、Google や AdSense のクローラーが JavaScript 実行に依存せず主要コンテンツを読み取れる状態にする。

達成条件は次の通り。

- 初回取得時点の HTML に、選手名、球団名、順位、成績数値、表の見出しなどの主要データが含まれている。
- JavaScript 実行後に初めて主要データが表示される状態を解消する。
- 「ページのソースを表示」で、画面に表示される選手名や数値を確認できる。
- JavaScript を無効にしても、主要な見出しとデータ内容を閲覧できる。
- Google Search Console の公開 URL テストでも、主要な表やデータを確認できる。
- R2 は引き続きデータ保存先として利用する。
- R2 や Vercel の負荷・料金を不必要に増やさない。
- 現在の表示内容、デザイン、絞り込み、並べ替え、タブなどの機能を維持する。
- 表示されるデータや集計結果を変更しない。
- データ取得に失敗しても、ページ全体を崩さない。
- `npm run build` が成功し、TypeScript エラーを残さない。

## 最重要制約

UI 変更は禁止する。

この計画で変更してよいものは、原則としてデータ取得位置、初期 props、Server Component と Client Component の境界、キャッシュ設定、検証スクリプトのみとする。

変更してはいけないもの。

- デザイン
- レイアウト
- 色
- 余白
- フォント
- 表の見た目
- 列名
- 列順
- 初期並び順
- 表示文言
- タブ、絞り込み、並べ替え、リンク、ボタンの挙動
- 集計結果、丸め、順位付けルール

CSS、`className`、見た目に関わる DOM 構造は原則変更しない。UI 差分が出た場合は不合格とし、SEO 対応より先に差分を戻す。

## 現状で確認済みの重要ポイント

Next.js App Router 構成で、対象ページは `app/` 配下にある。

代表的に確認した課題。

- `app/page.tsx` は `TopPageRoot` に `seasonInitial={null}`、`weeklyInitial={null}` を渡している。
- `app/weekly-stats/page.tsx` も `weeklyInitial={null}` を渡している。
- `app/probable-pitchers/page.tsx` は予想先発タブを表示するが、初期データを渡していない。
- `app/standings/[year]/page.tsx` は順位表タブを表示するが、初期データを渡していない。
- `app/ranking/[year]/[league]/page.tsx` は `initialViewModel.rows: []` で、実データは Client 側取得。
- `app/ranking/pitching/[year]/[league]/page.tsx` も `initialViewModel.rows: []`。
- `app/teams/[teamCode]/[year]/batting/page.tsx` は `initialViewModel.rows: []`。
- `app/teams/[teamCode]/[year]/pitching/page.tsx` も同様の構成が想定される。
- `app/players/[playerId]/PlayerPageRoot.tsx` は `dynamic(..., { ssr: false })` で `PlayerPageClient` を読み込んでいるため、選手ページ全体が JavaScript 依存になりやすい。
- R2 表示データ取得の既存実装として `lib/ranking/fetchDisplayJsonServer.ts` がある。

## 対象ページ

優先対象。

- `/`
- `/weekly-stats`
- `/probable-pitchers`
- `/standings`
- `/standings/2026`
- `/ranking/2026/CL`
- `/ranking/2026/PL`
- `/ranking/pitching/2026/CL`
- `/ranking/pitching/2026/PL`
- `/ranking/weekly/[year]/[weekKey]/[league]`
- `/ranking/pitching/weekly/[year]/[weekKey]/[league]`
- `/teams/[teamCode]/[year]/batting`
- `/teams/[teamCode]/[year]/pitching`
- `/teams/[teamCode]/[year]/batting/weekly/[weekKey]`
- `/teams/[teamCode]/[year]/pitching/weekly/[weekKey]`
- `/players/[playerId]`

二次対象。

- `/mobile/players/[playerId]`
- 過年度のランキングページ
- 過年度の順位表ページ

## 実装方針

既存 UI コンポーネントを作り替えず、Server Component 側で初期表示に必要なデータだけを読み、既存 Client Component に `initialViewModel` または `initialPayload` として渡す。

Client 側の既存 fetch は、次の用途で維持する。

- 指標切替
- タブ切替
- 並べ替え
- 絞り込み
- 詳細データの後読み
- グラフ、オーバーレイ、対戦詳細など SEO 主要データではない部分

初期HTMLに入れるのは、初期表示で実際に画面へ出す主要データに限定する。全指標、全タブ、全選手、全詳細データをサーバーで一括取得しない。

## phase 1: UI凍結と基準取得

目的: UI 変更を確実に防ぐため、対応前の見た目とHTML状態を記録する。

やること。

- 主要ページの代表 URL を確定する。
- 対応前のスクリーンショットを保存する。
- 対応前の初期HTMLを保存する。
- JavaScript 無効時の表示状態を保存する。
- 表の列名、列順、初期並び順、表示件数を記録する。
- タブ、絞り込み、並べ替え、リンクの動作を確認する。

対象ファイル候補。

- 新規: `scripts/verify_initial_html_pages.mjs`
- 新規: `scripts/capture_ui_baseline.mjs`
- 既存: `package.json`

代表 URL 候補。

- `/`
- `/weekly-stats`
- `/probable-pitchers`
- `/standings`
- `/ranking/2026/CL`
- `/ranking/pitching/2026/PL`
- `/teams/G/2026/batting`
- `/teams/G/2026/pitching`
- `/players/[実在する代表選手ID]`

確認する文字列例。

- ランキング: `順位`, `選手`, `球団`, `OPS`, `打率`, `本塁打`
- 投手ランキング: `防御率`, `勝利`, `奪三振`, `WHIP`
- 順位表: `セ・リーグ`, `パ・リーグ`, `勝`, `敗`, `勝率`, `ゲーム差`
- 予想先発: `予想先発`, `投手`, `試合`
- 選手ページ: 選手名、球団名、プロフィール見出し、年度別成績見出し

完了条件。

- 対応前の基準スクリーンショットとHTMLが残っている。
- 以後の phase で UI 差分が出たか判定できる。

## phase 2: サーバー取得ローダーの整理

目的: R2 の表示用 JSON を Server Component から安全に読む共通経路を整える。

やること。

- `lib/ranking/fetchDisplayJsonServer.ts` の利用範囲を確認する。
- ランキング、週間ランキング、順位表、トップ、予想先発、選手ページで使うサーバー用ローダーを整理する。
- R2 直取得を優先する。
- ローカルでは既存の local / same-origin fallback を維持する。
- 本番で同一オリジン fallback が過剰に走らないようにする。
- 取得失敗時は `null` または空データを返す。
- 例外でページ全体を落とさない。
- 取得タイムアウトを短めに保つ。

対象ファイル候補。

- `lib/ranking/fetchDisplayJsonServer.ts`
- `lib/displayData/rankingsBaseUrl.ts`
- `lib/displayData/externalUrl.ts`
- `lib/displayData/sitePath.ts`
- `lib/standings/fetchStandingsJson.ts`
- `lib/topPage/loadTopPageTabDataServer.ts`
- 必要なら新規: `lib/seoInitialData/`

禁止事項。

- 全ページ共通で常に全データを取得する実装にしない。
- R2 取得失敗時に長時間待つ実装にしない。
- UI コンポーネントの見た目を変更しない。

完了条件。

- Server Component から必要データだけ取得できる。
- 取得失敗時も呼び出し側が安全に fallback できる。

## phase 3: ランキングページの初期HTML化

目的: 打撃・投手ランキングの初期HTMLに表データを含める。

対象ファイル。

- `app/ranking/[year]/[league]/page.tsx`
- `app/ranking/[year]/[league]/RankingPageClient.tsx`
- `app/ranking/pitching/[year]/[league]/page.tsx`
- `app/ranking/pitching/[year]/[league]/PitchingRankingPageClient.tsx`
- `lib/ranking/jsonLoader.ts`
- `lib/ranking/fetchDisplayJsonServer.ts`
- `lib/ranking/normalizeRankingRow.ts`

やること。

- `searchParams` の `sort` を読み、指定がなければ既存デフォルト指標を使う。
- 打撃はデフォルト `ops`、投手はデフォルト `era` を維持する。
- URL 指定指標またはデフォルト指標の JSON だけをサーバーで取得する。
- 取得した行を既存の形式に正規化する。
- `initialViewModel.rows` に取得済み行を入れる。
- Client Component 側は、初期表示では `initialViewModel.rows` を使う。
- 指標切替や並べ替え時の Client fetch は維持する。
- 取得失敗時は現状の空状態表示に寄せる。

初期HTMLに含めるもの。

- ページタイトル
- 指標名
- 表見出し
- 順位
- 選手名
- 球団名
- 成績数値

禁止事項。

- RankingTable の見た目を変更しない。
- 指標定義、順位計算、丸め処理を変更しない。
- 初期表示件数を変更しない。

検証。

- `/ranking/2026/CL`
- `/ranking/2026/PL`
- `/ranking/2026/CL?sort=avg`
- `/ranking/pitching/2026/CL`
- `/ranking/pitching/2026/PL?sort=whip`

完了条件。

- `view-source` 相当のHTMLに選手名と数値が含まれる。
- JavaScript 無効でも初期表が読める。
- JavaScript 有効時の UI と操作感が対応前と同じ。

## phase 4: 週間ランキングページの初期HTML化

目的: 週間ランキングの初期HTMLに表データを含める。

対象ファイル。

- `app/ranking/weekly/[year]/[weekKey]/[league]/page.tsx`
- `app/ranking/weekly/[year]/[weekKey]/[league]/WeeklyRankingPageClient.tsx`
- `app/ranking/pitching/weekly/[year]/[weekKey]/[league]/page.tsx`
- `app/ranking/pitching/weekly/[year]/[weekKey]/[league]/WeeklyPitchingRankingPageClient.tsx`
- `lib/ranking/weeklyRankingPageParams.ts`
- `lib/ranking/weeklyRankingsWeekKeys.ts`
- `lib/topPage/weeklyCurrentWeekMeta.ts`

やること。

- `year`、`weekKey`、`league`、`sort` をサーバーで解決する。
- 指定週・指定指標の JSON だけをサーバーで取得する。
- `initialViewModel.rows` に初期行を入れる。
- 現在週へのリダイレクトや weekKey 解決の既存挙動は維持する。
- Client 側の指標切替、週切替、並べ替えは維持する。

初期HTMLに含めるもの。

- 週ラベル
- リーグ名
- 表見出し
- 順位
- 選手名
- 球団名
- 週間成績数値

禁止事項。

- 週間集計ロジックを変更しない。
- weekKey の意味を変更しない。
- UI のタブやナビゲーションを変更しない。

検証。

- `/ranking/weekly/2026/[currentWeekKey]/CL`
- `/ranking/weekly/2026/[currentWeekKey]/PL`
- `/ranking/pitching/weekly/2026/[currentWeekKey]/CL`
- `/ranking/pitching/weekly/2026/[currentWeekKey]/PL`

完了条件。

- 初期HTMLに週間ランキング表の主要データが含まれる。
- JavaScript 無効でも初期表が読める。
- JavaScript 有効時の操作が変わらない。

## phase 5: 球団ページの初期HTML化

目的: 球団別打撃・投手・週間ページの初期HTMLに、チーム内ランキング表を含める。

対象ファイル。

- `app/teams/[teamCode]/[year]/batting/page.tsx`
- `app/teams/[teamCode]/[year]/batting/TeamBattingRankingPageClient.tsx`
- `app/teams/[teamCode]/[year]/pitching/page.tsx`
- `app/teams/[teamCode]/[year]/pitching/TeamPitchingRankingPageClient.tsx`
- `app/teams/[teamCode]/[year]/batting/weekly/[weekKey]/page.tsx`
- `app/teams/[teamCode]/[year]/pitching/weekly/[weekKey]/page.tsx`
- `lib/teamPage/teamPageParams.ts`
- `lib/teamPage/teamPageHref.ts`

やること。

- サーバーでリーグ全体の対象指標 JSON を取得する。
- 既存の teamCode 解決に従って、対象球団の行だけに絞る。
- `initialViewModel.rows` に球団内の初期行を入れる。
- 球団表示名、年度、リーグ、タブ種別は既存ロジックを維持する。
- Client 側の指標切替、並べ替え、週間移動は維持する。

初期HTMLに含めるもの。

- 球団名
- 年度
- 表見出し
- 選手名
- 順位またはチーム内順位相当の表示
- 成績数値

禁止事項。

- 球団コード解決、球団名表示、チームカラーを変更しない。
- 表の列や見た目を変更しない。

検証。

- `/teams/G/2026/batting`
- `/teams/G/2026/pitching`
- `/teams/H/2026/batting`
- `/teams/H/2026/pitching`
- 週間ページは current week の代表 URL

完了条件。

- 初期HTMLに球団ページの主要表データが含まれる。
- UI 差分がない。

## phase 6: トップページと今週ページの初期HTML化

目的: トップページと今週ページの主要ランキングブロックを初期HTMLに含める。

対象ファイル。

- `app/page.tsx`
- `app/weekly-stats/page.tsx`
- `app/components/top/TopPageRoutePage.tsx`
- `app/components/top/TopPageRoot.tsx`
- `app/components/top/TopPageClient.tsx`
- `app/components/top/TopPageSeasonTabContent.tsx`
- `app/components/top/TopPageWeeklyTabContent.tsx`
- `lib/topPage/loadTopPageTabDataServer.ts`
- `lib/topPage/sanitizeRscPayload.ts`

やること。

- `/` で `loadSeasonTabPayloadServer(2026)` を呼ぶ。
- `/weekly-stats` で `loadWeeklyTabPayloadServer(2026)` を呼ぶ。
- 本番でも初期HTML対象ページでは必要最小限の先読みを許可する。
- 既存の `seasonInitial`、`weeklyInitial` の受け渡しを活用する。
- 先読み失敗時は現状通り Client 側取得に fallback する。
- トップページで初回表示しないタブの全量先読みはしない。

初期HTMLに含めるもの。

- トップページ: 主要ランキング見出し、選手名、球団名、成績数値
- 今週ページ: 週ラベル、選手名、球団名、週間成績数値

禁止事項。

- トップページのタブ配置、カード配置、表現を変更しない。
- モバイル/デスクトップの切替 UI を変更しない。
- RSS/ニュース領域の挙動を巻き込まない。

検証。

- `/`
- `/weekly-stats`
- モバイル幅
- デスクトップ幅

完了条件。

- 初期HTMLにトップ/今週の主要データが含まれる。
- Client fallback も維持される。
- UI 差分がない。

## phase 7: 順位表ページの初期HTML化

目的: 順位表ページの初期HTMLに、セ・リーグ/パ・リーグの順位表を含める。

対象ファイル。

- `app/standings/page.tsx`
- `app/standings/[year]/page.tsx`
- `app/components/top/TopPageStandingsTab.tsx`
- `lib/standings/fetchStandingsJson.ts`
- `lib/standings/types.ts`
- `lib/standings/formatStandingsCell.ts`
- `lib/standings/metricColumns.ts`

やること。

- Client 用 `fetchStandingsJson` と同等のデータ取得をサーバー用に分離または共通化する。
- `CL` と `PL` の順位表 JSON をサーバーで取得する。
- `TopPageStandingsTab` に `initialPayload` を渡せるようにする。
- 初期表示では `initialPayload` を使う。
- Client 側の再取得・年度切替・表示ロジックは維持する。
- 取得失敗時は既存のエラー/空状態表示に寄せる。

初期HTMLに含めるもの。

- セ・リーグ順位表
- パ・リーグ順位表
- 球団名
- 順位
- 勝敗
- 勝率
- ゲーム差
- 表見出し

禁止事項。

- 順位表の列、表示順、色、幅を変更しない。
- 指標の計算や丸めを変更しない。

検証。

- `/standings`
- `/standings/2026`

完了条件。

- 初期HTMLに順位表の主要データが含まれる。
- JavaScript 無効でも順位表が読める。
- UI 差分がない。

## phase 8: 予想先発ページの初期HTML化

目的: 予想先発ページの初期HTMLに、試合カード、球団名、予想先発投手名、主要成績を含める。

対象ファイル。

- `app/probable-pitchers/page.tsx`
- `app/components/top/TopPageProbablesTab.tsx`
- `app/components/top/ProbablesPitchDataOverlay.tsx`
- `lib/topPage/loadTopPageTabDataServer.ts`
- `lib/displayData/proxy.ts`
- 予想先発関連の build/shared ファイル

やること。

- R2 の `top-probables` 系 JSON の保存場所と型を確認する。
- サーバーで予想先発の初期 payload を取得する。
- `TopPageProbablesTab` に `initialPayload` を渡せるようにする。
- 初期表示分の試合カード・投手名・球団名・主要成績をHTMLに含める。
- 詳細オーバーレイや投球データの追加取得は Client 側のまま維持する。
- 取得失敗時は既存の未生成/エラー表示に寄せる。

初期HTMLに含めるもの。

- 予想先発見出し
- 試合カード
- 球団名
- 投手名
- 主要な投手成績

禁止事項。

- 予想先発カードのデザインを変更しない。
- オーバーレイ、ホバー、詳細表示の挙動を変更しない。
- 予想先発の生成ロジックを変更しない。

検証。

- `/probable-pitchers`

完了条件。

- 初期HTMLに予想先発の主要データが含まれる。
- JavaScript 無効でも主要データが読める。
- UI 差分がない。

## phase 9: 選手ページの初期HTML化

目的: 選手ページの主要プロフィールと主要成績を初期HTMLに含める。

対象ファイル。

- `app/players/[playerId]/[[...rest]]/page.tsx`
- `app/players/[playerId]/PlayerPageRoot.tsx`
- `app/players/[playerId]/PlayerPageClient.tsx`
- `app/players/[playerId]/playerRouteServer.ts`
- `app/players/[playerId]/playerPageShared.ts`
- `app/players/[playerId]/PlayerPageProfileTableBlock.tsx`
- `app/players/[playerId]/PlayerPageCareerSection.tsx`
- `app/players/[playerId]/PlayerPagePitcherSeasonBody.tsx`
- `app/players/[playerId]/PlayerPageCatcherSeasonBody.tsx`
- `lib/playerCareerMergedDisplay.ts`
- 選手プロフィール・成績 API Route と対応ローダー

やること。

- `ssr: false` がページ全体にかかっている現状を分解する。
- Server Component 側で、選手名、ローマ字名、プロフィール、主要成績を取得する。
- 初期HTML用の静的ブロックを追加するか、既存表示コンポーネントを Server でも使えるように分離する。
- Client Component は詳細タブ、グラフ、対戦別、球種、ゲームログなどの後読み用途として維持する。
- 初期HTML用ブロックと Client 側表示が二重表示にならないようにする。
- ただし CSS や見た目は変えない。
- 取得失敗時は選手名と最低限のエラー/空状態を表示する。

初期HTMLに含めるもの。

- 選手名
- ローマ字名
- 球団名
- プロフィール項目
- 年度別主要成績
- 通算成績表の見出し
- 通算成績の数値

禁止事項。

- 選手ページのタブ構造を変更しない。
- グラフ、詳細表、オーバーレイの見た目を変更しない。
- 成績の集計・丸め・表示順を変更しない。
- ページ全体のリデザインをしない。

注意点。

- この phase が最も重い。
- 最初から全タブを SSR 化しない。
- 主要プロフィールと主要成績だけを初期HTML化する。
- UI 差分が出やすいため、小さく分けて検証する。

検証。

- 代表的な野手ページ
- 代表的な投手ページ
- 捕手ページ
- スラッグ URL
- 旧 ID URL
- モバイル選手ページは二次対象として確認

完了条件。

- 初期HTMLに選手ページの主要データが含まれる。
- JavaScript 無効でも主要プロフィールと主要成績が読める。
- JavaScript 有効時の UI 差分がない。

## phase 10: 読み込み速度と負荷の確認

目的: SEO 対応によって読み込み速度、R2 負荷、Vercel 負荷を悪化させない。

やること。

- 各ページでサーバー初期取得する JSON 数を記録する。
- 1ページあたりの R2 fetch 数を確認する。
- 初期HTMLに入れるデータ量を確認する。
- 同じ JSON をページ内で重複取得していないか確認する。
- `Promise.all` で並列化できる箇所は並列化する。
- ただし不要な JSON の先読みはしない。
- `revalidate` または fetch cache 設定をページ別に調整する。
- R2 取得 timeout を確認する。

キャッシュ目安。

- 通常ランキング: 300秒から3600秒
- 週間ランキング: 300秒
- 順位表: 300秒
- 予想先発: 300秒から900秒
- 選手ページ主要データ: 600秒から3600秒

禁止事項。

- 全指標を一括取得しない。
- 全タブを一括取得しない。
- 選手ページで全詳細データを一括取得しない。
- R2 失敗時に長い待ち時間を発生させない。

完了条件。

- 初期表示に必要なデータだけを取得している。
- 代表ページで体感速度の悪化がない。
- R2/Vercel への不要な負荷増加がない。

## phase 11: HTML・JavaScript無効・Google相当検証

目的: クローラーが読める状態を機械的に確認する。

やること。

- `npm run build` を実行する。
- TypeScript エラー確認のため、必要に応じて `npx tsc --noEmit` を実行する。
- ローカル production 起動で代表 URL を取得する。
- 初期HTMLに主要文字列が含まれるか確認する。
- JavaScript 無効のブラウザで主要データが見えるか確認する。
- 対応前後スクリーンショットを比較する。
- タブ、絞り込み、並べ替え、リンクの動作を確認する。

検証スクリプト候補。

- 新規: `scripts/verify_initial_html_pages.mjs`
- 新規: `scripts/verify_no_js_major_content.mjs`
- 新規または既存拡張: Playwright スクリーンショット比較

HTML確認観点。

- `<table>` または表相当の見出しが含まれる。
- 選手名が含まれる。
- 球団名が含まれる。
- 順位が含まれる。
- 成績数値が含まれる。
- エラー時もページ全体の shell が崩れない。

完了条件。

- `npm run build` が成功する。
- TypeScript エラーが残らない。
- 代表ページの初期HTMLに主要データが含まれる。
- JavaScript 無効でも主要データが読める。
- UI 差分がない。

## phase 12: 完了報告

目的: 実装後に、依頼された観点を漏れなく報告する。

報告する内容。

- 改善したページ
- 初期HTMLに主要データが含まれていることの確認結果
- JavaScript 無効時の確認結果
- Google から読み取れない可能性が残っているページ
- 表示や機能への影響
- UI変更が発生していないことの確認結果
- 読み込み速度への影響
- R2 や Vercel の負荷・キャッシュに関する懸念点
- `npm run build` の結果
- TypeScript 確認結果

残課題がある場合の報告ルール。

- ページ単位で残課題を明記する。
- なぜ残したかを明記する。
- Google から読めない可能性がある範囲を明記する。
- UI 変更を避けるために後回しにした作業があれば明記する。

## 作業時チェックリスト

各 phase の作業前に確認する。

- UI を変更しない作業か。
- 初期HTMLに必要な主要データだけを追加する作業か。
- 既存の集計結果や表示順を変えないか。
- R2 への取得数が増えすぎないか。
- データ取得失敗時にページ全体が壊れないか。

各 phase の作業後に確認する。

- 対象ページの初期HTMLに主要データが入ったか。
- JavaScript 無効でも主要データが読めるか。
- JavaScript 有効時のUIが変わっていないか。
- 並べ替え、絞り込み、タブが動くか。
- `npm run build` に悪影響がないか。

## 実装優先順位

1. phase 1
2. phase 2
3. phase 3
4. phase 4
5. phase 5
6. phase 6
7. phase 7
8. phase 8
9. phase 10
10. phase 11
11. phase 9
12. phase 10 再確認
13. phase 11 再確認
14. phase 12

選手ページは影響範囲が大きいため、ランキング、球団、トップ、順位表、予想先発の対応後に着手する。

## 想定リスクと対策

### リスク: 初期表示が遅くなる

対策。

- 初期表示に必要な JSON だけ読む。
- 全指標、全タブ、全詳細データを読まない。
- fetch timeout を設定する。
- キャッシュを使う。

### リスク: UI 差分が出る

対策。

- CSS と className を変更しない。
- 既存表示コンポーネントを再利用する。
- スクリーンショット比較を行う。
- 差分が出たらその phase の実装を修正する。

### リスク: データの二重取得が増える

対策。

- 初期 props がある場合、Client 側は初回 fetch を抑制する。
- 指標切替や詳細表示時のみ Client fetch する。

### リスク: R2 障害時にページが重くなる

対策。

- 短い timeout を使う。
- 本番で同一オリジン fallback を過剰に走らせない。
- 失敗時は空状態に早く落とす。

### リスク: TypeScript エラーを build が隠す

現状 `next.config.mjs` に `typescript.ignoreBuildErrors: true` があるため、`npm run build` だけでは型エラーを見逃す可能性がある。

対策。

- `npx tsc --noEmit` を検証に追加する。
- 可能なら後続で `ignoreBuildErrors` の扱いも別計画で見直す。

