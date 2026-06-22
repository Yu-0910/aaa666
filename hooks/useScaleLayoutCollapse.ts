"use client"

import { useLayoutEffect, useRef, useState } from "react"

/** 投手プロフィール／今季ブロックの scale(0.7) と一致 */
export const PITCHER_PROFILE_UI_SCALE = 0.7

/**
 * transform: scale() は見た目だけ縮小しレイアウト高さは残るため、
 * 分割した scale ブロック間の不自然な余白を marginBottom で相殺する。
 */
export function useScaleLayoutCollapse(
  enabled: boolean,
  scale = PITCHER_PROFILE_UI_SCALE,
  resetOnDisable = true,
) {
  const ref = useRef<HTMLDivElement>(null)
  const [marginBottom, setMarginBottom] = useState(0)

  useLayoutEffect(() => {
    if (!enabled) {
      if (resetOnDisable) setMarginBottom(0)
      return
    }
    const el = ref.current
    if (!el) return

    const update = () => {
      const h = el.offsetHeight
      setMarginBottom(-Math.round(h * (1 - scale)))
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [enabled, scale, resetOnDisable])

  return { ref, marginBottom }
}
