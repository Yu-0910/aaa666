# AdSense low value content improvement plan

作成日: 2026-08-05

対象サイト: Short-Stop（https://short-stop.jp/）

目的: Google AdSense の「有用性の低いコンテンツ」判定に対して、再審査前に実施すべき修正を時系列の phase で整理する。

## 調査で確認できた事実

- 公開サイトの `/robots.txt` は `200` で返るが、内容は robots.txt ではなく通常の HTML だった。
- `public/robots.txt` と `app/robots.ts` は存在しない。
- 公開サイトの `/sitemap.xml` は `200 application/xml` で返る。
- XML サイトマップの URL は合計 29,525 件で、そのうち 29,513 件が `/players/...` 系だった。
- XML サイトマップ内のランキング URL は 2 件程度で、球団ページは含まれていなかった。
- サイトマップ内の選手ページを 40 件サンプル確認したところ、40 件すべて初期 HTML の本文量が 100 文字未満だった。
- 選手ページの本文 UI は `next/dynamic(..., { ssr: false })` によりクライアント側で描画されている。
- ランキングページも初期 view model の `rows` は空配列で、表データはクライアント側で JSON を取得している。
- `/weekly-stats`、`/probable-pitchers`、`/news`、`/standings` の canonical が実 URL ではなく `/npb-weekly-stats` などを指している。
- `/npb-weekly-stats` などの canonical 先は 404 ではなく、`app/[year]/page.tsx` に吸収されて `200` を返している。
- 代表的な公開 JSON は現在 `200` で取得できた。
- Google 検索のスニペットには、過去に `JSON 未配置` や `Failed to fetch ranking data: 404` がクロールされた痕跡があった。

## 推測

- AdSense からは、サイト全体に「本文が薄い選手派生ページ」が大量にあるように見えている可能性が高い。
- Search Console の公開 URL テストで JavaScript 描画後の主要コンテンツが見えていても、AdSense の品質判定では初期 HTML の薄さや大量の類似 URL がマイナスに働く可能性がある。
- R2 やクライアント側レンダリングが完全に原因というより、クロール対象 URL の設計、canonical、robots、サイトマップ、本文説明不足が複合的に効いている可能性が高い。
- 大規模な SSR 化より先に、Google に見せるページを絞り、重要ページの説明を厚くする方が費用対効果が高い。

## phase 1: robots.txt を正しく設置する

### 目的

Google にサイトマップの場所を明示し、基本的なクロール案内を正常化する。

### 変更範囲

- `public/robots.txt` を追加する、または `app/robots.ts` を追加する。

### 実装内容

- `User-agent: *`
- `Allow: /`
- `Sitemap: https://short-stop.jp/sitemap.xml`

### 効果

中。直接「有用性」を増やす修正ではないが、クロール導線の基本不備を解消できる。

### 作業負担

小。

### UI 変更

なし。

### リスク

小。誤って `Disallow` を入れないよう注意する。

## phase 2: canonical のズレを修正する

### 目的

Google に正式 URL を正しく伝え、存在しない意図しない URL へ評価が流れる状態を防ぐ。

### 変更範囲

- `app/components/top/topPageRouteConfig.ts`
- 必要に応じて `app/[year]/page.tsx`

### 実装内容

- `/weekly-stats` の canonical を `https://short-stop.jp/weekly-stats` に修正する。
- `/probable-pitchers` の canonical を `https://short-stop.jp/probable-pitchers` に修正する。
- `/news` の canonical を `https://short-stop.jp/news` に修正する。
- `/standings` の canonical を `https://short-stop.jp/standings` に修正する。
- `/npb-weekly-stats` など、現在 canonical 先として使われているが実体として運用しない URL は、必要なら正式 URL へリダイレクトする。

### 効果

高。重複・誤正規化・評価分散を減らせる。

### 作業負担

小から中。

### UI 変更

なし。

### リスク

