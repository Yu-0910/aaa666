import type { Metadata } from "next"
import Link from "next/link"
import StaticPageLayout from "@/app/components/common/StaticPageLayout"

export const metadata: Metadata = {
  title: "このサイトについて | Short-Stop",
  description: "Short-Stopの運営方針とサイト概要です。",
}

export default function AboutPage() {
  return (
    <StaticPageLayout
      title="このサイトについて"
      description="Short-Stopは、プロ野球の成績やランキング、選手情報を見やすく整理して提供するための情報サイトです。"
    >
      <section className="space-y-4">
        <p>
          Short-Stopは、プロ野球の成績・ランキング・選手情報を、できるだけ見やすく比較しやすい形で整理して掲載することを目的としたサイトです。
        </p>
        <p>
          NPBの成績データや選手情報を、シーズン別、ランキング別、球団別などの切り口で確認しやすくし、日々の観戦や記録の振り返りに役立つ情報をまとめています。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">掲載情報について</h2>
        <p>
          当サイトは、NPB公式サイトおよび各球団公式サイトではありません。公開されている情報をもとに、独自に整理・集計した内容を掲載しています。
        </p>
        <p>
          データの正確性には十分注意していますが、更新のタイミング、集計方法、参照元データの反映状況などにより、公式記録と差異が生じる場合があります。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">ご連絡について</h2>
        <p>
          掲載内容に誤りや気になる点がありましたら、
          <Link href="/contact" className="text-[#ffff44] underline-offset-4 hover:underline">
            お問い合わせページ
          </Link>
          からご連絡ください。確認のうえ、必要に応じて見直しを行います。
        </p>
      </section>
    </StaticPageLayout>
  )
}
