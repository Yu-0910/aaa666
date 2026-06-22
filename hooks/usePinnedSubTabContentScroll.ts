"use client"

import { useLayoutEffect, useRef, type RefObject } from "react"

function measureHeaderPinTop(): number {
  const headerEl = document.querySelector("header")
  if (!headerEl) return 0
  return headerEl.getBoundingClientRect().bottom
}

/** タブ行がヘッダー直下に張り付いている（固定 pin 相当）か */
export function isSeasonSubTabAtViewportTop(
  pinTarget: HTMLElement | null,
  pinTop = measureHeaderPinTop(),
): boolean {
  if (!pinTarget) return false
  return pinTarget.getBoundingClientRect().top <= pinTop + 1
}

/** タブ直下から新タブ本文を見せるための scrollY 差分 */
export function seasonSubTabContentScrollDelta(
  pinTarget: HTMLElement | null,
  content: HTMLElement | null,
  pinTop = measureHeaderPinTop(),
): number | null {
  if (!pinTarget || !content) return null
  if (!isSeasonSubTabAtViewportTop(pinTarget, pinTop)) return null
  const tabBottom = pinTarget.getBoundingClientRect().bottom
  const contentTop = content.getBoundingClientRect().top
  const delta = contentTop - tabBottom
  if (Math.abs(delta) < 2) return null
  return delta
}

/**
 * 今季サブタブ切替時: タブ行が画面上部（ヘッダー直下）にあるなら、
 * 変更後の本文先頭がタブ行の直下から見えるよう scrollY を補正する。
 */
export function usePinnedSubTabContentScroll(options: {
  enabled: boolean
  tabKey: string
  pinTargetRef: RefObject<HTMLElement | null>
  contentRef: RefObject<HTMLElement | null>
}) {
  const { enabled, tabKey, pinTargetRef, contentRef } = options
  const prevTabKeyRef = useRef(tabKey)

  useLayoutEffect(() => {
    const tabChanged = prevTabKeyRef.current !== tabKey
    prevTabKeyRef.current = tabKey
    if (!enabled || !tabChanged) return

    const delta = seasonSubTabContentScrollDelta(
      pinTargetRef.current,
      contentRef.current,
    )
    if (delta == null) return

    window.scrollTo(0, window.scrollY + delta)
  }, [enabled, tabKey, pinTargetRef, contentRef])
}
