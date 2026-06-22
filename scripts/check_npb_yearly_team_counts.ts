import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const bad: string[] = [];

for (const year of readdirSync('public/data/standings')) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1950 || y > 2025) continue;

  for (const league of ['CL', 'PL'] as const) {
    const path = join('public/data/standings', year, `${league}.json`);
    const j = JSON.parse(readFileSync(path, 'utf8'));
    const count = j.rows?.length ?? 0;

    if (count < 5 || count > 8) {
      bad.push(`${year} ${league}: ${count}`);
    }
  }
}

if (bad.length) {
  console.log('check needed:');
  console.log(bad.join('\n'));
  process.exit(1);
}

console.log('team count check OK');
