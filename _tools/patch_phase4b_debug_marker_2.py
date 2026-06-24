from pathlib import Path

path = Path("app/players/[playerId]/PlayerPageClient.tsx")
text = path.read_text(encoding="utf-8")

old = '''        phase4B debug / hasProfileOnly: {String(hasProfileOnly)} / pageShellReady: {String(pageShellReady)} / isRoster: {String(isRosterPlayer)}'''

new = '''        phase4B debug / hasProfileOnly: {String(hasProfileOnly)} / pageShellReady: {String(pageShellReady)} / isRoster: {String(isRosterPlayer)} / mergedSettled: {String(profileMergedSettled)} / hasProfile: {String(Boolean(profileMerged?.profile))} / mergedId: {String(profileMerged?.npb_player_id || "")}'''

if new in text:
    print("debug already enhanced")
elif old not in text:
    raise SystemExit("FAILED: debug line not found")
else:
    text = text.replace(old, new, 1)
    path.write_text(text, encoding="utf-8")
    print("enhanced debug marker")
