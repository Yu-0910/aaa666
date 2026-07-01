import type { Metadata } from "next"
import StaticPageLayout from "@/app/components/common/StaticPageLayout"

export const metadata: Metadata = {
  title: "お問い合わせ | Short-Stop",
  description: "Short-Stopへのお問い合わせ案内です。",
}

const contactTopics = [
  "掲載データの誤りに関するご連絡",
  "表示不具合やページ閲覧時の問題",
  "広告掲載に関するご相談",
  "その他、サイト運営に関するお問い合わせ",
]

export default function ContactPage() {
  return (
    <StaticPageLayout
      title="お問い合わせ"
      description="掲載内容の確認依頼やサイトに関するご連絡はこちらの案内をご確認ください。"
    >
      <section className="space-y-4">
        <p>当サイトでは、次のような内容についてのご連絡を受け付けています。</p>
        <ul className="list-disc space-y-2 pl-5 text-gray-200 marker:text-[#ffff44]">
          {contactTopics.map((topic) => (
            <li key={topic}>{topic}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">お問い合わせ方法</h2>
        <p>
          現在、お問い合わせ窓口の整備を進めています。掲載内容の誤りやサイトに関するご連絡は、運営者のSNS等を通じてお知らせください。
        </p>
        <p>
          ご連絡内容によっては確認や対応までに時間をいただく場合があります。あらかじめご了承ください。
        </p>
      </section>
    </StaticPageLayout>
  )
}
