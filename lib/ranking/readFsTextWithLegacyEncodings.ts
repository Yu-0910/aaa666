/**
 * ローカル CSV/テキストを fs で読むときのエンコーディング差異を吸収する。
 * `fs.readFileSync(path, 非標準 enc as any)` だと TypeScript が戻り型を Buffer に誤推論することがあるため、
 * 常に Buffer で読んでから `Buffer#toString` で文字列化する。
 */

import fs from "fs"

function stripBomUtf8(s: string): string {
  return s.length > 0 && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

export function readFsTextWithLegacyEncodings(filePath: string): string | null {
  let buf: Buffer
  try {
    buf = fs.readFileSync(filePath)
  } catch {
    return null
  }
  if (buf.length === 0) return null

  const tries: Array<() => string> = [
    () => stripBomUtf8(buf.toString("utf8")),
    () => buf.toString("utf8"),
    () => buf.toString("shift_jis" as unknown as BufferEncoding),
    () => buf.toString("cp932" as unknown as BufferEncoding),
  ]

  for (const decode of tries) {
    try {
      const s = decode()
      if (s.length > 0) return s
    } catch {
      continue
    }
  }
  return null
}
