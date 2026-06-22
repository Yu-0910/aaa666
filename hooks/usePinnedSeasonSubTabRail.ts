"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"

export type SubTabPinBox = {
  left: number
  width: number
  height: number
  spacerHeight: number
  targetTopOffset: number
}

const PINNED_SURFACE_BG = "linear-gradient(135deg, #000000 0%, #1a1a1a 100%)"

/**
 * タブ行の固定／解除。スクロール速度に依存しないよう rAF で毎フレーム判定し、
 * 見た目は React を待たず DOM へ直接反映する。
 */
export function usePinnedSeasonSubTabRail(enabled: boolean) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef<HTMLDivElement>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const pinTargetRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(false)
  const spacerHeightRef = useRef(0)
  const [pinned, setPinned] = useState(false)
  const [pinBox, setPinBox] = useState<SubTabPinBox>({
    left: 0,
    width: 0,
    height: 0,
    spacerHeight: 0,
    targetTopOffset: 0,
  })

  const measurePinTop = useCallback(() => {
    const headerEl = document.querySelector("header")
    if (!headerEl) return 0
    return headerEl.getBoundingClientRect().bottom
  }, [])

  const measurePinBox = useCallback((useCachedSpacer: boolean): SubTabPinBox | null => {
    const outer = outerRef.current
    const target = pinTargetRef.current
    const anchor = anchorRef.current
    if (!outer || !target || !anchor) return null
    const outerRect = outer.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const spacerHeight = useCachedSpacer
      ? spacerHeightRef.current
      : Math.round(anchor.offsetHeight)
    return {
      left: Math.round(outerRect.left),
      width: Math.round(outer.offsetWidth),
      height: Math.round(targetRect.height),
      spacerHeight,
      targetTopOffset: Math.round(targetRect.top - outerRect.top),
    }
  }, [])

  useLayoutEffect(() => {
    if (!enabled) {
      pinnedRef.current = false
      spacerHeightRef.current = 0
      setPinned(false)
      setPinBox({ left: 0, width: 0, height: 0, spacerHeight: 0, targetTopOffset: 0 })
      return
    }

    let connectRaf = 0
    let tickRaf = 0
    let lastPinBoxKey = ""

    const applyPinnedDom = (box: SubTabPinBox, pinTop: number) => {
      const outer = outerRef.current
      const spacer = spacerRef.current
      if (!outer) return
      if (spacer) spacer.style.height = `${box.spacerHeight}px`
      const top = Math.round(pinTop - box.targetTopOffset)
      outer.style.position = "fixed"
      outer.style.top = `${top}px`
      outer.style.left = `${box.left}px`
      outer.style.width = `${box.width}px`
      outer.style.height = `${box.height}px`
      outer.style.overflow = "hidden"
      outer.style.zIndex = "35"
      outer.style.background = PINNED_SURFACE_BG
    }

    const clearPinnedDom = () => {
      const outer = outerRef.current
      const spacer = spacerRef.current
      if (spacer) spacer.style.height = "0px"
      if (!outer) return
      outer.style.position = ""
      outer.style.top = ""
      outer.style.left = ""
      outer.style.width = ""
      outer.style.height = ""
      outer.style.overflow = ""
      outer.style.zIndex = ""
      outer.style.background = ""
    }

    const syncReactState = (nextPinned: boolean, box: SubTabPinBox | null) => {
      pinnedRef.current = nextPinned
      setPinned(nextPinned)
      if (box) setPinBox(box)
    }

    const update = () => {
      const anchor = anchorRef.current
      const target = pinTargetRef.current
      const outer = outerRef.current
      if (!anchor || !target || !outer) return

      const pinTop = measurePinTop()
      const anchorTop = anchor.getBoundingClientRect().top
      const targetTop = target.getBoundingClientRect().top

      const nextPinned = pinnedRef.current
        ? anchorTop <= pinTop
        : targetTop <= pinTop

      if (nextPinned) {
        const measureBeforePin = !pinnedRef.current
        if (measureBeforePin) {
          spacerHeightRef.current = Math.round(anchor.offsetHeight)
        }
        const box = measurePinBox(!measureBeforePin)
        if (!box) return
        // 固定瞬間はタブの現在位置を維持（オーバーシュート時の見出し距離ずれ防止）。以降はヘッダー下端に追従
        const stickTop = measureBeforePin ? targetTop : pinTop
        applyPinnedDom(box, stickTop)

        const boxKey = `${box.left}|${box.width}|${box.height}|${box.spacerHeight}|${box.targetTopOffset}|${Math.round(pinTop)}`
        const stateChanged = nextPinned !== pinnedRef.current || boxKey !== lastPinBoxKey
        if (stateChanged) {
          lastPinBoxKey = boxKey
          syncReactState(true, box)
        }
      } else {
        clearPinnedDom()
        if (pinnedRef.current) {
          lastPinBoxKey = ""
          spacerHeightRef.current = 0
          syncReactState(false, null)
        }
      }
    }

    const tick = () => {
      update()
      tickRaf = requestAnimationFrame(tick)
    }

    const ro = new ResizeObserver(update)

    const connectObservers = () => {
      if (!anchorRef.current || !spacerRef.current || !pinTargetRef.current || !outerRef.current) {
        connectRaf = requestAnimationFrame(connectObservers)
        return
      }
      ro.disconnect()
      for (const el of [
        anchorRef.current,
        spacerRef.current,
        outerRef.current,
        pinTargetRef.current,
      ]) {
        if (el) ro.observe(el)
      }
      tickRaf = requestAnimationFrame(tick)
      update()
    }

    connectObservers()

    window.addEventListener("resize", update)
    window.addEventListener("touchstart", update, { passive: true })
    window.addEventListener("wheel", update, { passive: true })

    return () => {
      cancelAnimationFrame(connectRaf)
      cancelAnimationFrame(tickRaf)
      window.removeEventListener("resize", update)
      window.removeEventListener("touchstart", update)
      window.removeEventListener("wheel", update)
      ro.disconnect()
      clearPinnedDom()
    }
  }, [enabled, measurePinTop, measurePinBox])

  return { anchorRef, spacerRef, outerRef, pinTargetRef, pinned, pinBox }
}
