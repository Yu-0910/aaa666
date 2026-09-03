"use client"

import Script from "next/script"
import { useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

const GA_MEASUREMENT_ID = "G-J8EWRCJXYL"

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

export default function GoogleAnalytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!isReady || !window.gtag || !pathname) {
      return
    }

    const query = searchParams?.toString()
    const pagePath = query ? `${pathname}?${query}` : pathname

    window.gtag("event", "page_view", {
      page_path: pagePath,
      page_location: window.location.href,
      send_to: GA_MEASUREMENT_ID,
    })
  }, [isReady, pathname, searchParams])

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        onReady={() => setIsReady(true)}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', {
            send_page_view: false
          });
        `}
      </Script>
    </>
  )
}
