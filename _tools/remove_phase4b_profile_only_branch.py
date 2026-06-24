from pathlib import Path
import re

path = Path("app/players/[playerId]/PlayerPageClient.tsx")
text = path.read_text(encoding="utf-8")
original = text

# 1. hasProfileOnly useMemo を削除
text = re.sub(
    r'\n  const hasProfileOnly = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[isRosterPlayer, profileMergedSettled, profileMerged\]\)\n',
    '\n',
    text,
    count=1,
)

# 2. もし profileOnlyTableProps が残っていれば削除
text = re.sub(
    r'\n  const profileOnlyTableProps = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[profileMerged, profileTableProps\]\)\n',
    '\n',
    text,
    count=1,
)

# 3. loading分岐を元に戻す
text = text.replace(
    "        {!pageShellReady && !hasProfileOnly ? (",
    "        {!pageShellReady ? (",
    1,
)

# 4. profile-only専用分岐を丸ごと削除し、通常ページ分岐へ戻す
start = text.find("        ) : hasProfileOnly ? (")
end_marker = '''        ) : (
          <>
            {/* Player Name & Stats Tabs */}'''

if start != -1:
    end = text.find(end_marker, start)
    if end == -1:
        raise SystemExit("FAILED: normal branch marker not found after hasProfileOnly branch")
    text = text[:start] + end_marker + text[end + len(end_marker):]
else:
    print("profile-only branch not found; maybe already removed")

if text == original:
    print("No changes")
else:
    path.write_text(text, encoding="utf-8")
    print(f"patched: removed profile-only branch from {path}")
