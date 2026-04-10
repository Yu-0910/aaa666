/**
 * 半角・全角の空白を除いた名前比較（CSVやクエリの「姓　名」表記の差を吸収）。
 * NFKC で CJK 互換文字（例: 名簿の「﨑」と入力の「崎」）を揃える。
 */
export function compactPlayerName(s: string): string {
  return (s || "").normalize("NFKC").replace(/[\s\u3000]+/g, "")
}

/**
 * NPB 名簿で英字が「姓 名」順（Morishita Shota）になっている行か。
 * Ａ．〇〇 形式や半角アルファベット始まりは外国人登録名として除外。
 */
export function isJapaneseNpbListedNameJa(nameJa: string): boolean {
  const s = (nameJa || "").trim().normalize("NFC")
  if (!s) return false
  if (/^[\uFF21-\uFF3A\uFF41-\uFF5A][\uFF0E.]/.test(s)) return false
  if (/^[A-Za-z]/.test(s)) return false
  return /[\u3040-\u30ff\u4e00-\u9fff\u3005-\u3007\uff66-\uff9f]/.test(s)
}
