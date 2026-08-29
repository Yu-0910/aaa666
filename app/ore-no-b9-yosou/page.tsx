import type { Metadata } from "next"
import {
  BaseballFieldLineup,
  type BaseballFieldLineupPlayer,
} from "@/app/components/oreNoB9/BaseballFieldLineup"

export const metadata: Metadata = {
  title: "#俺のB9予想 | Short-Stop",
  description: "Short-Stop の #俺のB9予想 ページです。",
}

const sampleLineup: BaseballFieldLineupPlayer[] = [
  { position: "CF", name: "近本光司", shortName: "C.CHIKAMOTO", age: 31, team: "H", ops: ".890", avg: ".381", hr: 0 },
  { position: "LF", name: "細川成也", shortName: "S.HOSOKAWA", age: 28, team: "D", ops: "1.072", avg: ".263", hr: 2 },
  { position: "RF", name: "森下翔太", shortName: "S.MORISHITA", age: 26, team: "H", ops: "1.324", avg: ".500", hr: 2 },
  { position: "SS", name: "宮下朝陽", shortName: "A.MIYASHITA", age: 22, team: "DB", ops: ".767", avg: ".214", hr: 1 },
  { position: "2B", name: "サノー", shortName: "M.SANO", age: 33, team: "D", ops: ".944", avg: ".261", hr: 3 },
  { position: "3B", name: "佐藤輝明", shortName: "T.SATO", age: 27, team: "H", ops: "1.171", avg: ".381", hr: 2 },
  { position: "1B", name: "内山壮真", shortName: "S.UCHIYAMA", age: 24, team: "S", ops: "1.197", avg: ".471", hr: 0 },
  { position: "P", name: "大城卓三", shortName: "T.OHSHIRO", age: 33, team: "G", ops: ".971", avg: ".412", hr: 0 },
  { position: "C", name: "佐々木俊輔", shortName: "S.SASAKI", age: 26, team: "G", ops: ".766", avg: ".348", hr: 0 },
]

export default function OreNoB9YosouPage() {
  return (
    <main className="min-h-screen bg-[#060b07] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1280px] items-center justify-center px-2 py-6 sm:px-4 sm:py-10">
        <BaseballFieldLineup players={sampleLineup} />
      </div>
    </main>
  )
}
