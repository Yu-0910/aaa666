# phase 10: 読み込み速度と負荷の確認

作成日: 2026-08-05

## 目的

AdSense 対応で追加した初期HTML化や内部整理によって、R2、Vercel、ローカル表示に過剰な負荷が増えていないかを確認する。

## 確認した事実

- `/ranking/[year]/[league]` と `/ranking/pitching/[year]/[league]` は、phase 7 を戻したため、現時点ではサーバー側でランキング行データを先読みしていない。
- `/probable-pitchers` は、現時点ではサーバー側で予想先発 payload を先読みしていない。
- `/` と `/weekly-stats` は `TopPageRoutePage` 経由で初期 payload を読む設計だが、本番 Vercel production では `canPreload2026TabDataOnServer()` により先読みを止める設計になっている。
- phase 9 で追加した選手ページの初期HTMLは、`player_profile/merged` の選手プロフィールJSONを読む。
- phase 9 の初期HTMLは `<noscript>` 内に出しているため、JavaScript有効時の通常UIには表示差分を出さない。
- 選手ページの初期HTMLでは、全タブ・対戦別・球種・ゲームログなどの詳細データは読んでいない。

## phase 10 で行った軽量化

`lib/playerProfileMergedServer.ts` から、初期HTMLで使っていない次の追加取得を外した。

- FA推定データの取得
- 非名簿選手向け英字名補完 meta の取得

これにより、選手ページの初期HTML用サーバー取得は基本的に次の1系統に絞った。

- `_data/derived/player_profile/merged/npb_{id}.json`

## 測定結果

ローカルで `loadPlayerProfileMergedForInitialHtml()` を5選手に対して測定した。

| playerId | 結果 | 時間 | 打撃行 | 投手行 |
|---|---:|---:|---:|---:|
| 01005134 | 取得成功 | 294ms | 4 | 4 |
| 01005137 | 取得成功 | 4ms | 13 | 13 |
| 01005157 | 取得成功 | 5ms | 2 | 2 |
| 01005159 | 取得成功 | 3ms | 2 | 0 |
| 01105134 | 取得成功 | 4ms | 6 | 6 |

初回だけファイル読み込みやモジュール初期化で時間がかかり、以降は数msだった。

## 取得数の見積もり

| ページ種別 | サーバー初期取得 | 負荷評価 |
|---|---:|---|
| トップ `/` | 本番では原則なし | 小 |
| 今週 `/weekly-stats` | 本番では原則なし | 小 |
| 予想先発 `/probable-pitchers` | なし | 小 |
| 順位表 `/standings` | 現時点ではなし | 小 |
| 打撃ランキング | 現時点では行データなし | 小 |
| 投手ランキング | 現時点では行データなし | 小 |
| 選手基本ページ | 主要プロフィールJSON 1件 | 小から中 |

## 残っているリスク

- `lib/derived/fetchDerivedJsonServer.ts` は汎用ローダーとして `cache: "no-store"` を使っている。API Route でも使われているため、ここを全体的にキャッシュ化するのは影響範囲が大きい。
- 選手ページ本体の `PlayerPageClient.tsx` は非常に大きく、ローカル dev server では `/players/...` の初回 webpack コンパイルが長時間終わらない状態が確認された。
- この長時間コンパイルは本番の通常レスポンス速度とは別問題だが、開発時の検証を難しくしている。
- phase 7 を戻しているため、ランキング・順位表・予想先発の初期HTML化によるR2負荷増加は現時点では発生していない。

## 判断

phase 10 時点では、AdSense対応によって本番R2/Vercel負荷が大きく増える変更は確認されなかった。

特に、phase 9 の選手ページ初期HTML化は、詳細タブを一括取得せず、プロフィールJSON 1件に限定したため、負荷は許容範囲と判断する。

## 今は変更しない方がよいもの

- `fetchDerivedJsonServer()` 全体のキャッシュ方針。
- 全ランキング・全指標のサーバー一括取得。
- 選手ページの全タブSSR化。
- `PlayerPageClient.tsx` の大規模分割。

これらは効果より作業負担と副作用が大きい。

## 次に確認すべきこと

- phase 11 で `npm run build` を実行する。
- phase 11 で代表ページのHTMLを取得し、初期HTMLに主要文字列が含まれるか確認する。
- 本番デプロイ後に、Vercel の Function Duration と R2 リクエスト数を確認する。
- Search Console の公開URLテストで、選手基本ページのHTML/スクリーンショットを再確認する。
