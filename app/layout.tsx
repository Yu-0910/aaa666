import type React from "react"
import type { Metadata } from "next"
import { Inter, Noto_Sans_JP, Bebas_Neue } from "next/font/google"
import AnalyticsWrapper from "@/components/AnalyticsWrapper"
import "./globals.css"

const _inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const _notoSansJP = Noto_Sans_JP({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-jp",
})

const _bebasNeue = Bebas_Neue({
  weight: ["400"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bebas-neue",
})

export const metadata: Metadata = {
  title: "NPB打撃成績ランキング - プロ野球選手の詳細データ",
  description: "NPBプロ野球選手の打撃成績をランキング形式で表示。OPS、打率、本塁打、打点など各種指標で比較できます。",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* Bebas Neueフォントはnext/fontで読み込まれているため、このリンクは不要ですが、互換性のために残しています */}
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Serif+JP:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body 
        className={`font-sans antialiased ${_inter.variable} ${_notoSansJP.variable} ${_bebasNeue.variable}`}
        suppressHydrationWarning
      >
        {children}
        <AnalyticsWrapper />
      </body>
    </html>
  )
}