小。既に外部から `/npb-*` にアクセスがある場合、リダイレクト設計だけ注意する。

## phase 3: XML サイトマップを再設計する

### 目的

Google に「重要で価値が高いページ」を優先的に発見させる。

### 変更範囲

- `app/sitemap.ts`
- 必要に応じてサイトマップ生成用の補助関数

### 実装内容

- 主要固定ページを維持する。
- 年度別トップページを含める。
- 年度別・リーグ別の打撃ランキングを含める。
- 年度別・リーグ別の投手ランキングを含める。
- 球団ページを含める。
- 捕手別成績ページを含める。
- 過去年度ページを、プルダウン依存ではなく sitemap から発見できるようにする。
- 選手ページは、まず基本ページだけに絞る。
- 選手派生ページ（`pitch`、`situation`、`matchup`、`vs-team`、`catcher`）は、十分なデータと本文があるものだけ sitemap に入れる。

### 効果

高。現在の「薄い選手派生ページ大量サイト」という見え方を改善できる。

### 作業負担

中。

### UI 変更

なし。

### リスク

中。sitemap から外したページは発見されにくくなる。ただしページ自体を削除するわけではない。

## phase 4: 薄い選手派生ページの index 方針を整理する

### 目的

低価値ページとして評価されやすい URL を index 対象から減らす。

### 変更範囲

- `app/players/[playerId]/playerRouteServer.ts`
- `app/sitemap.ts`
- `lib/playerPageTabUrlPhase2.ts`

### 実装内容

- 選手の基本ページは原則 index 対象として維持する。
- 派生ページは以下のいずれかに分類する。
  - 十分なデータと説明があるページ: index 対象
  - データはあるが本文が薄いページ: sitemap から除外
  - データが少ない、空、重複性が高いページ: `noindex, follow`
  - 基本ページとほぼ同じ内容のページ: canonical を基本ページへ寄せる
- 全選手に一律で全派生 URL を作る方針をやめる。

### 効果

高。AdSense の「低価値ページが大量にある」印象を減らせる。

### 作業負担

中。

### UI 変更

原則なし。

### リスク

中。検索流入を狙いたい派生ページまで noindex にしないよう、条件分岐が必要。

## phase 5: 主要ページに説明文と更新情報を追加する

### 目的

AdSense に「数字の一覧だけでなく、ユーザー向けの説明と独自性があるサイト」と伝える。

### 変更範囲

- トップページ
- 今週の成績ページ
- 予想先発ページ
- 順位表ページ
- 打撃ランキングページ
- 投手ランキングページ
- 球団ページ
- 捕手別成績ページ
- 過去年度ページ

### 実装内容

- ページ上部または下部に短い説明文を追加する。
- そのページで何が見られるかを書く。
- 集計対象を書く。
- 更新頻度または最終更新日を書く。
- 指標の意味を簡単に書く。
- Short-Stop 独自の見方を 1 から 3 文で書く。

### 効果

高。AdSense の「有用性」評価に直接効きやすい。

### 作業負担

中。

### UI 変更

あり。ただし小規模。短い説明ブロックを追加する程度。

### リスク

小。説明が長すぎるとデータベース型 UI の邪魔になるため、控えめに配置する。

## phase 6: 「サイトの楽しみ方」ページを追加する

### 目的

初めて来たユーザーと AdSense 審査者に、サイトの価値を短時間で伝える。

### 変更範囲

- 新規ページ例: `app/how-to-use/page.tsx`
- `app/sitemap.ts`
- `app/site-map/page.tsx`
- フッターまたはヘッダーのリンク

### 実装内容

- `app/how-to-use/page.tsx` を作成する。
- ページタイトルは「サイトの楽しみ方」とする。
- 本文を後から追加できる空の本文枠を用意する。
- 本文の詳細文言は、この phase では作り込まない。
- HTML サイトマップと XML サイトマップに新規ページを追加する。
- 必要に応じてフッターまたは主要導線にリンクを追加する。

