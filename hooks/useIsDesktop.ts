"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

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
 */
const DESKTOP_MEDIA_PRIMARY = "(min-width: 1024px)"
const DESKTOP_MEDIA_SECONDARY = "(min-width: 768px) and (min-height: 700px)"

/** URL に `?mobile=1` または `?view=mobile` があると PC 幅でもスマホ版 UI を表示（確認用） */
function useForceMobileFromSearch(): boolean {
  const searchParams = useSearchParams()
  // 正常系: ?mobile=1 / ?view=mobile
  if (searchParams.get("mobile") === "1" || searchParams.get("view") === "mobile") return true

  // 誤ってクエリ全体をエンコードしてしまうケース: ?mobile%3D1 (= key が "mobile=1" になる)
  // 例: http://localhost:3000/players/... ?mobile%3D1
  if (searchParams.has("mobile=1") || searchParams.has("view=mobile")) return true

  // さらに、クエリ全体が1つの値として入ってしまい searchParams から拾えないケースにも対応
  // 例: ?name%3D...%26roman%3D...%26mobile%3D1
  if (typeof window !== "undefined") {
    const raw = window.location.search || ""
    try {
      const decoded = decodeURIComponent(raw)
      if (decoded.includes("mobile=1") || decoded.includes("view=mobile")) return true
    } catch {
      if (raw.includes("mobile%3D1") || raw.includes("view%3Dmobile")) return true
    }
  }

  // ?mobile (値なし) を強制スマホ扱いにしたい場合
  if (searchParams.has("mobile") && searchParams.get("mobile") !== "0") return true

  return false
}

export function useIsDesktop(): boolean | undefined {
  const forceMobile = useForceMobileFromSearch()
  const [isDesktop, setIsDesktop] = useState<boolean | undefined>(undefined)

  const media = useMemo(() => {
    return {
      primary: DESKTOP_MEDIA_PRIMARY,
      secondary: DESKTOP_MEDIA_SECONDARY,
    }
  }, [])

  useEffect(() => {
    if (forceMobile) {
      setIsDesktop(false)
      return
    }

    const mqPrimary = window.matchMedia(media.primary)
    const mqSecondary = window.matchMedia(media.secondary)

    const update = () => setIsDesktop(mqPrimary.matches || mqSecondary.matches)
    update()

    const addChangeListener = (mq: MediaQueryList, cb: () => void) => {
      // Safari 等では addEventListener/removeEventListener が無いことがある
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

  return isDesktop
}
