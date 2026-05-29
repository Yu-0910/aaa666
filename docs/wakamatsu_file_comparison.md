# 若松勉のデータが発見されたファイルの比較

## 調査結果

### 1. 1987-1989年でのみ発見されたファイル

**ディレクトリ**: `_data/master_csv_calculated/`

**ファイル例**:
- `batting_1987_CL_from_master.csv`
- `batting_1988_CL_from_master.csv`
- `batting_1989_CL_from_master.csv`

**特性**:
- **計算済みデータ**（指標が計算されている）
- **列数**: 66列
- **追加指標**: 
  - RC（得点創出）
  - XR（拡張得点）
  - 日本語列名（打率、安打、本塁打、打点、試合、打席、打数、単打、二塁打、三塁打、得点、出塁率、長打率、四球、敬遠、死球、三振、塁打、盗塁、盗塁死、犠打、犠飛、併殺打）
- **用途**: ランキング生成やUI表示に使用

**列の例**:
```
year,league,team,player_id,player_name_ja,player_name_en,G,PA,AB,R,H,2B,3B,HR,TB,RBI,SB,CS,SH,SF,BB,IBB,HBP,SO,GDP,AVG,OBP,SLG,OPS,1B,IsoP,IsoD,IOPS,BB%,K%,BB/K,BABIP,GPA,NOI,SecA,TA,打率,安打,本塁打,打点,試合,打席,打数,単打,二塁打,三塁打,得点,出塁率,長打率,四球,敬遠,死球,三振,塁打,盗塁,盗塁死,犠打,犠飛,併殺打,RC(nf3),XR
```

### 2. 1971年から1989年までの記録があったファイル

**ディレクトリ1**: `_data/master_csv/` (計算前の生データ)

**ディレクトリ2**: `_data/master_csv__import_1950_2024/` (インポートされた生データ)

**ファイル例**:
- `batting_1971_CL_from_master.csv` ～ `batting_1989_CL_from_master.csv`

**特性**:
- **生データまたはインポートデータ**（計算前のデータ）
- **列数**: 41列
- **基本指標のみ**: 
  - G, PA, AB, R, H, 2B, 3B, HR, TB, RBI, SB, CS, SH, SF, BB, IBB, HBP, SO, GDP
  - AVG, OBP, SLG, OPS
  - 1B, IsoP, IsoD, IOPS
  - BB%, K%, BB/K
  - BABIP, GPA, NOI, SecA, TA
- **用途**: 元データ、計算処理の入力として使用

**列の例**:
```
year,league,team,player_id,player_name_ja,player_name_en,G,PA,AB,R,H,2B,3B,HR,TB,RBI,SB,CS,SH,SF,BB,IBB,HBP,SO,GDP,AVG,OBP,SLG,OPS,1B,IsoP,IsoD,IOPS,BB%,K%,BB/K,BABIP,GPA,NOI,SecA,TA
```

### 重要な違い

| 項目 | master_csv_calculated | master_csv / master_csv__import_1950_2024 |
|------|----------------------|-------------------------------------------|
| **列数** | 66列 | 41列 |
| **計算済み指標** | ✅ あり（RC、XRなど） | ❌ なし |
| **日本語列名** | ✅ あり | ❌ なし |
| **用途** | ランキング生成・UI表示 | 元データ・計算処理の入力 |
| **データ範囲** | 1971-1989年（全年度） | 1971-1989年（全年度） |

### 注意事項

**実際には、`master_csv_calculated`にも1971-1989年のデータは存在します。**

最初に「1987-1989年でのみ発見された」という結果になったのは、以下の理由が考えられます：

1. **検索範囲が限られていた**: 最初の検索が特定のディレクトリや年度範囲に限定されていた
2. **head_limitの影響**: 検索結果が表示件数で制限されていた
3. **検索パターンの違い**: 異なる検索パターンを使用していた

### 結論

- **`master_csv_calculated/`**: 計算済みデータ（66列、RC/XRなどの追加指標あり）
- **`master_csv/` と `master_csv__import_1950_2024/`**: 生データ（41列、基本指標のみ）

両方とも若松勉の1971-1989年の記録を含んでいますが、データの形式と列数が異なります。



