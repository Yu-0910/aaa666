"use client"

import { Suspense } from "react"
import { useParams } from "next/navigation"
import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import { FullPageLoading } from "@/components/ui/spinner"

function TopFallback() {
  return <FullPageLoading />
}

export default function YearTopPage() {
  const params = useParams()
  const y = Number(params?.year) || 2024

  return (
    <Suspense fallback={<TopFallback />}>
      <TopPageRoot initialYear={y} articlesMode="dummy" />
    </Suspense>
  )
}
