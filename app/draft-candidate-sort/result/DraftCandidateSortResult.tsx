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
import {
  buildDraftResultAnnouncementSvg,
  draftResultImageHeight,
  draftResultImageWidth,
} from "../_lib/resultImage"
import type { DraftPredictionRound } from "../_lib/resultBuilder"

type ResultTab = "banzuke" | "draft" | "unknown"

export function DraftCandidateSortResult() {
  const router = useRouter()
  const [session, setSession] = useState<DraftSortSession | null>(null)
  const [activeTab, setActiveTab] = useState<ResultTab>("banzuke")
  const [copyStatus, setCopyStatus] = useState<string>("")
  const [imageUrl, setImageUrl] = useState<string>("")

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

  const resultSvg = useMemo(() => {
    if (!session) return ""
    return buildDraftResultAnnouncementSvg(session, candidateById)
  }, [candidateById, session])

  useEffect(() => {
    if (!resultSvg) {
      setImageUrl("")
      return
    }

    let cancelled = false

    svgToPngDataUrl(resultSvg)
      .then((pngUrl) => {
        if (!cancelled) setImageUrl(pngUrl)
      })
      .catch(() => {
        if (!cancelled) setImageUrl("")
      })

    return () => {
      cancelled = true
    }
  }, [resultSvg])

  if (!session) {
    return (
      <div className="rounded border border-[#333] bg-[#1a1a1a] p-6 text-white/70">
        読み込んでいます。
      </div>
    )
  }
  const activeSession = session

  async function copyResultText() {
    const text = buildResultText(activeSession, candidateById)
    await navigator.clipboard.writeText(text)
    setCopyStatus("コピーしました")
    window.setTimeout(() => setCopyStatus(""), 1800)
  }

  async function downloadPng() {
    if (!resultSvg) return

    const link = document.createElement("a")
    link.download = "draft-2026-round-prediction.png"
    link.href = imageUrl || (await svgToPngDataUrl(resultSvg))
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

      <section className="mt-8 rounded border border-[#333] bg-[#1a1a1a] text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
        <div className="border-b border-[#333] p-5">
          <h2 className="text-xl font-bold">結果発表画像</h2>
        </div>
        <div className="bg-[#111315] p-4 sm:p-6">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="2026 ドラフト1位〜3位予想"
              className="mx-auto h-auto w-full max-w-[760px] rounded border border-white/10 bg-white"
            />
          ) : (
            <p className="text-sm text-white/70">画像を生成しています。</p>
          )}
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
        {copyStatus ? (
          <span className="text-sm font-semibold text-[#ffff44]">
            {copyStatus}
          </span>
        ) : null}
        <button
          type="button"
          onClick={downloadPng}
          className="rounded border border-[#555] bg-[#1a1a1a] px-5 py-3 font-semibold text-white transition hover:border-[#ffff44] hover:text-[#ffff44]"
        >
          画像を保存
        </button>
        <button
          type="button"
          onClick={copyResultText}
          className="rounded border border-[#555] bg-[#1a1a1a] px-5 py-3 font-semibold text-white transition hover:border-[#ffff44] hover:text-[#ffff44]"
        >
          テキストコピー
        </button>
        <button
          type="button"
          onClick={restart}
          className="rounded bg-[#ffff44] px-5 py-3 font-semibold text-[#23272a] transition hover:bg-white"
        >
          もう一度ソートする
        </button>
      </div>
    </>
  )
}

async function svgToPngDataUrl(svg: string): Promise<string> {
  const image = new Image()
  const svgUrl = svgToObjectUrl(svg)
  image.decoding = "async"
  image.width = draftResultImageWidth
  image.height = draftResultImageHeight

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("result image load failed"))
      image.src = svgUrl
    })
  } finally {
    window.URL.revokeObjectURL(svgUrl)
  }

  const canvas = document.createElement("canvas")
  canvas.width = draftResultImageWidth
  canvas.height = draftResultImageHeight

  const context = canvas.getContext("2d")
  if (!context) return ""

  context.drawImage(image, 0, 0)

  return canvas.toDataURL("image/png")
}

