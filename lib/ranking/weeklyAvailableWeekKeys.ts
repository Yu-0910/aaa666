export function mergeAvailableWeekKeys(
  ...groups: Array<readonly string[] | string | null | undefined>
): string[] {
  const merged = new Set<string>()
  for (const group of groups) {
    if (typeof group === "string") {
      const wk = group.trim()
      if (wk) merged.add(wk)
      continue
    }
    for (const value of group ?? []) {
      const wk = String(value ?? "").trim()
      if (wk) merged.add(wk)
    }
  }
  return [...merged].sort().reverse()
}
