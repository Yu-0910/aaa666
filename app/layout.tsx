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
  applicationName: "Short-Stop",
  title: "NPB打撃成績ランキング - プロ野球選手の詳細データ",
  description: "NPBプロ野球選手の打撃成績をランキング形式で表示。OPS、打率、本塁打、打点など各種指標で比較できます。",
  generator: "v0.app",
  manifest: "/manifest.webmanifest?v=3",
  verification: {
    google: "kKv1BMYikT9gulfJnk8IZvMreBFL9TURx42GS1nituI",
  },
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
      {
        url: "/app-icon-192-v2.png?v=3",
        sizes: "192x192",
        type: "image/png",
      },
    ],
    apple: {
      url: "/apple-icon-v2.png?v=3",
      sizes: "180x180",
      type: "image/png",
    },
  },
  appleWebApp: {
    capable: true,
    title: "Short-Stop",
    statusBarStyle: "black-translucent",
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
      <head>
        <link rel="manifest" href="/manifest.webmanifest?v=3" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon-v2.png?v=3" />
        <link rel="apple-touch-icon-precomposed" sizes="180x180" href="/apple-icon-v2.png?v=3" />
        <link rel="icon" type="image/png" sizes="192x192" href="/app-icon-192-v2.png?v=3" />
        <link rel="icon" type="image/png" sizes="512x512" href="/app-icon-512-v2.png?v=3" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Short-Stop" />
        <meta name="theme-color" content="#000000" />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5927852752448438"
          crossOrigin="anonymous"
        />
      </head>
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
