# Top Probables Refresh Runbook

トップ「予想投手」タブの更新は、次回から以下を使う。

```powershell
npm run probables:refresh:2026
```

本番へ上げずにローカル生成だけ確認する場合:

```powershell
npm run probables:refresh:2026:no-upload
```

実行予定コマンドだけ確認する場合:

```powershell
npm run probables:refresh:2026:dry
```

## 含まれる処理

1. 1回目pushに必要な情報だけ生成
   - 野手基本成績 `player_season_batting`
   - 投手基本成績 `player_season_pitching_poc`
   - Yahoo投手index
   - NPB英字名
   - 打撃ランキング
   - 投手ランキング
   - 週間ランキング
   - 順位表
2. R2 反映 1回目
   - `rankings`
   - `standings`
   - チームページ（ランキング/順位表JSONをチームで絞り込み）
   - 選手ページ基本成績タブ
     - `player_season_batting`
     - `player_season_pitching_poc`
3. 2回目pushに必要な情報を生成
   - 野手文脈/状況/カウント/期間
   - 投手期間、投手球種、ゾーン
   - 捕手系派生
   - 対戦成績、野手球団別配球
   - Yahoo/NPB full index
   - 通算/週間トップリーダー
4. Sporting News のローテーション取得
5. Sportsnavi の未来日程取得
6. Yahoo! 日程ページから翌日の予告先発だけを取得
7. 予想投手 JSON の生成
8. ローカル検証
   - 短縮名が残っていないか
   - NPB ID が入っているか
   - 予想タブ用の成績欄が入っているか
9. R2 反映 2回目
   - 残り詳細成績派生
   - `top-leaders`
   - `top-probables`

`top-probables`（予想先発タブ本体）は2回目のpushで反映する。これに合わせて、Sporting News / Sportsnavi / Yahoo! の予想先発情報取得も後ろ側に置く。

## 画面側・生成側に移植済みの方針

- 以前の稼働方針どおり、Sporting News のローテーションを基本ソースに使う。
- 翌日の予想先発だけ、Yahoo! のいつもの日程ページから予告先発を取得して優先する。
- 当日分や翌日以外は Sporting News ローテーションを使う。
- `竹丸` / `伊藤将` / `松本健` / `ロング` などの短縮名は、球団と投手ポジションでロスター照合し、フルネームと NPB ID に補正する。
- 予想タブの日本語名表示はフルネームにする。
- 英字名は `/api/roman-names/{year}/{league}` のロスター由来マップと、NPB ID キーで解決する。
- 選手リンクは NPB ID を優先し、成績ページに届くリンクにする。
- 投手成績表示は `player_season_pitching_poc` を再生成してから `top-probables` を作る。

## 警告の見方

`probables:refresh:2026` は最後に以下の警告を出すことがある。

- `フルネーム未解決の可能性`: 予想元の名前がロスターに解決できていない。
- `NPB IDなし`: 球団不一致、移籍未反映、名簿未登録など。誤リンク防止のためIDを付けない。
- `成績欄なし`: 投手PoCがない、または当年登板集計がない。

警告が出てもアップロードは止めない。誤リンクを避けるため、IDなしは手動確認対象にする。
