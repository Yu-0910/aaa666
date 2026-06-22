/**
 * 半角・全角の空白を除いた名前比較（CSVやクエリの「姓　名」表記の差を吸収）。
 * NFKC で CJK 互換文字（例: 名簿の「﨑」と入力の「崎」）を揃える。
 */
export function compactPlayerName(s: string): string {
  return (s || "").normalize("NFKC").replace(/[\s\u3000]+/g, "")
}

/**
 * 名簿照合用キー（高/髙・崎/﨑 など表記ゆれを吸収）。
 * NFKC だけでは揃わない旧字体をここで統一する。
 */
export function rosterNameMatchKey(s: string): string {
  return compactPlayerName(s)
    .replace(/\u9AD9/g, "\u9AD8") // 髙 → 高
    .replace(/\u9AD6/g, "\u9AD8") // 高（別コードポイント）→ 高
    .replace(/\uFA11/g, "\u5D0E") // 﨑 → 崎
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

/**
 * 対戦成績タブの相手選手名表示用。
 * 漢字を含む名前（日本人・GG佐藤・T-岡田 等）はそのまま。
 * 外国人登録名（Ｔ．ハーン 等・漢字なし）は先頭イニシャル・ドットを除きカタカナ部分のみ返す。
 */
export function matchupOpponentDisplayNameJa(nameJa: string): string {
  const s = (nameJa || "").trim().normalize("NFC")
  if (!s) return ""
  // 漢字とアルファベットの複合登録名（GG佐藤、T-岡田 等）はアルファベットを残す
  if (/[\u4e00-\u9fff]/.test(s)) return s
  if (isJapaneseNpbListedNameJa(s)) return s
  let out = s
    .replace(/^[\uFF21-\uFF3A\uFF41-\uFF5A][\uFF0E．.]/u, "")
    .replace(/^[A-Za-z][.．]/u, "")
    .replace(/[A-Za-z\uFF21-\uFF3A\uFF41-\uFF5A]/g, "")
    .replace(/[.\uFF0E．]/g, "")
    .trim()
  return out || s
}
