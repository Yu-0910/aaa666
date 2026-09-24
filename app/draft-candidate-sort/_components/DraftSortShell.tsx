import Link from "next/link"
import type { ReactNode } from "react"

const steps = [
  { href: "/draft-candidate-sort", label: "対象選択" },
  { href: "/draft-candidate-sort/sort", label: "比較" },
  { href: "/draft-candidate-sort/complete", label: "完了確認" },
  { href: "/draft-candidate-sort/processing", label: "作成中" },
  { href: "/draft-candidate-sort/result", label: "結果" },
]

type DraftSortShellProps = {
  currentStep: string
  title: string
  description: string
  children: ReactNode
}

export function DraftSortShell({
  currentStep,
  title,
  description,
  children,
}: DraftSortShellProps) {
  return (
    <main className="min-h-screen bg-[#23272a] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <nav aria-label="進行状況" className="mb-8 overflow-x-auto">
          <ol className="flex min-w-max items-center gap-2 text-sm">
            {steps.map((step, index) => {
              const active = step.label === currentStep
              return (
                <li key={step.href} className="flex items-center gap-2">
                  <Link
                    href={step.href}
                    className={[
                      "rounded border px-3 py-2 transition",
                      active
                        ? "border-[#ffff44] bg-[#ffff44] text-[#23272a]"
                        : "border-[#333] bg-[#1a1a1a] text-white hover:border-[#ffff44]",
                    ].join(" ")}
                  >
                    {index + 1}. {step.label}
                  </Link>
                  {index < steps.length - 1 ? (
                    <span className="text-white/30">/</span>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </nav>

        <section className="mb-8">
          <p className="mb-2 text-sm font-semibold text-[#ffff44]">
            2026ドラフト候補ソート
          </p>
          <h1 className="text-3xl font-bold tracking-normal sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-white/70">
            {description}
          </p>
        </section>

        <div className="flex-1">{children}</div>

        <footer className="mt-10 border-t border-[#333] py-5 text-xs leading-6 text-white/50">
          <p>
            候補者情報は公開されている情報をもとに作成しています。
            最新情報は各公式・関連情報をご確認ください。
          </p>
          <p>
            本ページの順位はユーザーの選択結果に基づく個人的な予想・好み表です。
          </p>
        </footer>
      </div>
    </main>
  )
}
