/** NPB 読み仮名（いけなが・まさあき）→ Western order ローマ字（Ikenaga Masaaki） */

const HEPBURN: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", を: "wo", ん: "n",
  きゃ: "kya", きゅ: "kyu", きょ: "kyo",
  ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  しゃ: "sha", しゅ: "shu", しょ: "sho",
  じゃ: "ja", じゅ: "ju", じょ: "jo",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
  にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo",
  びゃ: "bya", びゅ: "byu", びょ: "byo",
  ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
  みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo",
  っ: "",
}

const KATA_TO_HIRA: Record<string, string> = {
  ア: "あ", イ: "い", ウ: "う", エ: "え", オ: "お",
  カ: "か", キ: "き", ク: "く", ケ: "け", コ: "こ",
  サ: "さ", シ: "し", ス: "す", セ: "せ", ソ: "そ",
  タ: "た", チ: "ち", ツ: "つ", テ: "て", ト: "と",
  ナ: "な", ニ: "に", ヌ: "ぬ", ネ: "ね", ノ: "の",
  ハ: "は", ヒ: "ひ", フ: "ふ", ヘ: "へ", ホ: "ほ",
  マ: "ま", ミ: "み", ム: "む", メ: "め", モ: "も",
  ヤ: "や", ユ: "ゆ", ヨ: "よ",
  ラ: "ら", リ: "り", ル: "る", レ: "れ", ロ: "ろ",
  ワ: "わ", ヲ: "を", ン: "ん",
  ガ: "が", ギ: "ぎ", グ: "ぐ", ゲ: "げ", ゴ: "ご",
  ザ: "ざ", ジ: "じ", ズ: "ず", ゼ: "ぜ", ゾ: "ぞ",
  ダ: "だ", ヂ: "ぢ", ヅ: "づ", デ: "で", ド: "ど",
  バ: "ば", ビ: "び", ブ: "ぶ", ベ: "べ", ボ: "ぼ",
  パ: "ぱ", ピ: "ぴ", プ: "ぷ", ペ: "ぺ", ポ: "ぽ",
  キャ: "きゃ", キュ: "きゅ", キョ: "きょ",
  ギャ: "ぎゃ", ギュ: "ぎゅ", ギョ: "ぎょ",
  シャ: "しゃ", シュ: "しゅ", ショ: "しょ",
  ジャ: "じゃ", ジュ: "じゅ", ジョ: "じょ",
  チャ: "ちゃ", チュ: "ちゅ", チョ: "ちょ",
  ニャ: "にゃ", ニュ: "にゅ", ニョ: "にょ",
  ヒャ: "ひゃ", ヒュ: "ひゅ", ヒョ: "ひょ",
  ビャ: "びゃ", ビュ: "びゅ", ビョ: "びょ",
  ピャ: "ぴゃ", ピュ: "ぴゅ", ピョ: "ぴょ",
  ミャ: "みゃ", ミュ: "みゅ", ミョ: "みょ",
  リャ: "りゃ", リュ: "りゅ", リョ: "りょ",
  ッ: "っ", ー: "ー", "・": "・",
}

function toHiragana(input: string): string {
  let out = ""
  for (const ch of input) {
    out += KATA_TO_HIRA[ch] ?? ch
  }
  return out
}

function titleWord(w: string): string {
  if (!w) return ""
  return w.length > 1 ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()
}

export function kanaToRomaji(kana: string): string {
  const src = toHiragana((kana || "").trim())
  if (!src) return ""

  const result: string[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (ch === " " || ch === "・" || ch === "　") {
      result.push(" ")
      i += 1
      continue
    }
    if (ch === "ー" && result.length > 0) {
      const last = result[result.length - 1] ?? ""
      const vowel = last.slice(-1)
      if ("aiueo".includes(vowel)) result.push(vowel)
      i += 1
      continue
    }
    if (ch === "っ" && i + 1 < src.length) {
      const next = src[i + 1]!
      const nr = HEPBURN[next] ?? ""
      if (nr && "kstp".includes(nr[0]!)) result.push(nr[0]!)
      i += 1
      continue
    }
    if (i + 1 < src.length) {
      const two = src.slice(i, i + 2)
      if (two in HEPBURN) {
        result.push(HEPBURN[two]!)
        i += 2
        continue
      }
    }
    result.push(HEPBURN[ch] ?? ch)
    i += 1
  }

  return result
    .join("")
    .replace(/\s+/g, " ")
    .replace(/・+/g, " ")
    .trim()
}

/** `いけなが・まさあき` → `Ikenaga Masaaki` */
export function convertKanaToRomaji(nameKana: string): string {
  const parts = (nameKana || "")
    .split("・")
    .map((p) => p.trim())
    .filter(Boolean)
  return parts
    .map((p) => titleWord(kanaToRomaji(p)))
    .filter(Boolean)
    .join(" ")
}
