/**
 * ランキングページ用の数値表示フォーマッタ
 * baseballdata.jp の表示ルールに準拠
 */

export type MetricFormat =
  | "decimal3_no0"
  | "percent1"
  | "decimal2"
  | "decimal3_with0"
  | "int"
  /** formatMap に無い指標用（ランキング UI 全体が落ちないようにする） */
  | "auto";

/**
 * 防御率（ERA）表示の統一ルール。
 * - 常に「整数部 + . + 小数2桁」
 * - 0 は "0.00"
 * - 欠損は "—"
 */
export function formatEra(value: unknown): string {
  if (value === null || value === undefined || value === "" || value === "-") return "—"
  const numValue = typeof value === "number" ? value : Number(value)
  if (Number.isNaN(numValue) || !Number.isFinite(numValue)) return "—"
  return numValue.toFixed(2)
}

/**
 * 指標ラベル（日本語）から表示フォーマットを取得
 * @param metricLabel 指標ラベル（例: "OPS", "打率", "BB%"）
 * @returns 表示フォーマット種別（未登録ラベルは `auto`）
 */
export function getMetricFormat(metricLabel: string): MetricFormat {
  // 完全マッピングテーブル
  const formatMap: Record<string, MetricFormat> = {
    // decimal3_no0
    'OPS': 'decimal3_no0',
    '打率': 'decimal3_no0',
    'AVG': 'decimal3_no0',
    '出塁率': 'decimal3_no0',
    'OBP': 'decimal3_no0',
    '長打率': 'decimal3_no0',
    'SLG': 'decimal3_no0',
    'IsoP': 'decimal3_no0',
    'IsoD': 'decimal3_no0',
    'ISO_P': 'decimal3_no0',
    'ISO_D': 'decimal3_no0',
    'iso_p': 'decimal3_no0',
    'iso_d': 'decimal3_no0',
    'BABIP': 'decimal3_no0',
    'SecA': 'decimal3_no0',
    'TA': 'decimal3_no0',
    'GPA': 'decimal3_no0',
    
    // percent1
    'BB%': 'percent1',
    'K%': 'percent1',
    'BBPCT': 'percent1',
    'KPCT': 'percent1',
    
    // decimal2
    'RC': 'decimal2',
    'XR': 'decimal2',
    'NOI': 'decimal2',
    
    // BB/K は小数2桁表示に統一（小数第3位を四捨五入）
    'BB/K': 'decimal2',
    'BB-K': 'decimal2',
    'BBK': 'decimal2',
    'BB_K': 'decimal2',
    'bb_k': 'decimal2',
    
    // int
    '安打': 'int',
    'H': 'int',
    'HR': 'int',
    '本塁打': 'int',
    '打点': 'int',
    'RBI': 'int',
    '試合': 'int',
    'G': 'int',
    '打席': 'int',
    'PA': 'int',
    '打数': 'int',
    'AB': 'int',
    '単打': 'int',
    '1B': 'int',
    '二塁打': 'int',
    '2B': 'int',
    '三塁打': 'int',
    '3B': 'int',
    '得点': 'int',
    'R': 'int',
    '四球': 'int',
    'BB': 'int',
    '敬遠': 'int',
    'IBB': 'int',
    '死球': 'int',
    'HBP': 'int',
    '三振': 'int',
    'SO': 'int',
    '塁打': 'int',
    'TB': 'int',
    '盗塁': 'int',
    'SB': 'int',
    '盗塁死': 'int',
    'CS': 'int',
    '犠打': 'int',
    'SH': 'int',
    '犠飛': 'int',
    'SF': 'int',
    '併殺打': 'int',
    'GDP': 'int',
    
    // 投手指標
    '最多勝': 'int',
    'セーブ': 'int',
    '奪三振': 'int',
    '完投': 'int',
    // 防御率はサイト全体で「0.00」「10.00」形式に統一する（先頭0省略しない）
    '防御率': 'decimal2',
    'WHIP': 'decimal3_no0',
    '勝率': 'decimal3_no0',
    '投球回': 'decimal2',
    'K-BB％': 'percent1',
    'K-BB%': 'percent1',
    '勝利': 'int',
    '敗戦': 'int',
    'HLD': 'int',
    'Ｓ': 'int',
    'ＨＰ': 'int',
    '先発': 'int',
    '完封': 'int',
    '回数': 'decimal2',
    '被打者': 'int',
    '投球数': 'int',
    'P/IP': 'decimal2',
    '被安': 'int',
    '被本': 'int',
    'K％': 'percent1',
    'BB％': 'percent1',
    'QS率': 'percent1',
    'HQS率': 'percent1',
    'SQS率': 'percent1',
    '被打率': 'decimal3_no0',
    '被BABIP': 'decimal3_no0',
    '被出塁率': 'decimal3_no0',
    '被長打率': 'decimal3_no0',
  };

  const format = formatMap[metricLabel];
  if (!format) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[formatStat] Unknown metric label "${metricLabel}". Add it to formatMap in formatStat.ts. Using heuristic display.`
      );
    }
    return "auto";
  }

  return format;
}

/**
 * 指標値を表示用文字列に変換
 * @param metricLabel 指標ラベル（例: "OPS", "打率", "BB%"）
 * @param value 指標値（数値、文字列、null、undefined など）
 * @returns フォーマット済み文字列
 */
export function formatStat(metricLabel: string, value: unknown): string {
  // 欠損値の統一処理
  if (value === null || value === undefined || value === '' || value === '-') {
    return '-';
  }

  // 数値化
  const numValue = typeof value === 'number' ? value : Number(value);
  
  // NaN / 非有限は "-" を返す
  if (Number.isNaN(numValue) || !Number.isFinite(numValue)) {
    return '-';
  }

  // フォーマット取得
  const format = getMetricFormat(metricLabel);

  // フォーマット適用
  switch (format) {
    case 'decimal3_no0': {
      const formatted = numValue.toFixed(3);
      // 先頭の 0 を省略（0.xxx -> .xxx）
      if (formatted.startsWith('0.')) {
        return '.' + formatted.slice(2);
      }
      return formatted;
    }

    case 'percent1': {
      // 数値は既に0〜100の値として保持されている前提
      return numValue.toFixed(1) + '%';
    }

    case 'decimal2': {
      // 二進浮動小数の誤差で .xx5 が下に丸められるのを防ぐ
      const rounded = Math.round((numValue + 1e-12) * 100) / 100
      return rounded.toFixed(2);
    }

    case 'decimal3_with0': {
      return numValue.toFixed(3);
    }

    case 'int': {
      // 整数表示（四捨五入は行わず、文字列化のみ）
      return String(Math.round(numValue));
    }

    case 'auto': {
      // 整数に近い値は整数表示、それ以外は小数第3位（先頭0省略は rate 向け）
      const roundedInt = Math.round(numValue)
      if (Math.abs(numValue - roundedInt) < 1e-9) {
        return String(roundedInt)
      }
      const formatted = numValue.toFixed(3)
      if (formatted.startsWith("0.")) {
        return "." + formatted.slice(2)
      }
      if (formatted.startsWith("-0.")) {
        return "-." + formatted.slice(3)
      }
      return formatted
    }

    default: {
      // 型安全のため、ここには来ないはずだが念のため
      throw new Error(`Unknown format: ${format}`);
    }
  }
}


