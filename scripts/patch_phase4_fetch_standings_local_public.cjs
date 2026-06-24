const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'lib', 'standings', 'fetchStandingsJson.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR: lib/standings/fetchStandingsJson.ts が見つかりません。');
  process.exit(1);
}

const backup = target + `.local-public-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const before = fs.readFileSync(target, 'utf8');
fs.writeFileSync(backup, before, 'utf8');

const next = `import type { StandingsLeague, TeamStandingsJson } from "./types"

export async function fetchStandingsJson(
  year: number,
  league: StandingsLeague
): Promise<TeamStandingsJson> {
  const path = \`/data/standings/\${year}/\${league}.json\`

  const res = await fetch(path, {
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(\`順位表データの取得に失敗しました: \${path}\`)
  }

  return res.json()
}
`;

fs.writeFileSync(target, next, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
