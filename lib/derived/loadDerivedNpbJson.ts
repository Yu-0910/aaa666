import {
  fetchDerivedJsonServer,
  readDerivedJsonLocalSync,
} from '@/lib/derived/fetchDerivedJsonServer'

export async function loadDerivedNpbJsonAsync<T>(
  category: string,
  year: string,
  npbPlayerId: string
): Promise<T | null> {
  const safeYear = String(year).replace(/[^\d]/g, '') || '2026'
  const safeNpb = String(npbPlayerId).replace(/[^\d]/g, '')
  if (!safeNpb) return null
  return fetchDerivedJsonServer<T>(category, safeYear, `npb_${safeNpb}.json`)
}

export function loadDerivedNpbJsonSync<T>(
  category: string,
  year: string,
  npbPlayerId: string
): T | null {
  const safeYear = String(year).replace(/[^\d]/g, '') || '2026'
  const safeNpb = String(npbPlayerId).replace(/[^\d]/g, '')
  if (!safeNpb) return null
  return readDerivedJsonLocalSync<T>(category, safeYear, `npb_${safeNpb}.json`)
}
