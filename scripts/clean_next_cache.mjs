import { existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = resolve(root, ".next");

const RM_OPTS = { recursive: true, force: true, maxRetries: 12, retryDelay: 250 };

function removeDir(path) {
  if (!existsSync(path)) return;
  rmSync(path, RM_OPTS);
}

function pruneOldTrash() {
  for (const name of readdirSync(root)) {
    if (!name.startsWith(".next._trash_")) continue;
    const trash = resolve(root, name);
    try {
      removeDir(trash);
      console.log(`[clean] removed old ${name}`);
    } catch {
      // locked or OneDrive — leave for next run
    }
  }
}

function tryRemoveNext() {
  if (!existsSync(nextDir)) {
    console.log("[clean] .next not present, skip");
    return true;
  }
  try {
    removeDir(nextDir);
    console.log("[clean] removed .next");
    return true;
  } catch (err) {
    return err;
  }
}

pruneOldTrash();

const first = tryRemoveNext();
if (first === true) process.exit(0);

const trashName = `.next._trash_${Date.now()}`;
const trashDir = resolve(root, trashName);

try {
  renameSync(nextDir, trashDir);
  console.log(`[clean] renamed .next → ${trashName} (build will use a fresh .next)`);
} catch (renameErr) {
  console.error("[clean] failed to remove or rename .next");
  console.error(`  ${first?.code ?? first?.message ?? first}`);
  if (renameErr?.code) console.error(`  rename: ${renameErr.code} — ${renameErr.message}`);
  console.error(
    "  Hint: stop `npm run dev` (and any other process using .next), then retry `npm run build:clean`.",
  );
  process.exit(1);
}

try {
  removeDir(trashDir);
  console.log(`[clean] removed ${trashName}`);
} catch {
  console.warn(
    `[clean] could not delete ${trashName} (often OneDrive or a file lock). Safe to delete manually later.`,
  );
}
