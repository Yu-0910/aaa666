"use client"

import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"

/**
 * デスクトップ判定
 *
 * 目的:
 * - 横長（スマホ横向き）で width だけが増えても、スマホUIのままにしたい
 * - タブレット/PC では desktop UI を出したい
 *
 * 方針:
 * - 「幅が大きい」だけでは desktop にしない
 * - ある程度の高さも満たす場合に desktop 扱い
 *
 * Next.js の useSearchParams は App Router でサスペンドし、ルートの Suspense フォールバックが
 * 真っ黒だと「何も表示されない」状態になりやすい。クエリは window + history を同期して読む。
 */
const DESKTOP_MEDIA_PRIMARY = "(min-width: 1024px)"
const DESKTOP_MEDIA_SECONDARY = "(min-width: 768px) and (min-height: 700px)"

const urlListeners = new Set<() => void>()
let historyPatched = false

function notifyUrlListeners() {
  for (const cb of urlListeners) cb()
}

function ensureHistoryPatched() {
  if (typeof window === "undefined" || historyPatched) return
  historyPatched = true
  const origPush = history.pushState.bind(history)
  const origReplace = history.replaceState.bind(history)
  history.pushState = (...args: Parameters<typeof origPush>) => {
    origPush(...args)
    queueMicrotask(notifyUrlListeners)
  }
  history.replaceState = (...args: Parameters<typeof origReplace>) => {
    origReplace(...args)
    queueMicrotask(notifyUrlListeners)
  }
  window.addEventListener("popstate", notifyUrlListeners)
}

function subscribeSearch(callback: () => void) {
  if (typeof window === "undefined") return () => {}
  ensureHistoryPatched()
  urlListeners.add(callback)
  return () => {
    urlListeners.delete(callback)
  }
}

function getSearchSnapshot(): string {
  return typeof window !== "undefined" ? window.location.search : ""
}

function getServerSearchSnapshot(): string {
  return ""
}

/** クライアントのクエリ文字列（useSearchParams の代替・サスペンドしない） */
export function useClientSearchString(): string {
  return useSyncExternalStore(subscribeSearch, getSearchSnapshot, getServerSearchSnapshot)
}

/** `/mobile/players/...` または URL に `?mobile=1` / `?view=mobile` など */
export function computeForceMobile(pathname: string, search: string): boolean {
  if (pathname.startsWith("/mobile/players")) return true
  const qs = search.startsWith("?") ? search.slice(1) : search
  const searchParams = new URLSearchParams(qs)
  if (searchParams.get("mobile") === "1" || searchParams.get("view") === "mobile") return true
  if (searchParams.has("mobile=1") || searchParams.has("view=mobile")) return true
  if (typeof window !== "undefined") {
    const raw = window.location.search || ""
    try {
      const decoded = decodeURIComponent(raw)
      if (decoded.includes("mobile=1") || decoded.includes("view=mobile")) return true
    } catch {
      if (raw.includes("mobile%3D1") || raw.includes("view%3Dmobile")) return true
    }
  }
  if (searchParams.has("mobile") && searchParams.get("mobile") !== "0") return true
  return false
}

export function useViewportLayout(): { isDesktop: boolean; forceMobile: boolean } {
  const pathname = usePathname()
  const search = useClientSearchString()
  const forceMobile = useMemo(() => computeForceMobile(pathname, search), [pathname, search])
  const [isDesktopMedia, setIsDesktopMedia] = useState(false)

  const media = useMemo(
    () => ({
      primary: DESKTOP_MEDIA_PRIMARY,
      secondary: DESKTOP_MEDIA_SECONDARY,
    }),
    [],
  )

  useEffect(() => {
    if (forceMobile) {
      setIsDesktopMedia(false)
      return
    }

    const mqPrimary = window.matchMedia(media.primary)
    const mqSecondary = window.matchMedia(media.secondary)

    const update = () => setIsDesktopMedia(mqPrimary.matches || mqSecondary.matches)
    update()

    const addChangeListener = (mq: MediaQueryList, cb: () => void) => {
      const anyMq = mq as unknown as {
        addEventListener?: (type: "change", listener: () => void) => void
        removeEventListener?: (type: "change", listener: () => void) => void
        addListener?: (listener: () => void) => void
        removeListener?: (listener: () => void) => void
      }
      if (anyMq.addEventListener) anyMq.addEventListener("change", cb)
      else if (anyMq.addListener) anyMq.addListener(cb)
    }
    const removeChangeListener = (mq: MediaQueryList, cb: () => void) => {
      const anyMq = mq as unknown as {
        addEventListener?: (type: "change", listener: () => void) => void
        removeEventListener?: (type: "change", listener: () => void) => void
        addListener?: (listener: () => void) => void
        removeListener?: (listener: () => void) => void
      }
      if (anyMq.removeEventListener) anyMq.removeEventListener("change", cb)
      else if (anyMq.removeListener) anyMq.removeListener(cb)
    }

    addChangeListener(mqPrimary, update)
    addChangeListener(mqSecondary, update)
    window.addEventListener("orientationchange", update)
    window.addEventListener("resize", update)
    return () => {
      removeChangeListener(mqPrimary, update)
      removeChangeListener(mqSecondary, update)
      window.removeEventListener("orientationchange", update)
      window.removeEventListener("resize", update)
    }
  }, [forceMobile, media.primary, media.secondary])

  return {
    forceMobile,
    isDesktop: forceMobile ? false : isDesktopMedia,
  }
}

export function useIsDesktop(): boolean {
  return useViewportLayout().isDesktop
}
