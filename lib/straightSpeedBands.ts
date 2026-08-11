/**
 * ストレート球速帯（Phase14 集計・UI 共通）
 *
 * 整数 km/h 区分: 161〜 / 156〜160 / 151〜155 / 146〜150 / 141〜145 / 〜140 / 球速不明
 */
export const STRAIGHT_SPEED_BANDS = [
  { key: '161+', labelJa: '161km/h～' },
  { key: '156-160', labelJa: '～160km/h' },
  { key: '151-155', labelJa: '～155km/h' },
  { key: '146-150', labelJa: '～150km/h' },
  { key: '141-145', labelJa: '～145km/h' },
  { key: '-140', labelJa: '～140km/h' },
  { key: 'unknown', labelJa: '球速不明' },
] as const

export type StraightSpeedBandKey = (typeof STRAIGHT_SPEED_BANDS)[number]['key']

export const STRAIGHT_SPEED_BAND_KEYS: readonly StraightSpeedBandKey[] = STRAIGHT_SPEED_BANDS.map(
  (b) => b.key
)

/**
 * Phase14 再生成前の JSON に残る帯キー → 現在のキー。
 * 区切り変更後も未再生成のファイルを表示できるようにする（数値は旧区分のまま1行に寄せた近似）。
 */
export const LEGACY_STRAIGHT_SPEED_BAND_TO_NEW: Record<string, StraightSpeedBandKey> = {
  '160-': '161+',
  '155-159': '156-160',
  '150-154': '151-155',
  '145-149': '146-150',
  '140-144': '141-145',
  '-139': '-140',
}

export function resolveStraightSpeedBandKey(rawKey: string): StraightSpeedBandKey | null {
  const k = (rawKey ?? '').trim()
  if (!k) return null
  if ((STRAIGHT_SPEED_BAND_KEYS as readonly string[]).includes(k)) {
    return k as StraightSpeedBandKey
  }
  return LEGACY_STRAIGHT_SPEED_BAND_TO_NEW[k] ?? null
}

export function kmhToStraightBandKey(kmh: number): StraightSpeedBandKey | null {
  if (!Number.isFinite(kmh)) return null
  const v = Math.trunc(kmh)
  if (v >= 161) return '161+'
  if (v >= 156) return '156-160'
  if (v >= 151) return '151-155'
  if (v >= 146) return '146-150'
  if (v >= 141) return '141-145'
  return '-140'
}