### 効果

中から高。サイト全体の目的と独自性を伝えやすくなる。

### 作業負担

小。

### UI 変更

あり。新規ページ、タイトル、空の本文枠、導線追加のみ。

### リスク

小。本文が空のままだと AdSense 対策としては効果が弱いため、再審査前に人間側で文言を追加する。

## phase 7: 重要ページだけ初期 HTML を厚くする

### 目的

JavaScript 描画前でも、Google と AdSense に主要コンテンツの存在を伝える。

### 変更範囲

- `app/page.tsx`
- `app/weekly-stats/page.tsx`
- `app/probable-pitchers/page.tsx`
- `app/standings/page.tsx`
- `app/ranking/[year]/[league]/page.tsx`
- `app/ranking/pitching/[year]/[league]/page.tsx`
- 必要に応じて選手基本ページ

### 実装内容

- 全ページ SSR 化はしない。
- まずトップ、ランキング、予想先発、順位表、主要選手ページなどに限定する。
- 既に存在する `loadSeasonTabPayloadServer` や `loadWeeklyTabPayloadServer` の扱いを見直す。
- 初期 HTML に、見出し、説明文、代表的な上位データ、更新日を含める。
- 表全体の操作性は既存のクライアント UI を維持する。

### 効果

中から高。初期 HTML の薄さを補える。

### 作業負担

中から大。

### UI 変更

小から中。見た目はなるべく維持し、初期表示に意味のある本文を追加する。

### リスク

中。R2 取得遅延で本番レスポンスが遅くならないよう、対象ページを限定する必要がある。

## phase 8: 空ページ・重複ページ・エラーページの監査を定期化する

### 目的

再審査後も、薄い URL や JSON 欠損ページが増えないようにする。

### 変更範囲

- `scripts/` 配下に監査スクリプトを追加
- 必要に応じて CI または手動コマンドに追加

### 実装内容

- sitemap URL の件数を分類する。
- 公開 HTML の本文量が少ない URL を検出する。
- `200` なのに本文が空のページを検出する。
- 主要 JSON が 404 になっていないか確認する。
- canonical が実 URL と一致しているか確認する。
- robots.txt が正しい content-type と内容で返るか確認する。

### 効果

中。問題の再発防止に効く。

### 作業負担

中。

### UI 変更

なし。

### リスク

小。

## 再審査前の推奨順

1. phase 1: robots.txt を正しく設置する。
2. phase 2: canonical のズレを修正する。
3. phase 3: XML サイトマップを再設計する。
4. phase 4: 薄い選手派生ページの index 方針を整理する。
5. phase 5: 主要ページに説明文と更新情報を追加する。
6. phase 6: 「サイトの楽しみ方」ページを追加する。
7. phase 7: 重要ページだけ初期 HTML を厚くする。
8. phase 8: 監査を定期化する。

## 先にやらない方がよいこと

- 全ページを一気に SSR 化すること。
- 29,000 件以上の選手派生ページをすべて index 対象のまま改善しようとすること。
- デザインを大きく作り替えること。
- データが薄いページを広告掲載対象として無理に残すこと。

## 現時点で維持してよいもの

- R2 から公開 JSON を取得する構成。
- Next.js、React、TypeScript、Vercel の基本構成。
- クライアント側で表をソート・切り替えする UI。
- 運営者情報、お問い合わせ、プライバシーポリシー、免責事項、HTML サイトマップの設置。

## 人間側で確認が必要なこと

- AdSense に再申請する前に、広告掲載対象として残したいページ範囲。
- 選手派生ページを検索流入対象にしたいか、ユーザー導線用に限定したいか。
- 「サイトの楽しみ方」ページに書く運営方針、更新頻度、データ出典の表現。
- Search Console に送信している sitemap が最新の `/sitemap.xml` か。
- AdSense 管理画面で、問題 URL の例が表示されているか。
