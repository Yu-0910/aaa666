import { ImageResponse } from "next/og"
import { createElement } from "react"

export const runtime = "edge"

const CARD_SIZE = {
  width: 1200,
  height: 630,
} as const

const TOP_SHARE_PHOTO_URL = "https://short-stop.jp/baseball-mvp.jpg"

export function GET() {
  return new ImageResponse(
    createElement(
      "div",
      {
        style: {
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          backgroundColor: "#000000",
        },
      },
      createElement("img", {
        src: TOP_SHARE_PHOTO_URL,
        alt: "",
        style: {
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        },
      }),
    ),
    CARD_SIZE,
  )
}
