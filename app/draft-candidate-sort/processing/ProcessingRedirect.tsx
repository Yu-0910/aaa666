"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { buildDraftSortResults } from "../_lib/resultBuilder"
import {
  getResultExpiresAt,
  loadDraftSortSession,
  saveDraftSortSession,
  type DraftSortSession,
} from "../_lib/draftSortStorage"

export function ProcessingRedirect() {
  const router = useRouter()

  useEffect(() => {
    const saved = loadDraftSortSession()
    if (!saved) {
      router.replace("/draft-candidate-sort")
      return
    }

    const builtResults = buildDraftSortResults({
      ranking: saved.ranking,
      unknownCounts: saved.unknownCounts,
    })
    const nextSession: DraftSortSession = {
      ...saved,
      ...builtResults,
      currentRoute: "/draft-candidate-sort/result",
      updatedAt: new Date().toISOString(),
      resultExpiresAt: getResultExpiresAt(),
    }

    saveDraftSortSession(nextSession)

    const timer = window.setTimeout(() => {
      router.replace("/draft-candidate-sort/result")
    }, 800)

    return () => window.clearTimeout(timer)
  }, [router])

  return null
}
