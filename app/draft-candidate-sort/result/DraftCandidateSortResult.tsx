"use client"

import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  getCandidatePositionGroupLabel,
  getCandidatesForSort,
  type CandidateForSort,
} from "../_lib/candidateData"
import {
  clearDraftSortSession,
  loadDraftSortSession,
  type DraftSortSession,
} from "../_lib/draftSortStorage"
import type { DraftPredictionRound } from "../_lib/resultBuilder"

type ResultTab = "banzuke" | "draft" | "unknown"

export function DraftCandidateSortResult() {
  const router = useRouter()
  const [session, setSession] = useState<DraftSortSession | null>(null)
  const [activeTab, setActiveTab] = useState<ResultTab>("banzuke")
  const [copyStatus, setCopyStatus] = useState<string>("")

  useEffect(() => {
    const saved = loadDraftSortSession()
    if (!saved) {
      router.replace("/draft-candidate-sort")
      return
    }

    setSession(saved)
  }, [router])

  const candidateById = useMemo(() => {
    return new Map(
      getCandidatesForSort().map((candidate) => [candidate.id, candidate]),
    )
  }, [])

  if (!session) {
    return (
      <div className="rounded border border-slate-200 bg-white p-6 text-slate-600">
        読み込んでいます。
      </div>
    )
  }

  async function copyResultText() {
    const text = buildResultText(session, candidateById)
    await navigator.clipboard.writeText(text)
    setCopyStatus("コピーしました")
    window.setTimeout(() => setCopyStatus(""), 1800)
  }

  function downloadPng() {
    const text = buildResultText(session, candidateById)
    const lines = text.split("\n")
    const width = 1200
    const padding = 48
    const lineHeight = 28
    const height = Math.max(640, padding * 2 + lines.length * lineHeight)
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext("2d")
    if (!context) return

    context.fillStyle = "#fafaf9"
    context.fillRect(0, 0, width, height)
    context.fillStyle = "#0f172a"
    context.font = "bold 28px sans-serif"
    context.fillText("2026ドラフト候補ソート 結果", padding, padding)
    context.font = "20px sans-serif"

    lines.forEach((line, index) => {
      const y = padding + 52 + index * lineHeight
      context.fillText(line, padding, y)
    })

    const link = document.createElement("a")
    link.download = "draft-candidate-sort-result.png"
    link.href = canvas.toDataURL("image/png")
    link.click()
  }

  function restart() {
    clearDraftSortSession()
    router.push("/draft-candidate-sort")
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <ResultTabButton
          active={activeTab === "banzuke"}
          onClick={() => setActiveTab("banzuke")}
        >
          番付表
        </ResultTabButton>
        <ResultTabButton
          active={activeTab === "draft"}
          onClick={() => setActiveTab("draft")}
        >
          ドラフト順位予想表
        </ResultTabButton>
        <ResultTabButton
          active={activeTab === "unknown"}
          onClick={() => setActiveTab("unknown")}
        >
          未評価が多い候補
        </ResultTabButton>
      </div>

      {activeTab === "banzuke" ? (
        <BanzukeResultSection session={session} candidateById={candidateById} />
      ) : null}

      {activeTab === "draft" ? (
        <DraftPredictionSection
          session={session}
          candidateById={candidateById}
        />
      ) : null}

      {activeTab === "unknown" ? (
        <UnknownResultSection session={session} candidateById={candidateById} />
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
        {copyStatus ? (
          <span className="text-sm font-semibold text-emerald-700">
            {copyStatus}
          </span>
        ) : null}
        <button
          type="button"
          onClick={downloadPng}
          className="rounded border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800 transition hover:border-emerald-400"
        >
          PNG保存
        </button>
        <button
          type="button"
          onClick={copyResultText}
          className="rounded border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800 transition hover:border-emerald-400"
        >
          テキストコピー
        </button>
        <button
          type="button"
          onClick={restart}
          className="rounded bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800"
        >
          もう一度ソートする
        </button>
      </div>
    </>
  )
}

function ResultTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded border px-4 py-2 text-sm font-semibold transition",
        active
          ? "border-emerald-700 bg-emerald-700 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300",
      ].join(" ")}
    >
      {children}
    </button>
  )
}

