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

const contactFormUrl = "https://forms.gle/fnDLaqCVrWRWyvzq6"
const xAccountUrl = "https://x.com/Yu_gekish"

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
          掲載データの誤り、表示不具合、広告掲載に関するご相談、その他サイトに関するお問い合わせは、以下のフォームよりご連絡ください。
        </p>
        <a
          href={contactFormUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md border border-[#ffff44] bg-[#ffff44] px-5 py-3 text-sm font-bold text-black transition hover:bg-[#f0f03a]"
        >
          Googleフォームで問い合わせる
        </a>
        <p>
          ご連絡内容によっては確認や対応までに時間をいただく場合があります。あらかじめご了承ください。
        </p>
        <p className="text-sm text-gray-300">
          フォームの利用が難しい場合は、補助的な連絡先として
          {" "}
          <a
            href={xAccountUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#ffff44] underline underline-offset-4 hover:text-white"
          >
            Xアカウント
          </a>
          {" "}
          からご連絡いただくこともできます。
        </p>
      </section>
    </StaticPageLayout>
  )
}
