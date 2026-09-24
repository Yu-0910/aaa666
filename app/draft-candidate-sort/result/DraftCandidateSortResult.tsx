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
  banzukeImageHeight,
  banzukeImageWidth,
  banzukeTemplateLayout,
  banzukeTemplateSrc,
  buildBanzukeTemplateRows,
  buildDraftResultTemplateColumns,
  draftResultImageHeight,
  draftResultImageWidth,
  draftResultTemplateLayout,
  draftResultTemplateSrc,
  type BanzukeTemplateCell,
  type BanzukeTemplateRow,
  type DraftResultTemplateColumn,
} from "../_lib/resultImage"

type ResultTab = "banzuke" | "draftPrediction" | "unknown"

export function DraftCandidateSortResult() {
  const router = useRouter()
  const [session, setSession] = useState<DraftSortSession | null>(null)
  const [activeTab, setActiveTab] = useState<ResultTab>("banzuke")
  const [copyStatus, setCopyStatus] = useState<string>("")
  const [imageUrl, setImageUrl] = useState<string>("")
  const [banzukeImageUrl, setBanzukeImageUrl] = useState<string>("")

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

  const banzukeRows = useMemo(() => {
    if (!session) return []
    return buildBanzukeTemplateRows(session, candidateById)
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

  useEffect(() => {
    if (banzukeRows.length === 0) {
      setBanzukeImageUrl("")
      return
    }

    let cancelled = false

    banzukeTemplateToPngDataUrl(banzukeRows)
      .then((pngUrl) => {
        if (!cancelled) setBanzukeImageUrl(pngUrl)
      })
      .catch(() => {
        if (!cancelled) setBanzukeImageUrl("")
      })

    return () => {
      cancelled = true
    }
  }, [banzukeRows])

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

  async function downloadBanzukePng() {
    if (banzukeRows.length === 0) return

    const link = document.createElement("a")
    link.download = "draft-2026-banzuke.png"
    link.href =
      banzukeImageUrl || (await banzukeTemplateToPngDataUrl(banzukeRows))
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
        <BanzukeResultSection
          imageUrl={banzukeImageUrl}
          onDownload={downloadBanzukePng}
          hasRows={banzukeRows.length > 0}
        />
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

function BanzukeResultSection({
  imageUrl,
  onDownload,
  hasRows,
}: {
  imageUrl: string
  onDownload: () => void
  hasRows: boolean
}) {
  return (
    <section className="rounded border border-[#333] bg-[#1a1a1a] text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
      <div className="border-b border-[#333] p-5">
        <h2 className="text-xl font-bold">番付表</h2>
      </div>
      <div className="bg-[#111315] p-4 sm:p-6">
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt="2026 ドラフト番付表"
              className="mx-auto h-auto w-full max-w-[760px] rounded border border-white/10 bg-white"
            />
            <p className="mt-3 text-center text-sm text-white/70">
              文字がない箇所を長押しすれば、画像が保存できます。
            </p>
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
          <p className="text-sm text-white/70">
            {hasRows
              ? "画像を生成しています。"
              : "結果作成後、ここに番付表を表示します。"}
          </p>
        )}
      </div>
    </section>
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
            <p className="mt-3 text-center text-sm text-white/70">
              文字がない箇所を長押しすれば、画像が保存できます。
            </p>
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

async function banzukeTemplateToPngDataUrl(
  rows: BanzukeTemplateRow[],
): Promise<string> {
  const [templateImage] = await Promise.all([
    loadImage(banzukeTemplateSrc),
    waitForDraftResultFonts(),
  ])
  const canvas = document.createElement("canvas")
  canvas.width = banzukeImageWidth
  canvas.height = banzukeImageHeight

  const context = canvas.getContext("2d")
  if (!context) return ""

  context.drawImage(templateImage, 0, 0, banzukeImageWidth, banzukeImageHeight)
  drawBanzukeRows(context, rows)

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

function drawBanzukeRows(
  context: CanvasRenderingContext2D,
  rows: BanzukeTemplateRow[],
): void {
  context.textBaseline = "alphabetic"
  context.textAlign = "left"
  const fontFamily = getDraftResultCanvasFontFamily()

  rows.slice(0, banzukeTemplateLayout.maxRows).forEach((row, rowIndex) => {
    const rowTop =
      banzukeTemplateLayout.rowTop +
      rowIndex * banzukeTemplateLayout.rowHeight

    drawBanzukeCell(
      context,
      row.west,
      banzukeTemplateLayout.westTextLeft,
      rowTop,
      fontFamily,
    )
    drawBanzukeCell(
      context,
      row.east,
      banzukeTemplateLayout.eastTextLeft,
      rowTop,
      fontFamily,
    )
  })
}

function drawBanzukeCell(
  context: CanvasRenderingContext2D,
  cell: BanzukeTemplateCell | null,
  textLeft: number,
  rowTop: number,
  fontFamily: string,
): void {
  if (!cell) return

  context.fillStyle = "#000000"
  applyOpponentBatterNameCanvasTextSettings(context)
  context.font = `900 ${getBanzukeNameFontSize(cell.name)}px ${fontFamily}`
  drawDraftResultPlayerName(
    context,
    cell.name,
    textLeft,
    rowTop + banzukeTemplateLayout.nameBaselineOffset,
  )

  if (cell.subText) {
    context.fillStyle = "#000000"
    applyOpponentBatterNameCanvasTextSettings(context)
    context.font = `700 20px ${fontFamily}`
    context.fillText(
      trimForCanvas(cell.subText, 18),
      textLeft,
      rowTop + banzukeTemplateLayout.subTextBaselineOffset,
    )
  }
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

function getBanzukeNameFontSize(name: string): number {
  const length = Array.from(name).length
  if (length >= 10) return 36
  if (length >= 8) return 40
  if (length >= 6) return 45
  return 49
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
