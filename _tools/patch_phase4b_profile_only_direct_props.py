from pathlib import Path
import re

path = Path("app/players/[playerId]/PlayerPageClient.tsx")
text = path.read_text(encoding="utf-8")
original = text

# profile-only 分岐内の PlayerPageProfileTableBlock 呼び出しだけ置換する
branch_start = text.find(") : hasProfileOnly ? (")
if branch_start == -1:
    raise SystemExit("FAILED: hasProfileOnly branch not found")

# profile-only 分岐の中にある最初の PlayerPageProfileTableBlock を探す
pattern = re.compile(r"<PlayerPageProfileTableBlock\s+\{\.\.\.(profileOnlyTableProps|profileTableProps)\}\s*/>")
match = pattern.search(text, branch_start)

if not match:
    print("No simple profile table spread call found in profile-only branch.")
    print("Show context:")
    snippet = text[branch_start:branch_start + 2500]
    print(snippet)
    raise SystemExit(1)

replacement = '''<PlayerPageProfileTableBlock
                {...profileTableProps}
                mergedBirthRaw={String(profileMerged?.profile?.birth_date_raw ?? "").trim()}
                mergedProDebut={String(profileMerged?.profile?.pro_debut_raw ?? "").trim()}
                mergedCareer={String(profileMerged?.profile?.career_raw ?? "").trim()}
              />'''

text = text[:match.start()] + replacement + text[match.end():]

if text == original:
    print("No changes")
else:
    path.write_text(text, encoding="utf-8")
    print(f"patched: {path}")
