"use client"

import { useEffect, useState } from "react"
import { Download, Share2, X } from "lucide-react"
import type { TopPageLayoutMode } from "@/app/components/top/topPageLayoutMode"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

type TopPageInstallButtonProps = {
  layout: TopPageLayoutMode
  compact?: boolean
}

export const TOP_PAGE_COMPACT_ACTION_BUTTON_CLASS =
  "inline-flex h-7 items-center justify-center gap-1 rounded border border-[#444] bg-[#141414] px-2 py-0.5 text-[11px] font-semibold text-gray-300 transition-colors hover:border-[#666] hover:text-[#ffff44]"

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
}

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function TopPageInstallButton({ layout, compact = false }: TopPageInstallButtonProps) {
  const isMobile = layout === "mobile"
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    if (isStandaloneDisplay()) return

    const ios = isIosDevice()
    setIsIos(ios)
    if (ios) {
      setIsVisible(true)
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setIsVisible(true)
    }

    const handleInstalled = () => {
      setInstallPrompt(null)
      setIsVisible(false)
      setShowIosGuide(false)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleInstalled)
    }
  }, [])

  if (!isVisible) return null

  const handleInstallClick = async () => {
    if (!installPrompt) {
      setShowIosGuide((value) => !value)
      return
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === "accepted") {
      setIsVisible(false)
    }
    setInstallPrompt(null)
  }

  const buttonClassName = compact
    ? TOP_PAGE_COMPACT_ACTION_BUTTON_CLASS
    : `inline-flex items-center justify-center gap-1.5 border border-[#ffff44] bg-[#ffff44] text-black font-black shadow-[0_0_0_1px_rgba(255,255,68,0.15)] transition-colors hover:bg-white ${
        isMobile ? "h-8 px-2.5 text-[11px]" : "h-9 px-3 text-xs"
      }`

  const guideClassName = compact
    ? "absolute right-0 top-full z-40 mt-2 w-56 border border-[#555] bg-[#111] p-3 text-[11px] leading-relaxed text-white shadow-xl"
    : "absolute right-0 top-full z-40 mt-2 w-64 border border-[#555] bg-[#111] p-3 text-xs leading-relaxed text-white shadow-xl"

  const button = (
    <div className="relative flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleInstallClick}
        className={buttonClassName}
        aria-expanded={showIosGuide}
      >
        {isIos && !installPrompt ? <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
        画面に追加
      </button>
      {showIosGuide && (
        <div className={guideClassName}>
          <button
            type="button"
            onClick={() => setShowIosGuide(false)}
            className="absolute right-2 top-2 p-1 text-[#aaa] transition-colors hover:text-white"
            aria-label="案内を閉じる"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <p className="pr-6 font-bold text-[#ffff44]">Safariの共有メニューから追加できます。</p>
          <p className="mt-1 text-[#d0d0d0]">共有ボタンを押して「ホーム画面に追加」を選択してください。</p>
        </div>
      )}
    </div>
  )

  if (compact) return button

  return (
    <div className={isMobile ? "bg-black px-2 pt-2" : "bg-black px-4 pt-3"}>
      <div className={isMobile ? "mx-auto flex max-w-6xl items-start justify-end gap-2" : "mx-auto flex max-w-6xl items-center justify-end gap-2"}>
        {button}
      </div>
    </div>
  )
}
