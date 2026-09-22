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
  buildDraftResultTemplateColumns,
  draftResultImageHeight,
  draftResultImageWidth,
  draftResultTemplateLayout,
  draftResultTemplateSrc,
  type DraftResultTemplateColumn,
} from "../_lib/resultImage"

type ResultTab = "banzuke" | "draftPrediction" | "unknown"

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

  const resultColumns = useMemo(() => {
    if (!session) return []
    return buildDraftResultTemplateColumns(session, candidateById)
  }, [candidateById, session])

  useEffect(() => {
    if (resultColumns.length === 0) {
      setImageUrl("")
      return
    }

    let cancelled = false

    templateToPngDataUrl(resultColumns)
      .then((pngUrl) => {
        if (!cancelled) setImageUrl(pngUrl)
      })
      .catch(() => {
        if (!cancelled) setImageUrl("")
      })

    return () => {
      cancelled = true
    }
  }, [resultColumns])

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
    if (resultColumns.length === 0) return

    const link = document.createElement("a")
    link.download = "draft-2026-round-prediction.png"
    link.href = imageUrl || (await templateToPngDataUrl(resultColumns))
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
          active={activeTab === "draftPrediction"}
          onClick={() => setActiveTab("draftPrediction")}
        >
          ドラ1〜3予想
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

      {activeTab === "draftPrediction" ? (
        <DraftPredictionImageSection
          imageUrl={imageUrl}
          onDownload={downloadPng}
        />
      ) : null}

      {activeTab === "unknown" ? (
        <UnknownResultSection session={session} candidateById={candidateById} />
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
        {copyStatus ? (
          <span className="text-sm font-semibold text-[#ffff44]">
            {copyStatus}
          </span>
        ) : null}
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

function DraftPredictionImageSection({
  imageUrl,
  onDownload,
}: {
  imageUrl: string
  onDownload: () => void
}) {
  return (
    <section className="rounded border border-[#333] bg-[#1a1a1a] text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
      <div className="border-b border-[#333] p-5">
        <h2 className="text-xl font-bold">ドラ1〜3予想</h2>
      </div>
      <div className="bg-[#111315] p-4 sm:p-6">
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt="2026 ドラフト1位〜3位予想"
              className="mx-auto h-auto w-full max-w-[760px] rounded border border-white/10 bg-white"
            />
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={onDownload}
                className="rounded border border-[#555] bg-[#1a1a1a] px-5 py-3 font-semibold text-white transition hover:border-[#ffff44] hover:text-[#ffff44]"
              >
                画像を保存
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-white/70">画像を生成しています。</p>
        )}
      </div>
    </section>
  )
}

async function templateToPngDataUrl(
  columns: DraftResultTemplateColumn[],
): Promise<string> {
  const [templateImage] = await Promise.all([
    loadImage(draftResultTemplateSrc),
    waitForDraftResultFonts(),
  ])
  const canvas = document.createElement("canvas")
  canvas.width = draftResultImageWidth
  canvas.height = draftResultImageHeight

  const context = canvas.getContext("2d")
  if (!context) return ""

  context.drawImage(
    templateImage,
    0,
    0,
    draftResultImageWidth,
    draftResultImageHeight,
  )
  drawTemplateRows(context, columns)

  return canvas.toDataURL("image/png")
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.decoding = "async"

  return new Promise((resolve, reject) => {
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`image load failed: ${src}`))
    image.src = src
  })
}

async function waitForDraftResultFonts(): Promise<void> {
  await document.fonts.ready
}

function drawTemplateRows(
  context: CanvasRenderingContext2D,
  columns: DraftResultTemplateColumn[],
): void {
  context.textBaseline = "alphabetic"
  context.textAlign = "left"
  const fontFamily = getDraftResultCanvasFontFamily()

  columns.forEach((column, columnIndex) => {
    const layout = draftResultTemplateLayout.columns[columnIndex]
    if (!layout) return

    column.rows.forEach((row, rowIndex) => {
      const rowTop =
        layout.rowTop + rowIndex * draftResultTemplateLayout.rowHeight
      const textLeft = layout.x + draftResultTemplateLayout.textLeftOffset

      context.fillStyle = "#000000"
      applyOpponentBatterNameCanvasTextSettings(context)
      context.font = `900 ${getTemplateNameFontSize(row.name)}px ${fontFamily}`
      drawDraftResultPlayerName(
        context,
        row.name,
        textLeft,
        rowTop + draftResultTemplateLayout.nameBaselineOffset,
      )

      if (row.subText) {
        context.fillStyle = "#000000"
        applyOpponentBatterNameCanvasTextSettings(context)
        context.font = `700 29px ${fontFamily}`
        context.fillText(
          trimForCanvas(row.subText, 17),
          textLeft,
          rowTop + draftResultTemplateLayout.subTextBaselineOffset,
        )
      }
    })
  })
}

function drawDraftResultPlayerName(
  context: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
): void {
  const offsets = [
    [0, 0],
    [0.72, 0],
    [-0.72, 0],
    [0, 0.56],
  ] as const

  offsets.forEach(([offsetX, offsetY]) => {
    context.fillText(name, x + offsetX, y + offsetY)
  })
}

function applyOpponentBatterNameCanvasTextSettings(
  context: CanvasRenderingContext2D,
): void {
  context.fontKerning = "normal"
  context.fontVariantCaps = "normal"

  const modernContext = context as CanvasRenderingContext2D & {
    fontStretch?: string
    fontVariantNumeric?: string
    letterSpacing?: string
    wordSpacing?: string
  }
  modernContext.fontStretch = "normal"
  modernContext.fontVariantNumeric = "tabular-nums"
  modernContext.letterSpacing = "0px"
  modernContext.wordSpacing = "0px"
}

function getDraftResultCanvasFontFamily(): string {
  const rootStyle = window.getComputedStyle(document.documentElement)
  const notoSansJp = rootStyle.getPropertyValue("--font-noto-sans-jp").trim()
  const inter = rootStyle.getPropertyValue("--font-inter").trim()
  return [
    inter,
    '"Inter"',
    '"Yu Gothic"',
    '"Meiryo"',
    '"Hiragino Kaku Gothic ProN"',
    notoSansJp,
    '"Noto Sans JP"',
    "sans-serif",
  ]
    .filter(Boolean)
    .join(", ")
}

function getTemplateNameFontSize(name: string): number {
  const length = Array.from(name).length
  if (length >= 12) return 48
  if (length >= 10) return 54
  if (length >= 8) return 59
  return 64
}

function trimForCanvas(value: string, maxLength: number): string {
  const chars = Array.from(value)
  if (chars.length <= maxLength) return value
  return `${chars.slice(0, maxLength - 1).join("")}…`
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

  const unknown = session.unknownResult
    .map((row) => `${candidateName(row.candidateId)}: ${row.unknownCount}回`)
    .join("\n")

  return [
    "番付表",
    banzuke || "なし",
    "",
    "未評価が多い候補",
    unknown || "なし",
  ].join("\n")
}
