import type { ProfileMergedPayload } from "./playerPageShared"

type Props = {
  mergedBirthRaw: string
  mergedProDebut: string
  mergedCareer: string
  mergedSalaryTotalPlain: string
  mergedFaDisplay: string
  profileMerged: ProfileMergedPayload
}

export function PlayerPageProfileTableBlock({
  mergedBirthRaw,
  mergedProDebut,
  mergedCareer,
  mergedSalaryTotalPlain,
  mergedFaDisplay,
  profileMerged,
}: Props) {
  return (
    <table className="w-full border-collapse" style={{ border: "1px solid #333333" }}>
      <tbody style={{ fontWeight: 900, lineHeight: 1.35, fontSize: "0.875rem" }}>
        <tr>
          <td
            className="px-2 py-1.5"
            style={{
              backgroundColor: "#FFFF44",
              color: "#000000",
              border: "1px solid #333333",
              width: "120px",
              fontWeight: 900,
            }}
          >
            生年月日
          </td>
          <td className="px-2 py-1.5" style={{ border: "1px solid #333333" }}>
            {mergedBirthRaw || "—"}
          </td>
        </tr>
        <tr>
          <td
            className="px-2 py-1.5"
            style={{
              backgroundColor: "#FFFF44",
              color: "#000000",
              border: "1px solid #333333",
              fontWeight: 900,
            }}
          >
            プロ入り
          </td>
          <td className="px-2 py-1.5" style={{ border: "1px solid #333333" }}>
            {mergedProDebut || "—"}
          </td>
        </tr>
        <tr>
          <td
            className="px-2 py-1.5"
            style={{
              backgroundColor: "#FFFF44",
              color: "#000000",
              border: "1px solid #333333",
              fontWeight: 900,
            }}
          >
            経歴
          </td>
          <td className="px-2 py-1.5" style={{ border: "1px solid #333333" }}>
            {mergedCareer || "—"}
          </td>
        </tr>
        <tr>
          <td
            className="px-2 py-1.5"
            style={{
              backgroundColor: "#FFFF44",
              color: "#000000",
              border: "1px solid #333333",
              fontWeight: 900,
            }}
          >
            生涯年俸
          </td>
          <td className="px-2 py-1.5" style={{ border: "1px solid #333333" }}>
            {mergedSalaryTotalPlain || "—"}
          </td>
        </tr>
        <tr>
          <td
            className="px-2 py-1.5"
            style={{
              backgroundColor: "#FFFF44",
              color: "#000000",
              border: "1px solid #333333",
              fontWeight: 900,
            }}
            title="国内FA取得見込み。facounter.net または通算出場成績からの概算（参考値）"
          >
            FA取得（推定）
          </td>
          <td
            className="px-2 py-1.5"
            style={{ border: "1px solid #333333" }}
            title={
              profileMerged?.faEstimate?.domesticFa?.note
                ? String(profileMerged.faEstimate.domesticFa.note)
                : undefined
            }
          >
            {mergedFaDisplay || "—"}
          </td>
        </tr>
      </tbody>
    </table>
  )
}
