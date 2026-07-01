import type { Metadata } from "next"
import Link from "next/link"
import StaticPageLayout from "@/app/components/common/StaticPageLayout"

export const metadata: Metadata = {
  title: "プライバシーポリシー | Short-Stop",
  description: "Short-Stopのプライバシーポリシーです。",
}

export default function PrivacyPolicyPage() {
  return (
    <StaticPageLayout
      title="プライバシーポリシー"
      description="当サイトでは、利用者の情報の取り扱いに配慮し、必要な範囲で情報を取得・利用します。"
    >
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">個人情報の取得について</h2>
        <p>
          当サイトでは、お問い合わせなどの際に、氏名や連絡先などの情報をご提供いただく場合があります。取得する情報は、必要な範囲に限って取り扱います。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">個人情報の利用目的</h2>
        <p>
          取得した情報は、お問い合わせへの対応、必要な連絡、掲載内容の確認や改善のために利用します。ご本人の同意がある場合や法令に基づく場合を除き、目的外で利用することはありません。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">Cookieの使用について</h2>
        <p>
          当サイトでは、利便性の向上やアクセス状況の把握、広告配信の最適化などのためにCookieを使用する場合があります。Cookieにより、利用環境や閲覧状況に関する情報が取得されることがあります。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">広告配信について</h2>
        <p>
          当サイトでは、今後Google AdSenseなどの第三者配信広告を利用する場合があります。広告配信事業者は、ユーザーの興味に応じた広告を表示するためにCookieなどの情報を利用することがあります。
        </p>
        <p>
          広告配信に関する詳細は、各広告配信事業者の案内をご確認ください。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">アクセス解析ツールについて</h2>
        <p>
          当サイトでは、利用状況の把握や改善のために、Googleアナリティクス等のアクセス解析ツールを利用する場合があります。これらのツールでは、トラフィックデータ収集のためにCookie等が使用されることがあります。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">お問い合わせ時に取得する情報について</h2>
        <p>
          お問い合わせの際にご提供いただいた情報は、内容確認や返信が必要な場合の連絡のために利用します。取得した情報は、対応に必要な範囲でのみ扱います。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">個人情報の管理</h2>
        <p>
          取得した情報については、不正アクセス、漏えい、紛失などが生じないよう、適切な管理に努めます。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">外部リンクについて</h2>
        <p>
          当サイトには、外部サイトへのリンクが含まれる場合があります。リンク先で提供される情報やサービス、個人情報の取り扱いについては、各リンク先の方針をご確認ください。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">免責事項</h2>
        <p>
          当サイトの掲載情報については、できる限り正確な内容となるよう努めていますが、その正確性や完全性を保証するものではありません。詳細は
          <Link href="/disclaimer" className="mx-1 text-[#ffff44] underline-offset-4 hover:underline">
            免責事項
          </Link>
          をご確認ください。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[#ffff44] sm:text-xl">プライバシーポリシーの改定について</h2>
        <p>
          当サイトは、必要に応じて本ポリシーの内容を見直し、改定することがあります。改定後の内容は、本ページに掲載した時点から適用されるものとします。
        </p>
      </section>
    </StaticPageLayout>
  )
}
