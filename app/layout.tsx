import type React from "react"
import type { Metadata } from "next"
import { Bebas_Neue, Inter, Noto_Sans_JP } from "next/font/google"
import AnalyticsWrapper from "@/components/AnalyticsWrapper"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-jp",
  display: "swap",
})

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas-neue",
  display: "swap",
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
    <html
      lang="ja"
      className={`${inter.variable} ${notoSansJp.variable} ${bebasNeue.variable}`}
      suppressHydrationWarning
    >
      <body
        className="font-sans antialiased"
        suppressHydrationWarning
      >
        {children}
        <AnalyticsWrapper />
      </body>
    </html>
  )
}