function svgToObjectUrl(svg: string): string {
  return window.URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
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
          ? "border-[#ffff44] bg-[#ffff44] text-[#23272a]"
          : "border-[#333] bg-[#1a1a1a] text-white hover:border-[#ffff44]",
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
    <section className="rounded border border-[#333] bg-[#1a1a1a] text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
        <div className="border-b border-[#333] p-5">
          <h2 className="text-xl font-bold">番付表</h2>
        </div>
        {session.banzukeResult.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-[#111315] text-white/70">
                  <th className="w-[40%] border-b border-[#333] p-3 text-left">
                    東
                  </th>
                  <th className="w-[20%] border-b border-[#333] p-3 text-center">
                    番付
                  </th>
                  <th className="w-[40%] border-b border-[#333] p-3 text-right">
                    西
                  </th>
                </tr>
              </thead>
              <tbody>
                {session.banzukeResult.map((row) => (
                  <tr key={`${row.rankLabel}-${row.eastId}-${row.westId}`}>
                    <td className="border-b border-[#333] p-3 align-top">
                      <BanzukeCandidate
                        candidate={row.eastId ? candidateById.get(row.eastId) : null}
                        fallbackId={row.eastId}
                        align="left"
                      />
                    </td>
                    <td className="border-b border-[#333] p-3 text-center align-middle font-bold text-[#ffff44]">
                      {row.rankLabel}
                    </td>
                    <td className="border-b border-[#333] p-3 align-top">
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
          <p className="p-5 text-sm text-white/70">
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
      <section className="rounded border border-[#333] bg-[#1a1a1a] text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
        <div className="border-b border-[#333] p-5">
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
          <p className="p-5 text-sm text-white/70">
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
    <section className="rounded border border-[#333] bg-[#1a1a1a] text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
      <div className="border-b border-[#333] p-5">
        <h2 className="text-xl font-bold">未評価が多い候補</h2>
      </div>
      {session.unknownResult.length > 0 ? (
        <ol className="divide-y divide-white/10">
          {session.unknownResult.map((row) => (
            <li
              key={row.candidateId}
              className="flex items-start justify-between gap-4 p-4"
            >
              <ResultCandidate
                candidate={candidateById.get(row.candidateId)}
                fallbackId={row.candidateId}
              />
              <span className="rounded bg-[#111315] px-3 py-1 text-sm font-bold text-[#ffff44]">
                {row.unknownCount}回
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="p-5 text-sm text-white/70">
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
  rows: { overallRank: number; displayRank: number; candidateId: string }[]
  candidateById: Map<string, CandidateForSort>
}) {
  return (
    <section className="border-b border-[#333] p-4 lg:border-b-0 lg:border-r last:lg:border-r-0">
      <h3 className="mb-3 text-base font-bold">ドラフト{round}位予想</h3>
      {rows.length > 0 ? (
        <ol className="space-y-3">
          {rows.map((row) => (
            <li
              key={`${round}-${row.overallRank}-${row.candidateId}`}
              className="flex gap-3 rounded border border-[#333] bg-[#111315] p-3"
            >
              <span className="w-7 shrink-0 text-right text-sm font-bold text-[#ffff44]">
                {row.displayRank}
              </span>
              <ResultCandidate
                candidate={candidateById.get(row.candidateId)}
                fallbackId={row.candidateId}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-white/55">該当候補なし</p>
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
      <p className="mt-1 text-xs text-white/65">{candidate.schoolOrTeam}</p>
      <p className="mt-1 text-xs text-white/50">
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
    return <div className={`text-white/35 ${textAlign}`}>-</div>
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
      <p className="mt-1 text-xs text-white/65">{candidate.schoolOrTeam}</p>
      <p className="mt-1 text-xs text-white/50">
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
    .map((row) => `${row.displayRank}. ${candidateName(row.candidateId)}`)
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
