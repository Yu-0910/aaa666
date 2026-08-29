import { BaseballField } from "@/app/components/oreNoB9/BaseballField"
import { PlayerPositionCard } from "@/app/components/oreNoB9/PlayerPositionCard"

export type BaseballPosition = "CF" | "LF" | "RF" | "SS" | "2B" | "3B" | "1B" | "P" | "C"

export type BaseballFieldLineupPlayer = {
  age: number
  avg: string
  hr: number
  name: string
  ops: string
  position: BaseballPosition
  shortName: string
  team: string
}

const positionLayout: Record<BaseballPosition, { x: number; y: number }> = {
  CF: { x: 50, y: 14 },
  LF: { x: 20, y: 29 },
  RF: { x: 80, y: 29 },
  SS: { x: 34, y: 52 },
  "2B": { x: 66, y: 52 },
  "3B": { x: 17, y: 69 },
  P: { x: 50, y: 65 },
  "1B": { x: 83, y: 69 },
  C: { x: 50, y: 87 },
}

const positionLabels: Record<BaseballPosition, string> = {
  CF: "中堅手",
  LF: "左翼手",
  RF: "右翼手",
  SS: "遊撃手",
  "2B": "二塁手",
  "3B": "三塁手",
  P: "投手",
  "1B": "一塁手",
  C: "捕手",
}

type BaseballFieldLineupProps = {
  players: BaseballFieldLineupPlayer[]
}

export function BaseballFieldLineup({ players }: BaseballFieldLineupProps) {
  return (
    <section className="w-full">
      <div className="mx-auto w-full max-w-[1120px] px-3 py-4 sm:px-6 sm:py-6">
        <div className="relative mx-auto aspect-[100/122] w-full max-w-[980px] overflow-visible rounded-[2rem] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_42%),linear-gradient(180deg,_#162318_0%,_#0a120c_100%)] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] sm:p-5">
          <div className="absolute inset-3 sm:inset-5">
            <BaseballField className="h-full w-full" />
          </div>

          {players.map((player) => {
            const layout = positionLayout[player.position]
            if (!layout) return null

            return (
              <div
                key={player.position}
                className="absolute z-10 w-[27vw] min-w-[118px] max-w-[250px] -translate-x-1/2 -translate-y-1/2 sm:w-[24vw] md:w-[21vw] lg:w-[19vw]"
                style={{ left: `${layout.x}%`, top: `${layout.y}%` }}
              >
                <PlayerPositionCard
                  age={player.age}
                  avg={player.avg}
                  hr={player.hr}
                  name={player.name}
                  ops={player.ops}
                  positionLabel={positionLabels[player.position]}
                  shortName={player.shortName}
                  team={player.team}
                />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
