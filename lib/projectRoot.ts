/**
 * Next / tsx のカレントがサブディレクトリでも `_data` を確実に辿る。
 * `next.config.mjs` の `TOPPAGE_PROJECT_ROOT`（設定ファイルのディレクトリ＝リポジトリルート）を最優先。
 */

import fs from "fs"
import path from "path"

function hasRepoMarkers(dir: string): boolean {
  return fs.existsSync(path.join(dir, "package.json")) && fs.existsSync(path.join(dir, "_data"))
}

/**
 * `startDir` から親を辿り、`package.json` と `_data` があるディレクトリをリポジトリルートとみなす。
 */
export function resolveProjectRootFrom(startDir: string): string {
  let dir = path.resolve(startDir)
  for (let i = 0; i < 10; i++) {
    if (hasRepoMarkers(dir)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(startDir)
}

/** 実行時カレントからリポジトリルートを推定 */
export function getProjectRoot(): string {
  const fromEnv = process.env.TOPPAGE_PROJECT_ROOT
  if (fromEnv && hasRepoMarkers(fromEnv)) {
    return path.resolve(fromEnv)
  }
  return resolveProjectRootFrom(process.cwd())
}