function BanzukeResultSection({
  session,
  candidateById,
}: {
  session: DraftSortSession
  candidateById: Map<string, CandidateForSort>
}) {
  return (
    <section className="rounded border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-xl font-bold">番付表</h2>
        </div>
        {session.banzukeResult.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="w-[40%] border-b border-slate-200 p-3 text-left">
                    東
                  </th>
                  <th className="w-[20%] border-b border-slate-200 p-3 text-center">
                    番付
                  </th>
                  <th className="w-[40%] border-b border-slate-200 p-3 text-right">
                    西
                  </th>
                </tr>
              </thead>
              <tbody>
                {session.banzukeResult.map((row) => (
                  <tr key={`${row.rankLabel}-${row.eastId}-${row.westId}`}>
                    <td className="border-b border-slate-100 p-3 align-top">
                      <BanzukeCandidate
                        candidate={row.eastId ? candidateById.get(row.eastId) : null}
                        fallbackId={row.eastId}
                        align="left"
                      />
                    </td>
                    <td className="border-b border-slate-100 p-3 text-center align-middle font-bold text-slate-700">
                      {row.rankLabel}
                    </td>
                    <td className="border-b border-slate-100 p-3 align-top">
                      <BanzukeCandidate
                        candidate={row.westId ? candidateById.get(row.westId) : null}
                        fallbackId={row.westId}
                        align="right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-5 text-sm text-slate-600">
            結果作成後、ここに番付表を表示します。
          </p>
        )}
      </section>
  )
}

function DraftPredictionSection({
  session,
  candidateById,
}: {
  session: DraftSortSession
  candidateById: Map<string, CandidateForSort>
}) {
  return (
      <section className="rounded border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-xl font-bold">ドラフト順位予想表</h2>
        </div>
        {session.draftPredictionResult.length > 0 ? (
          <div className="grid gap-0 lg:grid-cols-3">
            {[1, 2, 3].map((round) => (
              <DraftRoundTable
                key={round}
                round={round as DraftPredictionRound}
                rows={session.draftPredictionResult.filter(
                  (row) => row.round === round,
                )}
                candidateById={candidateById}
              />
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-slate-600">
            結果作成後、ここにドラフト順位予想表を表示します。
          </p>
        )}
      </section>
  )
}

function UnknownResultSection({
  session,
  candidateById,
}: {
  session: DraftSortSession
  candidateById: Map<string, CandidateForSort>
}) {
  return (
    <section className="rounded border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-xl font-bold">未評価が多い候補</h2>
      </div>
      {session.unknownResult.length > 0 ? (
        <ol className="divide-y divide-slate-100">
          {session.unknownResult.map((row) => (
            <li
              key={row.candidateId}
              className="flex items-start justify-between gap-4 p-4"
            >
              <ResultCandidate
                candidate={candidateById.get(row.candidateId)}
                fallbackId={row.candidateId}
              />
              <span className="rounded bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
                {row.unknownCount}回
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="p-5 text-sm text-slate-600">
          両方知らないを選んだ候補はありません。
        </p>
      )}
    </section>
  )
}

function DraftRoundTable({
  round,
  rows,
  candidateById,
}: {
  round: DraftPredictionRound
  rows: { overallRank: number; candidateId: string }[]
  candidateById: Map<string, CandidateForSort>
}) {
  return (
    <section className="border-b border-slate-200 p-4 lg:border-b-0 lg:border-r last:lg:border-r-0">
      <h3 className="mb-3 text-base font-bold">ドラフト{round}位予想</h3>
      {rows.length > 0 ? (
        <ol className="space-y-3">
          {rows.map((row) => (
            <li
              key={`${round}-${row.overallRank}-${row.candidateId}`}
              className="flex gap-3 rounded border border-slate-100 bg-slate-50 p-3"
            >
              <span className="w-7 shrink-0 text-right text-sm font-bold text-slate-500">
                {row.overallRank}
              </span>
              <ResultCandidate
                candidate={candidateById.get(row.candidateId)}
                fallbackId={row.candidateId}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-slate-500">該当候補なし</p>
      )}
    </section>
  )
}

function ResultCandidate({
  candidate,
  fallbackId,
}: {
  candidate: CandidateForSort | undefined
  fallbackId: string
}) {
  if (!candidate) {
    return <p className="font-bold">{fallbackId}</p>
  }

  return (
    <div>
      <p className="font-bold">{candidate.name}</p>
      <p className="mt-1 text-xs text-slate-600">{candidate.schoolOrTeam}</p>
      <p className="mt-1 text-xs text-slate-500">
        {getCandidatePositionGroupLabel(candidate.positionGroup)}
      </p>
    </div>
  )
}

function BanzukeCandidate({
  candidate,
  fallbackId,
  align,
}: {
  candidate: CandidateForSort | null | undefined
  fallbackId: string | null
  align: "left" | "right"
}) {
  const textAlign = align === "right" ? "text-right" : "text-left"

  if (!fallbackId) {
    return <div className={`text-slate-400 ${textAlign}`}>-</div>
  }

  if (!candidate) {
    return (
      <div className={textAlign}>
        <p className="font-bold">{fallbackId}</p>
      </div>
    )
  }

  return (
    <div className={textAlign}>
      <p className="text-base font-bold">{candidate.name}</p>
      <p className="mt-1 text-xs text-slate-600">{candidate.schoolOrTeam}</p>
      <p className="mt-1 text-xs text-slate-500">
        {getCandidatePositionGroupLabel(candidate.positionGroup)}
      </p>
    </div>
  )
}

function buildResultText(
  session: DraftSortSession,
  candidateById: Map<string, CandidateForSort>,
): string {
  const candidateName = (id: string | null) => {
    if (!id) return "-"
    return candidateById.get(id)?.name ?? id
  }

  const banzuke = session.banzukeResult
    .map(
      (row) =>
        `${row.rankLabel}: 東 ${candidateName(row.eastId)} / 西 ${candidateName(row.westId)}`,
    )
    .join("\n")

  const draft = session.draftPredictionResult
    .map((row) => `${row.overallRank}. ${candidateName(row.candidateId)}`)
    .join("\n")

  const unknown = session.unknownResult
    .map((row) => `${candidateName(row.candidateId)}: ${row.unknownCount}回`)
    .join("\n")

  return [
    "番付表",
    banzuke || "なし",
    "",
    "ドラフト順位予想表",
    draft || "なし",
    "",
    "未評価が多い候補",
    unknown || "なし",
  ].join("\n")
}
