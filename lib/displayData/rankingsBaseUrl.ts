/**
 * 表示用 rankings の R2 ベース URL（docs/phase2_r2_display_spec.md と同一の公開バケット）
 * Vercel Production で env 未設定でも本番表示が止まらないようフォールバックする。
 */

export const DEFAULT_PUBLIC_RANKINGS_BASE_URL =
  'https://pub-41ff9f32fcf748529b7036f73f9e04e5.r2.dev'

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/** サーバー用（RANKINGS_BASE_URL → 未設定時は Vercel 本番のみデフォルト R2） */
export function getRankingsBaseUrl(): string | undefined {
  const fromEnv = process.env.RANKINGS_BASE_URL?.trim()
  if (fromEnv) return normalizeBase(fromEnv)
  if (process.env.VERCEL === '1') return DEFAULT_PUBLIC_RANKINGS_BASE_URL
  return undefined
}

export function hasRankingsBaseUrl(): boolean {
  return Boolean(getRankingsBaseUrl())
}

/** ブラウザ / サーバー共通（NEXT_PUBLIC → 未設定時は公開 R2） */
export function getPublicRankingsBaseUrl(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_RANKINGS_BASE_URL?.trim()
  if (fromEnv) return normalizeBase(fromEnv)
  return DEFAULT_PUBLIC_RANKINGS_BASE_URL
}
