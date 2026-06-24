from pathlib import Path

path = Path("app/players/[playerId]/PlayerPageClient.tsx")
text = path.read_text(encoding="utf-8")

if "phase4bProfileMergedRequestId" in text:
    print("phase4b profile fetch already exists")
else:
    marker = '''  const hasProfileOnly = useMemo(() => {
    if (isRosterPlayer || !profileMergedSettled || !profileMerged?.profile) return false
    const p = profileMerged.profile
    return Boolean(
      String(p.birth_date_raw ?? "").trim() ||
        String(p.pro_debut_raw ?? "").trim() ||
        String(p.career_raw ?? "").trim(),
    )
  }, [isRosterPlayer, profileMergedSettled, profileMerged])
'''

    if marker not in text:
        raise SystemExit("FAILED: hasProfileOnly block marker not found")

    addition = '''
  const phase4bProfileMergedRequestId = String(playerIdNormalized || seasonPilotPlayerId || "").trim()

  useEffect(() => {
    if (!phase4bProfileMergedRequestId) {
      setProfileMerged(null)
      setProfileMergedSettled(true)
      return
    }

    let cancelled = false
    setProfileMergedSettled(false)

    fetch(`/api/players/${encodeURIComponent(phase4bProfileMergedRequestId)}/profile-merged`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { hasData?: boolean; payload?: ProfileMergedPayload } | null) => {
        if (cancelled) return
        setProfileMerged(data?.hasData && data.payload ? data.payload : null)
      })
      .catch(() => {
        if (!cancelled) setProfileMerged(null)
      })
      .finally(() => {
        if (!cancelled) setProfileMergedSettled(true)
      })

    return () => {
      cancelled = true
    }
  }, [phase4bProfileMergedRequestId])
'''

    text = text.replace(marker, marker + addition, 1)
    path.write_text(text, encoding="utf-8")
    print(f"patched generic profile-merged fetch: {path}")
