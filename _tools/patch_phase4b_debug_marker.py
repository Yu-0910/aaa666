from pathlib import Path

path = Path("app/players/[playerId]/PlayerPageClient.tsx")
text = path.read_text(encoding="utf-8")

needle = '''      {/* Main Content */}
      <main
'''

insert = '''      {/* Phase 4-B debug: temporary */}
      <div
        style={{
          position: "fixed",
          zIndex: 99999,
          right: 8,
          bottom: 8,
          padding: "6px 8px",
          background: "#111",
          color: "#fff",
          border: "1px solid #ffff44",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        phase4B debug / hasProfileOnly: {String(hasProfileOnly)} / pageShellReady: {String(pageShellReady)} / isRoster: {String(isRosterPlayer)}
      </div>

      {/* Main Content */}
      <main
'''

if "phase4B debug / hasProfileOnly" in text:
    print("debug already exists")
elif needle not in text:
    raise SystemExit("FAILED: main marker not found")
else:
    text = text.replace(needle, insert, 1)
    path.write_text(text, encoding="utf-8")
    print("patched debug marker")
