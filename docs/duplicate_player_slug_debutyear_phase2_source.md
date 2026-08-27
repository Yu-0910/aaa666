# 重複選手URL変更 `slug-debutyear` Phase 2 `debutYear` ソース確定

実施日: 2026年8月27日

目的: URL に使う `debutYear` の意味と取得元を固定する。

## 結論

- `debutYear` は **NPB 一軍成績が最初に現れる年度** とする
- 主ソースは `_data/derived/player_profile/career_from_master/{npbPlayerId}.json`
- 具体的には `career_batting.rows[].year` と `career_pitching.rows[].year` の **最小年度** を `debutYear` とする
- `profile.pro_debut_raw` は `debutYear` ソースとして採用しない

## 候補比較

### 候補 A: `career_from_master` の最小年度

内容:

- `career_batting.rows` または `career_pitching.rows` に入っている年度別成績の最小 `year`

長所:

- `slug-debutyear` 対象 187 件すべてで取得できた
- 実際に一軍成績が存在する年度を使える
- URL用途として自然
- historical 選手にも広く揃っている

短所:

- 厳密には「プロ入り年」ではなく「一軍成績が最初にある年」
- CSV に欠損があると年が遅れる可能性はある

評価:

- 今回の用途では最適

### 候補 B: `profile.pro_debut_raw`

内容:

- `profile_npb` / `merged` 内の `pro_debut_raw`

実データ上の確認結果:

- 対象 187 件中、年が取れたのは 1 件だけ
- その 1 件も `2021年育成選手ドラフト4位` であり、初出場年ではなかった
- `career_from_master` の 2025 と不一致だった

長所:

- 文言次第では「入団」「ドラフト」情報を拾える

短所:

- historical でほぼ空
- `初出場年` ではなく `ドラフト年` `入団年` が入る
- URL用途の year として意味がずれる

評価:

- 今回は不採用

## 実測結果

- 対象総数: 187
- `career_from_master` で `debutYear` 取得可: 187
- `profile.pro_debut_raw` で年取得可: 1
- 両方取得可: 1
- 両者不一致: 1
- 両方空: 0

### 不一致サンプル

- `21925155` / 笹原 操希
  - `career_from_master` 最小年度: 2025
  - `pro_debut_raw`: `2021年育成選手ドラフト4位`

所見:

- `pro_debut_raw` は初出場年ではなく、プロ入り関連の説明文
- URL の `debutYear` に使うと、ユーザーが期待する年とずれる

## サンプル確認

### `11413869` / 山本 幸二

- ファイル: `_data/derived/player_profile/career_from_master/11413869.json`
- `career_batting.rows[0].year = 1984`
- よって `debutYear = 1984`

### `71773865` / 田中 昌宏

- ファイル: `_data/derived/player_profile/career_from_master/71773865.json`
- 最初の年度は 1982
- よって `debutYear = 1982`

### `21925155` / 笹原 操希

- ファイル: `_data/derived/player_profile/career_from_master/21925155.json`
- 最初の年度は 2025
- `pro_debut_raw` の 2021 とは一致しない

## 定義

本計画における `debutYear` は、次の定義で固定する。

- `career_batting.rows` と `career_pitching.rows` の両方を対象にする
- 存在する `year` をすべて集める
- 最小の年を `debutYear` とする
- batting / pitching の片方しかなくても問題ない

疑似ルール:

- batting 年度あり、pitching 年度なし → batting 最小年
- batting 年度なし、pitching 年度あり → pitching 最小年
- 両方あり → 両者をまとめた最小年

## 方針判断

- `slug-debutyear` の year は **入団年** ではなく **一軍実績の初年度** とする
- 理由は、ユーザーに見える URL として自然であり、かつ historical を含めて最も安定して取得できるため
- 今後 `初出場年` という言葉を使う場合も、実装上は「一軍成績最初の年度」と説明可能な範囲で扱う

## Phase 3 へ持ち越す論点

- `slug-debutyear` を生成した結果、同年重複が残るか
- roster と historical に同一 `npbPlayerId` がある 11 グループを移行対象に含めるか
- 旧 `-npbPlayerId` URL を後方互換としてどこまで残すか
