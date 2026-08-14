# Unknown Player Resolution Procedure

新一括取得で、2026名簿・Yahoo/NPB対応表・既存個人ページ解決のどれにも当たらない選手を見つけた場合の標準手続き。

## 基本方針

- 新一括取得本体は、未知選手を深追いせず最後まで走り切る。
- 1回目公開では、未知選手は取得データ上の名前だけを表示し、個人ページリンクは付けない。
- 2回目公開と公開確認が終わった後、独立した未知選手手続きスクリプトを実行する。
- 自動で確定できる情報は収集し、確信度が低いものはレビュー対象としてレポートに残す。

## 種別

### A. 完全新規選手

例: 西舘 昂汰のように、NPB公式個人ページはあるが、サイト側の2026名簿・slug・プロフィール派生・Yahoo/NPB対応に未登録の選手。

必要な処置:

1. 出現元を記録する。
   - gameId
   - 日付
   - チーム
   - 名前
   - Yahoo ID
   - 打者/投手/捕手などの出現区分
2. NPB公式IDを確定する。
   - Yahoo IDから既存bridge/full index/manual mapで解決できるか確認
   - 解決できない場合は、NPB公式ページ・球団別名簿・選手検索で候補を作る
3. NPB公式個人ページからプロフィール表とローマ字を取得する。
   - `_data/derived/npb_player_meta/{npb_player_id}.json`
   - `_data/derived/player_profile/merged/npb_{npb_player_id}.json`
4. 2026名簿とURL解決用データを更新する。
   - `_data/npb_roster_2026.csv`
   - `lib/currentRosterPlayerEntries.ts`
   - `lib/currentRosterPlayerSlugs.ts`
   - `lib/yahooNpbBatterIdMap.manual.ts` または bridge CSV
5. 個人ページ用の今季成績・詳細成績を再生成する。
   - 打者: phase11, phase13, phase15, phase16, phase17, phase30, phase33
   - 投手: phase:pitcher-poc1, phase7, phase14, phase20, phase25
   - 捕手: phase22, phase23, phase24, phase25, phase26
6. 表示データを再生成・公開する。
   - ranking / team / top leaders
   - 投手の場合は top-probables（予想投手タブ）も再生成し、予想投手名が個人ページへリンクすることを確認する
   - derived JSON
   - R2 upload
   - production verify

### B. 既存個人ページあり・今季名簿不在

例: 小笠原慎之介のように、過去所属やOB扱いの個人ページはあるが、2026現在所属の選手として扱えていない選手。

必要な処置:

1. 既存slugと既存NPB IDを特定する。
   - `historicalPlayerSlugOverrides`
   - 既存 `/players/{slug}`
   - NPB公式ID
2. 同一人物の重複ページを作らない。
   - 既存slugを正とし、2026名簿・現在所属・Yahoo ID対応を既存slugに寄せる。
3. 2026名簿へ現在所属として追加または更新する。
   - チーム変更、支配下復帰、トレード移籍を反映
4. 既存個人ページに今季タブを追加する。
   - 通算成績タブのみで止めず、通常の2026名簿選手と同じタブ構成にする。
5. チームページ・ランキングページ・トップページのリンク先を既存slugへ統一する。
   - 投手の場合は、予想投手タブの投手名も既存slug/NPB IDへ統一してリンクさせる。
   - `phase36_build_top_probables.ts` は予想投手名を `resolvePitcherFromRoster()` で2026名簿に当て、`pitcherNpbId` / `pitcherPublicId` を JSON に持たせる。
   - `TopPageProbablesTab.tsx` はその ID または名前/ローマ字から `playerPageHref()` を作るため、名簿・slug・Yahoo/NPB対応を更新した後に top-probables を再生成すれば名前リンクが付く。

## 自動実行の境界

自動で反映してよい条件:

- NPB IDが一意に確定している
- Yahoo IDとの対応が一意に確定している
- 同姓同名・同一短縮名の衝突がない
- 既存slugがある場合、同一人物である根拠がある

レビューに回す条件:

- NPB ID候補が複数ある
- Yahoo IDが空、または別選手に見える
- 既存個人ページと現在所属の紐付けが曖昧
- 外国人名・登録名・短縮ローマ字が衝突する
- チームが出現元と名簿で矛盾する

## パイプライン内の位置

`run_daily_npb_pipeline_v2.mjs` では以下の順で実行する。

1. 取得
2. 派生生成
3. 1回目公開
4. full派生生成
5. 2回目公開
6. 公開確認
7. `scripts/resolve_unknown_players_after_publish.ts`

この手続きは2回目公開後に開始する。1回目公開前には未知選手の解決で処理を止めない。
