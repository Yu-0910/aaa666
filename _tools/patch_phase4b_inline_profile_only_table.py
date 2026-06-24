from pathlib import Path
import re

path = Path("app/players/[playerId]/PlayerPageClient.tsx")
text = path.read_text(encoding="utf-8")
original = text

branch_start = text.find(") : hasProfileOnly ? (")
if branch_start == -1:
    raise SystemExit("FAILED: hasProfileOnly branch not found")

pattern = re.compile(
    r'''<PlayerPageProfileTableBlock
\s+\{\.\.\.profileTableProps\}
\s+mergedBirthRaw=\{String\(profileMerged\?\.profile\?\.birth_date_raw \?\? ""\)\.trim\(\)\}
\s+mergedProDebut=\{String\(profileMerged\?\.profile\?\.pro_debut_raw \?\? ""\)\.trim\(\)\}
\s+mergedCareer=\{String\(profileMerged\?\.profile\?\.career_raw \?\? ""\)\.trim\(\)\}
\s+/>''',
    re.MULTILINE,
)

match = pattern.search(text, branch_start)
if not match:
    print("FAILED: direct props table block not found")
    print(text[branch_start:branch_start + 1800])
    raise SystemExit(1)

replacement = '''<div className="overflow-hidden border border-[#333333] bg-[#111111]">
                <div className="grid grid-cols-[120px_1fr] border-b border-[#333333]">
                  <div
                    className="px-4 py-3 text-sm font-black"
                    style={{ backgroundColor: "#FFFF44", color: "#000000" }}
                  >
                    生年月日
                  </div>
                  <div className="px-4 py-3 text-sm font-bold text-white">
                    {String(profileMerged?.profile?.birth_date_raw ?? "").trim()}
                  </div>
                </div>
                <div className="grid grid-cols-[120px_1fr] border-b border-[#333333]">
                  <div
                    className="px-4 py-3 text-sm font-black"
                    style={{ backgroundColor: "#FFFF44", color: "#000000" }}
                  >
                    プロ入り
                  </div>
                  <div className="px-4 py-3 text-sm font-bold text-white">
                    {String(profileMerged?.profile?.pro_debut_raw ?? "").trim()}
                  </div>
                </div>
                <div className="grid grid-cols-[120px_1fr]">
                  <div
                    className="px-4 py-3 text-sm font-black"
                    style={{ backgroundColor: "#FFFF44", color: "#000000" }}
                  >
                    経歴
                  </div>
                  <div className="px-4 py-3 text-sm font-bold text-white">
                    {String(profileMerged?.profile?.career_raw ?? "").trim()}
                  </div>
                </div>
              </div>'''

text = text[:match.start()] + replacement + text[match.end():]

if text == original:
    print("No changes")
else:
    path.write_text(text, encoding="utf-8")
    print(f"patched inline profile-only table: {path}")
