from pathlib import Path

path = Path("app/players/[playerId]/PlayerPageClient.tsx")
text = path.read_text(encoding="utf-8")

start_marker = '''      {/* Phase 4-B debug: temporary */}
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
'''

end_marker = '''      </div>

      {/* Main Content */}
'''

if start_marker not in text:
    print("debug start marker not found; maybe already removed")
else:
    start = text.index(start_marker)
    end = text.index(end_marker, start) + len("      </div>\n\n")
    text = text[:start] + text[end:]
    path.write_text(text, encoding="utf-8")
    print("removed phase4B debug marker")
