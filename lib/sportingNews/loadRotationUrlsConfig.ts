import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import type { SportingNewsRotationUrlsConfig } from "@/lib/sportingNews/types"

export function sportingNewsRotationUrlsConfigPath(
  projectRoot: string,
  year: string,
): string {
  return path.join(projectRoot, "_data", "config", `sportingnews_rotation_urls_${year}.json`)
}

export function loadSportingNewsRotationUrlsConfig(
  year: string,
  projectRoot = getProjectRoot(),
): SportingNewsRotationUrlsConfig {
  const configPath = sportingNewsRotationUrlsConfigPath(projectRoot, year)
  if (!fs.existsSync(configPath)) {
    throw new Error(`Sporting News URL config not found: ${configPath}`)
  }
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as SportingNewsRotationUrlsConfig
  if (raw.schemaVersion !== "sportingnews-rotation-urls-v1") {
    throw new Error(`Unsupported config schema: ${raw.schemaVersion}`)
  }
  if (!Array.isArray(raw.teams) || raw.teams.length === 0) {
    throw new Error(`No teams in config: ${configPath}`)
  }
  return raw
}

export function sportingNewsRotationSnapshotPath(
  projectRoot: string,
  year: string,
  teamCode: string,
): string {
  return path.join(
    projectRoot,
    "_data",
    "external",
    "sportingnews_rotation",
    year,
    `${teamCode}.json`,
  )
}
