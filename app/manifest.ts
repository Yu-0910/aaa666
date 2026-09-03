import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Short-Stop",
    short_name: "Short-Stop",
    description: "NPBプロ野球選手の打撃成績をランキング形式で表示します。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#23272A",
    theme_color: "#23272A",
    icons: [
      {
        src: "/app-icon-192-v2.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icon-512-v2.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icon-maskable-512-v2.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
