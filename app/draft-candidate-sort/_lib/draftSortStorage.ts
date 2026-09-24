import type { CandidateFilter } from "./candidateData"
import type {
  BanzukeRow,
  DraftPredictionRow,
  UnknownCandidateRow,
} from "./resultBuilder"
import type {
  DraftSortAnswer,
  DraftSortRankEntry,
  DraftSortRelationRecord,
} from "./sortEngine"

export const draftSortStorageKey = "draft-candidate-sort:v2"
export const draftSortSessionVersion = 2
export const resultRetentionMs = 24 * 60 * 60 * 1000

export type DraftSortRoute =
  | "/draft-candidate-sort"
  | "/draft-candidate-sort/sort"
  | "/draft-candidate-sort/complete"
  | "/draft-candidate-sort/processing"
  | "/draft-candidate-sort/result"

export type DraftSortSession = {
  version: 2
  candidateSetVersion: "draft-candidates-2026"
  algorithmVersion: 2
  currentRoute: DraftSortRoute
  targetFilter: CandidateFilter
  createdAt: string
  updatedAt: string
  resultExpiresAt?: string
  candidateIds: string[]
  answers: DraftSortAnswer[]
  ranking: string[]
  rankEntries: DraftSortRankEntry[]
  relations: Record<string, DraftSortRelationRecord>
  progressPercent: number
  completedReason?: "single" | "sorted" | null
  unknownCounts: Record<string, number>
  tieGroups: string[][]
  banzukeResult: BanzukeRow[]
  draftPredictionResult: DraftPredictionRow[]
  unknownResult: UnknownCandidateRow[]
}

const validRoutes: DraftSortRoute[] = [
  "/draft-candidate-sort",
  "/draft-candidate-sort/sort",
  "/draft-candidate-sort/complete",
  "/draft-candidate-sort/processing",
  "/draft-candidate-sort/result",
]

export function createDraftSortSession(
  targetFilter: CandidateFilter,
  now = new Date(),
): DraftSortSession {
  const timestamp = now.toISOString()

  return {
    version: draftSortSessionVersion,
    candidateSetVersion: "draft-candidates-2026",
    algorithmVersion: 2,
    currentRoute: "/draft-candidate-sort/sort",
    targetFilter,
    createdAt: timestamp,
    updatedAt: timestamp,
    candidateIds: [],
    answers: [],
    ranking: [],
    rankEntries: [],
    relations: {},
    progressPercent: 0,
    completedReason: null,
    unknownCounts: {},
    tieGroups: [],
    banzukeResult: [],
    draftPredictionResult: [],
    unknownResult: [],
  }
}

export function saveDraftSortSession(session: DraftSortSession): void {
  window.localStorage.setItem(draftSortStorageKey, JSON.stringify(session))
}

export function loadDraftSortSession(): DraftSortSession | null {
  const raw = window.localStorage.getItem(draftSortStorageKey)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<DraftSortSession>
    if (
      parsed.version !== draftSortSessionVersion ||
      parsed.algorithmVersion !== 2 ||
      !parsed.targetFilter
    ) {
      clearDraftSortSession()
      return null
    }
    if (!parsed.currentRoute || !validRoutes.includes(parsed.currentRoute)) {
      return null
    }
    if (!Array.isArray(parsed.answers)) return null
    if (!Array.isArray(parsed.ranking)) return null
    if (!Array.isArray(parsed.candidateIds)) return null
    if (!Array.isArray(parsed.rankEntries)) return null
    if (!parsed.relations || typeof parsed.relations !== "object") return null
    if (parsed.resultExpiresAt) {
      const expiresAt = Date.parse(parsed.resultExpiresAt)
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        clearDraftSortSession()
        return null
      }
    }
    return parsed as DraftSortSession
  } catch {
    return null
  }
}

export function clearDraftSortSession(): void {
  window.localStorage.removeItem(draftSortStorageKey)
}

export function getResultExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + resultRetentionMs).toISOString()
}
