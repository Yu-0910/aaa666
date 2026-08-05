# phase 11: HTML・JavaScript無効・Google相当検証

作成日: 2026-08-06

## 実行した検証

- `npm run build`
- `npx tsc --noEmit --pretty false`
- ローカル production server 起動
- 代表URLのHTML取得
- `robots.txt` と `sitemap.xml` の確認
- 選手ページ canonical slug の初期HTML確認
- `npm run audit:adsense` のローカル実行

## build 結果

`npm run build` は成功した。

確認できた主なログ。

- `validate-batting-bridge` は OK
- Next.js production build は成功
- 静的ページ生成は 90/90 で完了
- `/players/[playerId]/[[...rest]]` は Dynamic route として認識
- `/sitemap.xml`、`/robots.txt` 相当の確認対象も production server で応答

注意点。

- このプロジェクトは `next.config.mjs` 側で TypeScript validation を skip しているため、build 成功だけでは型エラーなしとは言えない。

## TypeScript 確認結果

`npx tsc --noEmit --pretty false` は失敗した。

ただし、失敗内容は今回の phase 9 から 11 の変更に限定されたものではなく、既存の広範囲な型エラーが大量に出ている。

主な既存エラー傾向。

- `.next/types/app/api/...` の Route Context 型不一致
- 既存 API Route の `params` 型が `Promise<T> | T` になっている箇所
- `vitest` 型不足
- 既存 scripts 配下の型エラー
- 既存 UI / 集計ロジックの型不一致

判断。

- `npm run build` は成功している。
- `tsc --noEmit` は現時点のリポジトリ全体の既存課題として失敗している。
- phase 11 完了報告では「型検査は未合格。既存エラー多数」と扱う。

## HTML取得結果

ローカル production server: `http://localhost:3000`

| URL | HTTP | HTML長 | 初期HTMLの状態 |
|---|---:|---:|---|
| `/` | 200 | 14,694 | 本文は薄い。phase 7を戻したため想定内 |
| `/weekly-stats` | 200 | 15,202 | 本文は薄い。phase 7を戻したため想定内 |
| `/probable-pitchers` | 200 | 15,179 | 本文は薄い。phase 8相当のSSRは未実施 |
| `/standings` | 200 | 15,141 | 本文は薄い。phase 7を戻したため想定内 |
| `/ranking/2026/PL` | 200 | 12,739 | 本文は薄い。phase 7を戻したため想定内 |
| `/ranking/pitching/2026/PL` | 200 | 12,939 | 本文は薄い。phase 7を戻したため想定内 |
| `/players/kouya-takahashi` | 200 | 18,974 | `<noscript>`、プロフィール、年度別成績、表、選手名を確認 |
| `/how-to-use` | 200 | 10,670 | 箱とタイトルのみ。本文は人間側で後入れ予定 |
| `/sitemap.xml` | 200 | 520,708 | sitemap 応答あり |
| `/robots.txt` | 200 | 67 | `User-agent` と `Sitemap` を確認 |

## 選手ページ確認

`/players/01005134` は、RSC payload 内で `/players/kouya-takahashi` への redirect digest を返していた。

canonical slug 側の `/players/kouya-takahashi` では、phase 9 の初期HTMLが出ていることを確認した。

確認項目。

- `<noscript>`: あり
- `プロフィール`: あり
- `年度別`: あり
- `<table>`: あり
- 選手名: あり

## sitemap / robots 確認

ローカル production の `/robots.txt` は正常。

- HTTP 200
- `text/plain`
- `User-agent` あり
- `Sitemap: https://short-stop.jp/sitemap.xml` あり

ローカル production の `/sitemap.xml` は正常に返った。

- `/how-to-use` を含む
- `/ranking/1994/CL` を含む
- 選手派生URLは含まない

監査スクリプト結果。

- sitemap 合計: 7,617
- ranking: 310
- players: 7,159
- playerTabs: 0
- teams: 48

## 監査スクリプトの注意点

`npm run audit:adsense -- --base-url=http://localhost:3000 --sample-size=10 --timeout-ms=10000` を実行した。

ローカル実行では canonical が `https://short-stop.jp/...` を返すため、`http://localhost:3000/...` との不一致 warning が出る。

これは本番canonicalとしては正しいため、ローカル検証上の warning と判断する。

また、sitemap 内URLは `https://short-stop.jp/...` の絶対URLなので、監査スクリプトの選手サンプルは本番サイトを見に行く。未デプロイのローカル変更は、この監査だけでは反映確認できない。

## JavaScript無効相当の確認

ブラウザでJavaScript無効のスクリーンショット比較までは未実施。

ただし、canonical slug の選手ページでは、HTML本文そのものに `<noscript>` のプロフィール・年度別成績表が含まれることを確認したため、JavaScript無効時に最低限の主要情報は読める状態になっている。

ランキング、順位表、予想先発は phase 7 を戻しているため、初期HTMLではまだ薄い。

## phase 11 の判断

完了と判断できるもの。

- `npm run build` 成功
- production server 起動成功
- `robots.txt` 正常
- `sitemap.xml` 正常
- 選手 canonical ページの初期HTML強化確認
- sitemap から選手派生URLが除外されていることを確認

未合格または残課題。

- `npx tsc --noEmit` は既存エラー多数で失敗
- ランキング、順位表、予想先発、トップ/今週ページの初期HTMLは薄い
- `/how-to-use` は箱だけなので本文追加が必要
- JavaScript無効のブラウザ視覚確認は未実施

## 次にやるべきこと

- phase 12 で、ここまでの完了報告と残課題を整理する。
- AdSense再審査前に `/how-to-use` の本文を人間側で追加する。
- phase 7 を戻したままにするなら、ランキング系の初期HTMLの薄さは「現時点では許容する残課題」として扱う。
- `tsc --noEmit` の既存エラー解消は、AdSense対応とは別タスクとして切り分ける。
