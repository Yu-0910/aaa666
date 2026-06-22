type Props = {
  title: string
  phaseLabel: string
}

/** Phase 1: サブページ本文のプレースホルダー（Phase 2〜4 で差し替え） */
export default function TeamPageSubPlaceholder({ title, phaseLabel }: Props) {
  return (
    <div className="bg-[#1a1a1a] border border-[#333] px-4 py-8 text-center">
      <p className="text-sm text-gray-300 mb-2">{title}</p>
      <p className="text-xs text-gray-500">{phaseLabel} で実装予定</p>
    </div>
  )
}
