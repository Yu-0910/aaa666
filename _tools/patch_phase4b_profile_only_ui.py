from pathlib import Path

path = Path("app/players/[playerId]/PlayerPageClient.tsx")
text = path.read_text(encoding="utf-8")
original = text

marker = "const hasProfileOnly = useMemo(() => {"

if marker not in text:
    old = '''  const showSeasonCareerTabs =
    isRosterPlayer ||
    isAoyagiPage ||
    isKikuchiPage ||
    isFabianPage ||
    numericPilotIdFromPath ||
    /^\\d+$/.test(String(seasonPilotPlayerId || "").trim())

  /** 選手切替時のみタブを初期化（名簿照合後に通算タブへ戻さない） */
'''

    new = '''  const showSeasonCareerTabs =
    isRosterPlayer ||
    isAoyagiPage ||
    isKikuchiPage ||
    isFabianPage ||
    numericPilotIdFromPath ||
    /^\\d+$/.test(String(seasonPilotPlayerId || "").trim())

  const hasProfileOnly = useMemo(() => {
    if (isRosterPlayer || !profileMergedSettled || !profileMerged?.profile) return false
    const p = profileMerged.profile
    return Boolean(
      String(p.birth_date_raw ?? "").trim() ||
        String(p.pro_debut_raw ?? "").trim() ||
        String(p.career_raw ?? "").trim(),
    )
  }, [isRosterPlayer, profileMergedSettled, profileMerged])

  /** 選手切替時のみタブを初期化（名簿照合後に通算タブへ戻さない） */
'''

    if old not in text:
        raise SystemExit("FAILED: showSeasonCareerTabs insertion point not found")
    text = text.replace(old, new, 1)
else:
    print("skip: hasProfileOnly already exists")

old_loading = "        {!pageShellReady ? ("
new_loading = "        {!pageShellReady && !hasProfileOnly ? ("

if new_loading not in text:
    if old_loading not in text:
        raise SystemExit("FAILED: pageShellReady branch not found")
    text = text.replace(old_loading, new_loading, 1)
else:
    print("skip: loading branch already patched")

profile_only_block = '''        ) : hasProfileOnly ? (
          <>
            <div
              className={
                isMobile
                  ? "flex flex-row items-center justify-between gap-3 mb-8"
                  : "flex flex-row items-center justify-between gap-6 mb-8"
              }
            >
              <div>
                <h1
                  className={
                    isMobile
                      ? "text-3xl font-black tracking-tight"
                      : "text-5xl font-black tracking-tight"
                  }
                  style={{ color: "#FFFFFF" }}
                >
                  {String(
                    (profileMerged as { name_ja?: string } | null | undefined)?.name_ja ||
                      playerIdNormalized ||
                      "",
                  )}
                </h1>
                <p className="mt-2 text-sm font-bold text-[#999999]">プロフィール</p>
              </div>
            </div>

            <div
              className={
                isMobile
                  ? "mb-8 w-full"
                  : "mb-10 w-full"
              }
            >
              <PlayerPageProfileTableBlock {...profileTableProps} />
            </div>
          </>
'''

old_ready = '''        ) : (
          <>
            {/* Player Name & Stats Tabs */}
'''

new_ready = profile_only_block + '''        ) : (
          <>
            {/* Player Name & Stats Tabs */}
'''

if "        ) : hasProfileOnly ? (" not in text:
    if old_ready not in text:
        raise SystemExit("FAILED: ready branch insertion point not found")
    text = text.replace(old_ready, new_ready, 1)
else:
    print("skip: profile-only branch already exists")

if text == original:
    print("No changes")
else:
    path.write_text(text, encoding="utf-8")
    print(f"patched: {path}")
