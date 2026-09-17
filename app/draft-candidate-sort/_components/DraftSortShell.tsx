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
    <main className="min-h-screen bg-stone-50 text-slate-950">
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
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300",
                    ].join(" ")}
                  >
                    {index + 1}. {step.label}
                  </Link>
                  {index < steps.length - 1 ? (
                    <span className="text-slate-300">/</span>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </nav>

        <section className="mb-8">
          <p className="mb-2 text-sm font-semibold text-emerald-700">
            2026ドラフト候補ソート
          </p>
          <h1 className="text-3xl font-bold tracking-normal sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            {description}
          </p>
        </section>

        <div className="flex-1">{children}</div>

        <footer className="mt-10 border-t border-slate-200 py-5 text-xs leading-6 text-slate-500">
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
