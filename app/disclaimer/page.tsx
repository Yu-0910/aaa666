import type { Metadata } from "next"
import Link from "next/link"
import StaticPageLayout from "@/app/components/common/StaticPageLayout"

export const metadata: Metadata = {
  title: "免責事項 | Short-Stop",
  description: "Short-Stopの免責事項です。",
}

export default function DisclaimerPage() {
  return (
    <StaticPageLayout
      title="免責事項"
      description="当サイトをご利用いただく際は、以下の内容をご確認ください。"
    >
      <section className="space-y-4">
        <p>
          当サイトでは、掲載情報の正確性に十分注意して情報を掲載していますが、その完全性、正確性、最新性を保証するものではありません。
        </p>
        <p>
          成績、ランキング、選手情報などは、更新タイミングや集計方法、参照元データの反映状況により、公式記録や他媒体の情報と差異が生じる場合があります。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">責任の範囲について</h2>
        <p>
          当サイトに掲載された情報を利用したことにより生じた損害や不利益について、当サイトでは責任を負いかねます。情報の利用にあたっては、ご自身の判断でご確認ください。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">外部リンクについて</h2>
        <p>
          当サイトからリンクしている外部サイトの内容、掲載情報、提供サービス等については、当サイトが管理するものではなく、責任を負いかねます。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">ご連絡について</h2>
        <p>
          掲載内容に問題がある場合や修正のご連絡は、
          <Link href="/contact" className="text-[#ffff44] underline-offset-4 hover:underline">
            お問い合わせページ
          </Link>
          をご確認のうえ、お知らせください。
        </p>
      </section>
    </StaticPageLayout>
  )
}
